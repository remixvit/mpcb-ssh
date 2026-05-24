'use strict';
const net = require('net');
const { Client } = require('ssh2');
const { getDb } = require('../db/schema');
const { decrypt } = require('./crypto');

// tunnelId → { tcpServer, sshConn, connections: Set }
const activeTunnels = new Map();

async function startTunnel(tunnel, server, userId, decryptionKey) {
  if (activeTunnels.has(tunnel.id)) return; // already running

  const db = getDb();

  const connConfig = {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    readyTimeout: 20000,
    keepaliveInterval: 30000,
  };

  if (server.key_id && decryptionKey) {
    const keyRecord = db.prepare('SELECT * FROM ssh_keys WHERE id = ? AND user_id = ?').get(server.key_id, userId);
    if (!keyRecord) throw new Error('SSH key not found');
    const keyBuffer = Buffer.from(decryptionKey, 'base64');
    connConfig.privateKey = decrypt(keyRecord.encrypted_pem, keyRecord.iv, keyRecord.auth_tag, keyBuffer);
  } else if (server.password_encrypted && decryptionKey) {
    const keyBuffer = Buffer.from(decryptionKey, 'base64');
    connConfig.password = decrypt(server.password_encrypted, server.password_iv, server.password_auth_tag, keyBuffer);
  } else {
    throw new Error('No credentials available. Add an SSH key or password to the server.');
  }

  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connections = new Set();

    conn.on('ready', () => {
      if (tunnel.type === 'local') {
        const localHost = tunnel.local_host || '127.0.0.1';
        const tcpServer = net.createServer((socket) => {
          conn.forwardOut(localHost, tunnel.local_port, tunnel.remote_host, tunnel.remote_port, (err, stream) => {
            if (err) { socket.destroy(); return; }
            socket.pipe(stream);
            stream.pipe(socket);
            connections.add(socket);
            socket.on('close', () => connections.delete(socket));
            stream.on('close', () => { try { socket.destroy(); } catch {} });
          });
        });

        tcpServer.listen(tunnel.local_port, localHost, () => {
          activeTunnels.set(tunnel.id, { tcpServer, sshConn: conn, connections });
          resolve();
        });

        tcpServer.on('error', (err) => { conn.end(); reject(err); });

      } else if (tunnel.type === 'remote') {
        conn.forwardIn(tunnel.remote_host || '0.0.0.0', tunnel.remote_port, (err) => {
          if (err) { conn.end(); reject(err); return; }
          activeTunnels.set(tunnel.id, { tcpServer: null, sshConn: conn, connections });
          resolve();
        });

        conn.on('tcp connection', (info, accept) => {
          const stream = accept();
          const socket = net.connect(tunnel.local_port, tunnel.local_host || '127.0.0.1', () => {
            stream.pipe(socket);
            socket.pipe(stream);
          });
          connections.add(socket);
          socket.on('close', () => connections.delete(socket));
        });

      } else {
        conn.end();
        reject(new Error(`Tunnel type '${tunnel.type}' is not supported yet.`));
      }
    });

    conn.on('error', (err) => {
      activeTunnels.delete(tunnel.id);
      reject(err);
    });

    conn.on('end', () => activeTunnels.delete(tunnel.id));

    conn.connect(connConfig);
  });
}

function stopTunnel(tunnelId) {
  const active = activeTunnels.get(tunnelId);
  if (!active) return;
  for (const socket of active.connections) try { socket.destroy(); } catch {}
  try { active.tcpServer?.close(); } catch {}
  try { active.sshConn?.end(); } catch {}
  activeTunnels.delete(tunnelId);
}

function isActive(tunnelId) {
  return activeTunnels.has(tunnelId);
}

module.exports = { startTunnel, stopTunnel, isActive };
