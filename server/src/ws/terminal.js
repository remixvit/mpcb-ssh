const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// active terminal sessions: sessionId → { ws, sshStream, sshConn }
const sessions = new Map();

function handleConnection(ws, request) {
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {
      case 'terminal:open':  return handleOpen(ws, msg);
      case 'terminal:input': return handleInput(msg);
      case 'terminal:resize': return handleResize(msg);
      case 'terminal:close': return handleClose(msg.sessionId);
    }
  });

  ws.on('close', () => {
    // clean up sessions belonging to this ws
    for (const [id, session] of sessions) {
      if (session.ws === ws) handleClose(id);
    }
  });
}

function handleOpen(ws, msg) {
  // Verify JWT
  let user;
  try {
    const payload = jwt.verify(msg.token, process.env.JWT_SECRET);
    user = { id: payload.sub, username: payload.username };
  } catch {
    ws.send(JSON.stringify({ type: 'terminal:error', error: 'Unauthorized' }));
    return;
  }

  const sessionId = uuidv4();
  sessions.set(sessionId, { ws, sshConn: null, sshStream: null, userId: user.id, serverId: msg.serverId });

  ws.send(JSON.stringify({ type: 'terminal:opened', sessionId }));

  // TODO: Phase 1 — open ssh2 connection using msg.serverId and msg.decryptionKey
  // For now send a placeholder message
  ws.send(JSON.stringify({ type: 'terminal:data', sessionId, data: 'SSH terminal — coming in Phase 1\r\n' }));
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
  session.sshStream?.close();
  session.sshConn?.end();
  sessions.delete(sessionId);
}

module.exports = { handleConnection };
