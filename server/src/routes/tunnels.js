const express = require('express');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');
const { startTunnel, stopTunnel, isActive } = require('../services/tunnelManager');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const tunnels = getDb()
    .prepare(`SELECT t.*, s.name as server_name
              FROM tunnels t
              LEFT JOIN servers s ON s.id = t.server_id
              WHERE t.user_id = ?
              ORDER BY t.name`)
    .all(req.user.id);

  res.json(tunnels.map(t => ({ ...t, status: isActive(t.id) ? 'active' : 'idle' })));
});

router.post('/', (req, res) => {
  const { server_id, name, type, local_host, local_port, remote_host, remote_port, socks_port, auto_start } = req.body;
  if (!server_id || !name || !type) {
    return res.status(400).json({ error: 'server_id, name and type are required' });
  }

  const result = getDb().prepare(`
    INSERT INTO tunnels (user_id, server_id, name, type, local_host, local_port, remote_host, remote_port, socks_port, auto_start)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, server_id, name, type, local_host || '127.0.0.1', local_port, remote_host, remote_port, socks_port, auto_start ? 1 : 0);

  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const tunnel = db.prepare('SELECT id FROM tunnels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!tunnel) return res.status(404).json({ error: 'Not found' });

  const { name, type, local_host, local_port, remote_host, remote_port, socks_port, auto_start } = req.body;
  db.prepare(`
    UPDATE tunnels SET name=?, type=?, local_host=?, local_port=?, remote_host=?, remote_port=?, socks_port=?, auto_start=?
    WHERE id=?
  `).run(name, type, local_host, local_port, remote_host, remote_port, socks_port, auto_start ? 1 : 0, req.params.id);

  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM tunnels WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  stopTunnel(parseInt(req.params.id));
  res.json({ ok: true });
});

router.post('/:id/start', async (req, res) => {
  const db = getDb();
  const tunnel = db.prepare('SELECT * FROM tunnels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!tunnel) return res.status(404).json({ error: 'Not found' });

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(tunnel.server_id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const { decryptionKey } = req.body;

  try {
    await startTunnel(tunnel, server, req.user.id, decryptionKey);
    res.json({ ok: true, status: 'active' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stop', (req, res) => {
  const tunnel = getDb().prepare('SELECT id FROM tunnels WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!tunnel) return res.status(404).json({ error: 'Not found' });

  stopTunnel(parseInt(req.params.id));
  res.json({ ok: true, status: 'idle' });
});

module.exports = router;
