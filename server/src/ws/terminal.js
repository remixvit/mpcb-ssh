const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { Client } = require('ssh2');
const { getDb } = require('../db/schema');
const { decrypt } = require('../services/crypto');

// sessionId → { ws, sshConn, sshStream, userId }
const sessions = new Map();

function handleConnection(ws) {
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {
      case 'terminal:open':   return handleOpen(ws, msg);
      case 'terminal:input':  return handleInput(msg);
      case 'terminal:resize': return handleResize(msg);
      case 'terminal:close':  return handleClose(msg.sessionId);
    }
  });

  ws.on('close', () => {
    for (const [id, session] of sessions) {
      if (session.ws === ws) handleClose(id);
    }
  });
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function writeToTerminal(ws, sessionId, data) {
  // Always send as base64 so binary SSH data survives JSON transport
  const b64 = Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data, 'binary').toString('base64');
  send(ws, { type: 'terminal:data', sessionId, data: b64 });
}

async function handleOpen(ws, msg) {
  let user;
  try {
    const payload = jwt.verify(msg.token, process.env.JWT_SECRET);
    user = { id: payload.sub, username: payload.username };
  } catch {
    send(ws, { type: 'terminal:error', error: 'Unauthorized' });
    return;
  }

  const db = getDb();
  const server = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(msg.serverId, user.id);
  if (!server) {
    send(ws, { type: 'terminal:error', error: 'Server not found' });
    return;
  }

  const sessionId = uuidv4();
  sessions.set(sessionId, { ws, sshConn: null, sshStream: null, userId: user.id });
  send(ws, { type: 'terminal:opened', sessionId });
  writeToTerminal(ws, sessionId, `\x1b[90mConnecting to ${server.username}@${server.host}:${server.port}...\x1b[0m\r\n`);

  // Build ssh2 connection config
  const connConfig = {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    readyTimeout: 20000,
    keepaliveInterval: 30000,
  };

  // Auth: SSH key or password
  if (server.key_id && msg.decryptionKey) {
    try {
      const keyRecord = db.prepare('SELECT * FROM ssh_keys WHERE id = ? AND user_id = ?').get(server.key_id, user.id);
      if (!keyRecord) throw new Error('SSH key not found');
      const keyBuffer = Buffer.from(msg.decryptionKey, 'base64');
      connConfig.privateKey = decrypt(keyRecord.encrypted_pem, keyRecord.iv, keyRecord.auth_tag, keyBuffer);
    } catch (err) {
      writeToTerminal(ws, sessionId, `\x1b[31mFailed to decrypt SSH key: ${err.message}\x1b[0m\r\n`);
      sessions.delete(sessionId);
      return;
    }
  } else if (server.password_encrypted && msg.decryptionKey) {
    try {
      const keyBuffer = Buffer.from(msg.decryptionKey, 'base64');
      connConfig.password = decrypt(server.password_encrypted, server.password_iv, server.password_auth_tag, keyBuffer);
    } catch (err) {
      writeToTerminal(ws, sessionId, `\x1b[31mFailed to decrypt password: ${err.message}\x1b[0m\r\n`);
      sessions.delete(sessionId);
      return;
    }
  } else {
    writeToTerminal(ws, sessionId, `\x1b[31mNo credentials available. Upload an SSH key or set a password.\x1b[0m\r\n`);
    sessions.delete(sessionId);
    return;
  }

  const conn = new Client();
  sessions.get(sessionId).sshConn = conn;

  conn.on('ready', () => {
    writeToTerminal(ws, sessionId, `\x1b[32mConnected!\x1b[0m\r\n`);

    conn.shell({ term: 'xterm-256color', cols: msg.cols || 80, rows: msg.rows || 24 }, (err, stream) => {
      if (err) {
        writeToTerminal(ws, sessionId, `\x1b[31mShell error: ${err.message}\x1b[0m\r\n`);
        conn.end();
        return;
      }

      const session = sessions.get(sessionId);
      if (session) session.sshStream = stream;

      stream.on('data', (data) => {
        writeToTerminal(ws, sessionId, data);
      });

      stream.stderr.on('data', (data) => {
        writeToTerminal(ws, sessionId, data);
      });

      stream.on('close', () => {
        writeToTerminal(ws, sessionId, '\r\n\x1b[90mConnection closed.\x1b[0m\r\n');
        conn.end();
        sessions.delete(sessionId);
      });
    });
  });

  conn.on('error', (err) => {
    writeToTerminal(ws, sessionId, `\x1b[31mSSH error: ${err.message}\x1b[0m\r\n`);
    sessions.delete(sessionId);
  });

  conn.on('end', () => {
    sessions.delete(sessionId);
  });

  // Handle jump server (ProxyJump)
  if (server.jump_server_id) {
    setupJumpConnection(conn, connConfig, server, user.id, msg.decryptionKey, ws, sessionId, db);
  } else {
    conn.connect(connConfig);
  }
}

function setupJumpConnection(conn, connConfig, server, userId, decryptionKey, ws, sessionId, db) {
  const jumpServer = db.prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?').get(server.jump_server_id, userId);
  if (!jumpServer) {
    writeToTerminal(ws, sessionId, `\x1b[31mJump server not found\x1b[0m\r\n`);
    sessions.delete(sessionId);
    return;
  }

  const jumpConfig = {
    host: jumpServer.host,
    port: jumpServer.port || 22,
    username: jumpServer.username,
    readyTimeout: 20000,
  };

  if (jumpServer.key_id && decryptionKey) {
    try {
      const db2 = getDb();
      const keyRecord = db2.prepare('SELECT * FROM ssh_keys WHERE id = ? AND user_id = ?').get(jumpServer.key_id, userId);
      const keyBuffer = Buffer.from(decryptionKey, 'base64');
      jumpConfig.privateKey = decrypt(keyRecord.encrypted_pem, keyRecord.iv, keyRecord.auth_tag, keyBuffer);
    } catch {}
  }

  const jumpConn = new Client();
  jumpConn.on('ready', () => {
    jumpConn.forwardOut('127.0.0.1', 0, server.host, server.port || 22, (err, stream) => {
      if (err) {
        writeToTerminal(ws, sessionId, `\x1b[31mJump forward error: ${err.message}\x1b[0m\r\n`);
        jumpConn.end();
        sessions.delete(sessionId);
        return;
      }
      conn.connect({ ...connConfig, sock: stream });
    });
  });

  jumpConn.on('error', (err) => {
    writeToTerminal(ws, sessionId, `\x1b[31mJump SSH error: ${err.message}\x1b[0m\r\n`);
    sessions.delete(sessionId);
  });

  jumpConn.connect(jumpConfig);
}

function handleInput(msg) {
  const session = sessions.get(msg.sessionId);
  if (!session?.sshStream) return;
  session.sshStream.write(msg.data);
}

function handleResize(msg) {
  const session = sessions.get(msg.sessionId);
  if (!session?.sshStream) return;
  session.sshStream.setWindow(msg.rows, msg.cols, 0, 0);
}

function handleClose(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  try { session.sshStream?.close(); } catch {}
  try { session.sshConn?.end(); } catch {}
  sessions.delete(sessionId);
}

module.exports = { handleConnection };
