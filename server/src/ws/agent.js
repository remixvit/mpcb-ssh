'use strict';
const { Duplex }  = require('stream');
const { randomUUID } = require('crypto');
const bcrypt    = require('bcrypt');
const { getDb } = require('../db/schema');
const { sendTelegram } = require('../utils/telegram');

// agentId → { ws, userId, cpu, mem, disk, uptime, load1, load5, load15, rxBps, txBps, proxies, pending }
const connected = new Map();

async function handleAgentConnection(ws, req) {
  const url   = new URL(req.url, 'http://localhost');
  const id    = parseInt(url.searchParams.get('id'),  10);
  const token = url.searchParams.get('token');

  if (!id || !token) {
    ws.close(4001, 'Missing id or token');
    return;
  }

  const db    = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  if (!agent) {
    ws.close(4004, 'Agent not found');
    return;
  }

  let valid = false;
  try { valid = await bcrypt.compare(token, agent.token_hash); } catch {}
  if (!valid) {
    ws.close(4003, 'Invalid token');
    return;
  }

  // Prefer X-Forwarded-For (behind reverse proxy) then socket IP
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || null;

  connected.set(id, {
    ws, userId: agent.user_id, ip,
    cpu: null, mem: null, disk: null,
    uptime: null, load1: null, load5: null, load15: null,
    rxBps: null, txBps: null,
    proxies: new Map(), // connId → Duplex stream
    pending: new Map(), // connId → { resolve, reject }
  });
  db.prepare('UPDATE agents SET last_seen = unixepoch() WHERE id = ?').run(id);
  console.log(`[agent:ws] ${agent.name} (#${id}) connected`);
  fireStatusAlert(id, agent.user_id, agent.name, true).catch(() => {});

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const entry = connected.get(id);
    if (!entry) return;

    switch (msg.type) {
      case 'agent:hello':
        db.prepare('UPDATE agents SET hostname=?, platform=?, last_seen=unixepoch() WHERE id=?')
          .run(msg.hostname ?? null, msg.platform ?? null, id);
        break;

      case 'agent:ping':
      case 'agent:pong':
        entry.cpu    = msg.cpu    ?? null;
        entry.mem    = msg.mem    ?? null;
        entry.disk   = msg.disk   ?? null;
        entry.uptime = msg.uptime ?? null;
        entry.load1  = msg.load1  ?? null;
        entry.load5  = msg.load5  ?? null;
        entry.load15 = msg.load15 ?? null;
        entry.rxBps  = msg.rxBps  ?? null;
        entry.txBps  = msg.txBps  ?? null;
        db.prepare('UPDATE agents SET last_seen=unixepoch() WHERE id=?').run(id);
        fireAlerts(id, agent.user_id, agent.name, {
          cpu: entry.cpu, mem: entry.mem, disk: entry.disk,
        }).catch(() => {});
        break;

      // ── Proxy responses from agent ──────────────────────────────────────────
      case 'proxy:connected': {
        const cb = entry.pending.get(msg.id);
        if (cb) { cb.resolve(); entry.pending.delete(msg.id); }
        break;
      }

      case 'proxy:error': {
        const cb = entry.pending.get(msg.id);
        if (cb) { cb.reject(new Error(msg.error)); entry.pending.delete(msg.id); }
        const stream = entry.proxies.get(msg.id);
        if (stream) { stream.destroy(new Error(msg.error)); entry.proxies.delete(msg.id); }
        break;
      }

      case 'proxy:data': {
        entry.proxies.get(msg.id)?.push(Buffer.from(msg.data, 'base64'));
        break;
      }

      case 'proxy:close': {
        const stream = entry.proxies.get(msg.id);
        if (stream) { stream.push(null); entry.proxies.delete(msg.id); }
        break;
      }
    }
  });

  ws.on('close', () => {
    const entry = connected.get(id);
    if (entry) {
      for (const stream of entry.proxies.values()) stream.destroy();
      for (const cb of entry.pending.values()) cb.reject(new Error('Agent disconnected'));
    }
    connected.delete(id);
    console.log(`[agent:ws] ${agent.name} (#${id}) disconnected`);
    fireStatusAlert(id, agent.user_id, agent.name, false).catch(() => {});
  });

  ws.on('error', () => {});
}

function isOnline(agentId) {
  const e = connected.get(agentId);
  return !!(e && e.ws.readyState === 1);
}

function getStats(agentId) {
  const e = connected.get(agentId);
  if (!e) return {};
  return {
    ip: e.ip,
    cpu: e.cpu, mem: e.mem, disk: e.disk,
    uptime: e.uptime,
    load1: e.load1, load5: e.load5, load15: e.load15,
    rxBps: e.rxBps, txBps: e.txBps,
  };
}

/**
 * Opens a proxied TCP connection through an online agent.
 * Returns a Duplex stream usable as ssh2's `sock` option.
 */
function createProxyStream(agentId, host, port) {
  return new Promise((resolve, reject) => {
    const entry = connected.get(agentId);
    if (!entry || entry.ws.readyState !== 1) {
      return reject(new Error('Agent is offline'));
    }

    const connId = randomUUID();

    const stream = new Duplex({
      read() {},
      write(chunk, _enc, cb) {
        if (entry.ws.readyState === 1) {
          entry.ws.send(JSON.stringify({
            type: 'proxy:data', id: connId,
            data: chunk.toString('base64'),
          }));
        }
        cb();
      },
      final(cb) {
        if (entry.ws.readyState === 1) {
          entry.ws.send(JSON.stringify({ type: 'proxy:close', id: connId }));
        }
        entry.proxies.delete(connId);
        cb();
      },
    });

    stream.on('error', () => entry.proxies.delete(connId));

    entry.pending.set(connId, {
      resolve: () => {
        entry.proxies.set(connId, stream);
        resolve(stream);
      },
      reject: (err) => reject(err),
    });

    // Timeout if agent doesn't respond
    setTimeout(() => {
      if (entry.pending.has(connId)) {
        entry.pending.delete(connId);
        reject(new Error('Agent proxy connect timeout'));
      }
    }, 10_000);

    entry.ws.send(JSON.stringify({ type: 'proxy:connect', id: connId, host, port }));
  });
}

// ── Alert helpers ────────────────────────────────────────────────────────────

async function fireAlerts(agentId, userId, agentName, metrics) {
  const db  = getDb();
  const now = Math.floor(Date.now() / 1000);

  const user = db.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').get(userId);
  if (!user?.telegram_chat_id) return;

  const rules = db.prepare(`
    SELECT * FROM alert_rules
    WHERE user_id = ? AND enabled = 1
      AND (agent_id = ? OR agent_id IS NULL)
      AND type IN ('cpu','mem','disk')
  `).all(userId, agentId);

  for (const rule of rules) {
    const val = metrics[rule.type];
    if (val == null || val < rule.threshold) continue;
    if (now - (rule.last_fired || 0) < rule.cooldown) continue;

    const label = { cpu: 'CPU', mem: 'RAM', disk: 'Disk' }[rule.type];
    await sendTelegram(user.telegram_chat_id,
      `⚠️ <b>${agentName}</b> — ${label} <b>${Math.round(val)}%</b> (порог: ${rule.threshold}%)`
    );
    db.prepare('UPDATE alert_rules SET last_fired = ? WHERE id = ?').run(now, rule.id);
  }
}

async function fireStatusAlert(agentId, userId, agentName, online) {
  const db  = getDb();
  const now = Math.floor(Date.now() / 1000);

  const user = db.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').get(userId);
  if (!user?.telegram_chat_id) return;

  const type = online ? 'online' : 'offline';
  const rules = db.prepare(`
    SELECT * FROM alert_rules
    WHERE user_id = ? AND enabled = 1
      AND (agent_id = ? OR agent_id IS NULL)
      AND type = ?
  `).all(userId, agentId, type);

  for (const rule of rules) {
    if (now - (rule.last_fired || 0) < rule.cooldown) continue;
    const icon = online ? '🟢' : '🔴';
    await sendTelegram(user.telegram_chat_id,
      `${icon} <b>${agentName}</b> — ${online ? 'вернулся онлайн' : 'ушёл офлайн'}`
    );
    db.prepare('UPDATE alert_rules SET last_fired = ? WHERE id = ?').run(now, rule.id);
  }
}

module.exports = { handleAgentConnection, isOnline, getStats, createProxyStream };
