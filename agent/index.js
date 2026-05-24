#!/usr/bin/env node
'use strict';

const WebSocket    = require('ws');
const os           = require('os');
const fs           = require('fs');
const { execSync } = require('child_process');

// ── Config ───────────────────────────────────────────────────────────────────
function flag(name) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : undefined;
}

const SERVER_URL = process.env.MPCB_SERVER || flag('server') || '';
const AGENT_ID   = process.env.MPCB_ID     || flag('id')     || '';
const TOKEN      = process.env.MPCB_TOKEN  || flag('token')  || '';
const NAME       = process.env.MPCB_NAME   || flag('name')   || os.hostname();
const VERSION    = '1.2.0';

if (!SERVER_URL || !AGENT_ID || !TOKEN) {
  console.error(
    'MPCB SSH Agent\n' +
    'Usage: node index.js --server=https://... --id=<id> --token=<token> [--name=<label>]\n' +
    'Or set env vars: MPCB_SERVER, MPCB_ID, MPCB_TOKEN, MPCB_NAME'
  );
  process.exit(1);
}

// ── Disk stats ────────────────────────────────────────────────────────────────
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

// ── Network stats (bytes/sec delta) ──────────────────────────────────────────
let _prevNet   = null;
let _prevNetTs = 0;

function readRawNet() {
  try {
    if (process.platform === 'linux') {
      const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n');
      let rx = 0, tx = 0;
      for (const line of lines.slice(2)) {
        const p = line.trim().split(/\s+/);
        if (p.length < 10) continue;
        const iface = p[0].replace(':', '');
        if (iface === 'lo') continue; // skip loopback
        rx += parseInt(p[1])  || 0;
        tx += parseInt(p[9])  || 0;
      }
      return { rx, tx };
    } else if (process.platform === 'darwin') {
      const raw = execSync(
        "netstat -ib | awk 'NR>1 && !/^lo/ && !/Name/{rx+=$7; tx+=$10} END{print rx,tx}'",
        { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString().trim();
      const [rx, tx] = raw.split(/\s+/).map(Number);
      return isNaN(rx) ? null : { rx, tx };
    } else if (process.platform === 'win32') {
      const raw = execSync('netstat -e',
        { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString();
      const m = raw.match(/Bytes\s+(\d+)\s+(\d+)/i);
      return m ? { rx: parseInt(m[1]), tx: parseInt(m[2]) } : null;
    }
  } catch {}
  return null;
}

function getNetStats() {
  const now  = Date.now();
  const curr = readRawNet();
  const prev = _prevNet;
  const prevTs = _prevNetTs;
  _prevNet   = curr;
  _prevNetTs = now;
  if (!curr || !prev || prevTs === 0) return null;
  const elapsed = (now - prevTs) / 1000;
  if (elapsed <= 0) return null;
  return {
    rxBps: Math.round(Math.max(0, curr.rx - prev.rx) / elapsed),
    txBps: Math.round(Math.max(0, curr.tx - prev.tx) / elapsed),
  };
}

// ── Combined stats ────────────────────────────────────────────────────────────
function getStats() {
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const mem      = Math.round((1 - freeMem / totalMem) * 100);
  const loadavg  = os.loadavg();
  const cores    = os.cpus().length;
  const cpu      = Math.min(100, Math.round((loadavg[0] / cores) * 100));
  const disk     = getDiskPct();
  const uptime   = Math.round(os.uptime());
  const hasLoad  = loadavg[0] > 0 || loadavg[1] > 0; // always 0 on Windows
  const net      = getNetStats();
  return {
    cpu, mem, disk, uptime,
    load1:  hasLoad ? +loadavg[0].toFixed(2) : null,
    load5:  hasLoad ? +loadavg[1].toFixed(2) : null,
    load15: hasLoad ? +loadavg[2].toFixed(2) : null,
    rxBps:  net?.rxBps ?? null,
    txBps:  net?.txBps ?? null,
  };
}

// ── WebSocket connection ──────────────────────────────────────────────────────
let pingTimer      = null;
let reconnectTimer = null;
let reconnectDelay = 5_000;

function buildUrl() {
  const base = SERVER_URL
    .replace(/\/$/, '')
    .replace(/^https:/, 'wss:')
    .replace(/^http:/, 'ws:');
  return `${base}/ws/agent?id=${encodeURIComponent(AGENT_ID)}&token=${encodeURIComponent(TOKEN)}`;
}

function connect() {
  console.log(`[mpcb-agent] Connecting to ${SERVER_URL} (id=${AGENT_ID})…`);
  const ws = new WebSocket(buildUrl(), { rejectUnauthorized: false });

  ws.on('open', () => {
    reconnectDelay = 5_000;
    clearTimeout(reconnectTimer);
    console.log('[mpcb-agent] Connected ✓');

    ws.send(JSON.stringify({
      type:     'agent:hello',
      name:     NAME,
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      version:  VERSION,
    }));

    // Seed net baseline so first ping has a valid delta
    readRawNet();
    _prevNetTs = Date.now();

    pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'agent:ping', ...getStats() }));
    }, 30_000);
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'server:ping') {
      ws.send(JSON.stringify({ type: 'agent:pong', ...getStats() }));
    }
  });

  ws.on('close', (code) => {
    clearInterval(pingTimer);
    pingTimer = null;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    console.log(`[mpcb-agent] Disconnected (${code}). Reconnecting in ${delay / 1000}s…`);
    reconnectTimer = setTimeout(connect, delay);
  });

  ws.on('error', (err) => console.error(`[mpcb-agent] ${err.message}`));
}

process.on('SIGINT',  () => { console.log('[mpcb-agent] Shutting down'); process.exit(0); });
process.on('SIGTERM', () => { console.log('[mpcb-agent] Shutting down'); process.exit(0); });

connect();
