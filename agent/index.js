#!/usr/bin/env node
'use strict';

const WebSocket = require('ws');
const args = parseArgs(process.argv.slice(2));

if (!args.server || !args.token) {
  console.error('Usage: mpcb-agent --server wss://host --token TOKEN [--name NAME]');
  process.exit(1);
}

const CONFIG = {
  server: args.server,
  token: args.token,
  name: args.name || require('os').hostname(),
};

const activeTunnels = new Map();
let ws;
let reconnectDelay = 1000;

function connect() {
  console.log(`[agent] Connecting to ${CONFIG.server}...`);
  ws = new WebSocket(CONFIG.server);

  ws.on('open', () => {
    reconnectDelay = 1000;
    console.log('[agent] Connected');
    ws.send(JSON.stringify({
      type: 'agent:hello',
      token: CONFIG.token,
      platform: process.platform,
      hostname: require('os').hostname(),
      name: CONFIG.name,
    }));
  });

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    console.log(`[agent] <- ${msg.type}`);

    switch (msg.type) {
      case 'tunnel:start': return startTunnel(msg);
      case 'tunnel:stop':  return stopTunnel(msg.tunnelId);
      case 'ping':         ws.send(JSON.stringify({ type: 'pong' })); break;
    }
  });

  ws.on('close', () => {
    console.log(`[agent] Disconnected. Reconnecting in ${reconnectDelay / 1000}s...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  });

  ws.on('error', (err) => console.error('[agent] WS error:', err.message));
}

// Keep-alive ping
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }));
  }
}, 30000);

function startTunnel(msg) {
  const { tunnelId, config } = msg;
  if (activeTunnels.has(tunnelId)) return sendStatus(tunnelId, 'active');

  // TODO: Phase 3 — open ssh2 tunnel locally
  console.log(`[agent] TODO: start tunnel ${tunnelId}`, config);
  sendStatus(tunnelId, 'active');
}

function stopTunnel(tunnelId) {
  const tunnel = activeTunnels.get(tunnelId);
  if (tunnel) {
    tunnel.close?.();
    activeTunnels.delete(tunnelId);
  }
  sendStatus(tunnelId, 'stopped');
}

function sendStatus(tunnelId, status, error) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'tunnel:status', tunnelId, status, error }));
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

connect();
