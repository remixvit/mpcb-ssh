const express = require('express');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const servers = getDb()
    .prepare('SELECT * FROM servers WHERE user_id = ? ORDER BY name')
    .all(req.user.id);
  res.json(servers.map(s => ({ ...s, tags: s.tags ? JSON.parse(s.tags) : [] })));
});

router.post('/', (req, res) => {
  const { name, host, port = 22, username, key_id, tags, color, jump_server_id, proxy_agent_id } = req.body;
  if (!name || !host || !username) {
    return res.status(400).json({ error: 'name, host and username are required' });
  }
  const result = getDb().prepare(`
    INSERT INTO servers (user_id, name, host, port, username, key_id, tags, color, jump_server_id, proxy_agent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name, host, port, username, key_id || null, JSON.stringify(tags || []), color || null, jump_server_id || null, proxy_agent_id || null);

  res.status(201).json({ id: result.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const server = getDb()
    .prepare('SELECT * FROM servers WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: 'Not found' });
  res.json({ ...server, tags: server.tags ? JSON.parse(server.tags) : [] });
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const server = db.prepare('SELECT id FROM servers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: 'Not found' });

  const { name, host, port, username, key_id, tags, color, jump_server_id, proxy_agent_id } = req.body;
  db.prepare(`
    UPDATE servers SET name=?, host=?, port=?, username=?, key_id=?, tags=?, color=?, jump_server_id=?, proxy_agent_id=?
    WHERE id=?
  `).run(name, host, port, username, key_id || null, JSON.stringify(tags || []), color || null, jump_server_id || null, proxy_agent_id || null, req.params.id);

  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM servers WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
