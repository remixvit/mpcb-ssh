'use strict';
const bcrypt    = require('bcrypt');
const { getDb } = require('../db/schema');

// agentId (number) → { ws, userId, cpu, mem, disk, uptime, load1, load5, load15 }
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

  // Verify token against stored bcrypt hash
  let valid = false;
  try { valid = await bcrypt.compare(token, agent.token_hash); } catch {}
  if (!valid) {
    ws.close(4003, 'Invalid token');
    return;
  }

  // Register as online
  connected.set(id, {
    ws, userId: agent.user_id,
    cpu: null, mem: null, disk: null,
    uptime: null, load1: null, load5: null, load15: null,
  });
  db.prepare('UPDATE agents SET last_seen = unixepoch() WHERE id = ?').run(id);
  console.log(`[agent:ws] ${agent.name} (#${id}) connected`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'agent:hello':
        db.prepare('UPDATE agents SET hostname=?, platform=?, last_seen=unixepoch() WHERE id=?')
          .run(msg.hostname ?? null, msg.platform ?? null, id);
        break;

      case 'agent:ping':
      case 'agent:pong': {
        const entry = connected.get(id);
        if (entry) {
          entry.cpu    = msg.cpu    ?? null;
          entry.mem    = msg.mem    ?? null;
          entry.disk   = msg.disk   ?? null;
          entry.uptime = msg.uptime ?? null;
          entry.load1  = msg.load1  ?? null;
          entry.load5  = msg.load5  ?? null;
          entry.load15 = msg.load15 ?? null;
        }
        db.prepare('UPDATE agents SET last_seen=unixepoch() WHERE id=?').run(id);
        break;
      }
    }
  });

  ws.on('close', () => {
    connected.delete(id);
    console.log(`[agent:ws] ${agent.name} (#${id}) disconnected`);
  });

  ws.on('error', () => {}); // errors also trigger close
}

/** Returns true if agent is currently connected */
function isOnline(agentId) {
  const e = connected.get(agentId);
  return !!(e && e.ws.readyState === 1 /* WebSocket.OPEN */);
}

/** Returns stats for a connected agent, or {} */
function getStats(agentId) {
  const e = connected.get(agentId);
  if (!e) return {};
  return {
    cpu: e.cpu, mem: e.mem, disk: e.disk,
    uptime: e.uptime,
    load1: e.load1, load5: e.load5, load15: e.load15,
  };
}

module.exports = { handleAgentConnection, isOnline, getStats };
