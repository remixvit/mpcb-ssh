#!/usr/bin/env node
'use strict';

const WebSocket  = require('ws');
const os         = require('os');
const { execSync } = require('child_process');

// ── Config ───────────────────────────────────────────────────────────────────
// Supports both env vars (systemd) and CLI flags (manual run)
function flag(name) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

const SERVER_URL = process.env.MPCB_SERVER || flag('server') || '';
const AGENT_ID   = process.env.MPCB_ID     || flag('id')     || '';
const TOKEN      = process.env.MPCB_TOKEN  || flag('token')  || '';
const NAME       = process.env.MPCB_NAME   || flag('name')   || os.hostname();
const VERSION    = '1.1.0';

if (!SERVER_URL || !AGENT_ID || !TOKEN) {
  console.error(
    'MPCB SSH Agent\n' +
    'Usage: node index.js --server=https://... --id=<id> --token=<token> [--name=<label>]\n' +
    'Or set env vars: MPCB_SERVER, MPCB_ID, MPCB_TOKEN, MPCB_NAME'
  );
  process.exit(1);
}

// ── System stats ─────────────────────────────────────────────────────────────
function getDiskPct() {
  try {
    if (process.platform === 'win32') {
      const raw = execSync(
        'powershell -NoProfile -Command "(Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json)"',
        { timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString().trim();
      const d = JSON.parse(raw);
      const total = (d.Used ?? 0) + (d.Free ?? 0);
      return total > 0 ? Math.round(d.Used / total * 100) : null;
    } else {
      const raw = execSync("df -k / | awk 'NR==2{print $2,$3}'",
        { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString().trim();
      const [total, used] = raw.split(/\s+/).map(Number);
      return total > 0 ? Math.round(used / total * 100) : null;
    }
  } catch { return null; }
}

function getStats() {
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const mem      = Math.round((1 - freeMem / totalMem) * 100);
  const loadavg  = os.loadavg();
  const cores    = os.cpus().length;
  const cpu      = Math.min(100, Math.round((loadavg[0] / cores) * 100));
  const disk     = getDiskPct();
  const uptime   = Math.round(os.uptime());
  // loadavg is [0,0,0] on Windows — omit to avoid confusion
  const hasLoad  = loadavg[0] > 0 || loadavg[1] > 0;
  return {
    cpu, mem, disk, uptime,
    load1:  hasLoad ? +loadavg[0].toFixed(2) : null,
    load5:  hasLoad ? +loadavg[1].toFixed(2) : null,
    load15: hasLoad ? +loadavg[2].toFixed(2) : null,
  };
}

// ── WebSocket connection ──────────────────────────────────────────────────────
let pingTimer      = null;
let reconnectTimer = null;
let reconnectDelay = 5_000;   // starts at 5 s, doubles to 30 s max

function buildUrl() {
  const base = SERVER_URL
    .replace(/\/$/, '')
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:');
  return `${base}/ws/agent?id=${encodeURIComponent(AGENT_ID)}&token=${encodeURIComponent(TOKEN)}`;
}

function connect() {
  const url = buildUrl();
  console.log(`[mpcb-agent] Connecting to ${SERVER_URL} (id=${AGENT_ID})…`);

  const ws = new WebSocket(url, { rejectUnauthorized: false });

  ws.on('open', () => {
    reconnectDelay = 5_000;
    clearTimeout(reconnectTimer);
    console.log('[mpcb-agent] Connected ✓');

    // Introduce ourselves
    ws.send(JSON.stringify({
      type:     'agent:hello',
      name:     NAME,
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      version:  VERSION,
    }));

    // Heartbeat + stats every 30 s
    pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'agent:ping', ...getStats() }));
    }, 30_000);
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'server:ping':
        ws.send(JSON.stringify({ type: 'agent:pong', ...getStats() }));
        break;
    }
  });

  ws.on('close', (code, reason) => {
    clearInterval(pingTimer);
    pingTimer = null;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    console.log(`[mpcb-agent] Disconnected (${code}). Reconnecting in ${delay / 1000}s…`);
    reconnectTimer = setTimeout(connect, delay);
  });

  ws.on('error', (err) => {
    // 'close' fires after 'error' — reconnect is handled there
    console.error(`[mpcb-agent] ${err.message}`);
  });
}

process.on('SIGINT',  () => { console.log('[mpcb-agent] Shutting down'); process.exit(0); });
process.on('SIGTERM', () => { console.log('[mpcb-agent] Shutting down'); process.exit(0); });

connect();
