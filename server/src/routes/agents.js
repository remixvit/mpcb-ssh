const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const agents = getDb()
    .prepare('SELECT id, user_id, name, platform, hostname, last_seen, created_at FROM agents WHERE user_id = ?')
    .all(req.user.id);
  res.json(agents);
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, 10);

  const result = getDb()
    .prepare('INSERT INTO agents (user_id, name, token_hash) VALUES (?, ?, ?)')
    .run(req.user.id, name, tokenHash);

  // Token shown only once
  res.status(201).json({ id: result.lastInsertRowid, name, token });
});

router.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM agents WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
