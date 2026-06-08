require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { WebSocketServer } = require('ws');
const path = require('path');

const { initDb } = require('./db/schema');
const { handleConnection }       = require('./ws/terminal');
const { handleAgentConnection }  = require('./ws/agent');

const authRouter = require('./routes/auth');
const serversRouter = require('./routes/servers');
const keysRouter = require('./routes/keys');
const tunnelsRouter = require('./routes/tunnels');
const agentsRouter = require('./routes/agents');
const kioskRouter  = require('./routes/kiosk');
const alertsRouter = require('./routes/alerts');

const app = express();
const server = http.createServer(app);

// Init DB
const dbPath = process.env.DB_PATH || './data/db.sqlite';
initDb(path.resolve(dbPath));

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// REST API
app.use('/api/auth', authRouter);
app.use('/api/servers', serversRouter);
app.use('/api/keys', keysRouter);
app.use('/api/tunnels', tunnelsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/kiosk',  kioskRouter);
app.use('/api/alerts', alertsRouter);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// WebSocket — terminal
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', handleConnection);

// WebSocket — agent
const agentWss = new WebSocketServer({ noServer: true });
agentWss.on('connection', (ws, req) => handleAgentConnection(ws, req));

server.on('upgrade', (request, socket, head) => {
  const { url } = request;
  if (url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (url.startsWith('/ws/agent')) {
    agentWss.handleUpgrade(request, socket, head, (ws) => {
      agentWss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`mpcb-ssh server running on port ${PORT}`);
});
