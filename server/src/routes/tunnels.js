const express = require('express');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const tunnels = getDb()
    .prepare('SELECT * FROM tunnels WHERE user_id = ? ORDER BY name')
    .all(req.user.id);
  res.json(tunnels);
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
  res.json({ ok: true });
});

// TODO: Phase 3 — start/stop tunnel via agent
router.post('/:id/start', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));
router.post('/:id/stop', (req, res) => res.status(501).json({ error: 'Not implemented yet' }));

module.exports = router;
