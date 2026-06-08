'use strict';
const express = require('express');
const { getDb }        = require('../db/schema');
const { authenticate } = require('../middleware/auth');
const { sendTelegram } = require('../utils/telegram');

const router = express.Router();
router.use(authenticate);

// ── Alert rules CRUD ──────────────────────────────────────────────────────────

router.get('/rules', (req, res) => {
  const rules = getDb().prepare(`
    SELECT r.*, a.name as agent_name
    FROM alert_rules r
    LEFT JOIN agents a ON a.id = r.agent_id
    WHERE r.user_id = ?
    ORDER BY r.id DESC
  `).all(req.user.id);
  res.json(rules);
});

router.post('/rules', (req, res) => {
  const { agent_id, type, threshold, cooldown = 300 } = req.body;
  const VALID_TYPES = ['cpu', 'mem', 'disk', 'offline', 'online'];
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (['cpu','mem','disk'].includes(type) && (threshold == null || threshold < 1 || threshold > 100))
    return res.status(400).json({ error: 'threshold must be 1-100' });

  const result = getDb().prepare(`
    INSERT INTO alert_rules (user_id, agent_id, type, threshold, cooldown)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, agent_id || null, type, threshold || null, cooldown);

  res.status(201).json({ id: result.lastInsertRowid });
});

router.patch('/rules/:id', (req, res) => {
  const { enabled, threshold, cooldown } = req.body;
  const rule = getDb().prepare('SELECT * FROM alert_rules WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!rule) return res.status(404).json({ error: 'Not found' });

  getDb().prepare(`
    UPDATE alert_rules SET
      enabled   = COALESCE(?, enabled),
      threshold = COALESCE(?, threshold),
      cooldown  = COALESCE(?, cooldown)
    WHERE id = ?
  `).run(
    enabled != null ? (enabled ? 1 : 0) : null,
    threshold ?? null,
    cooldown ?? null,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/rules/:id', (req, res) => {
  const r = getDb().prepare('DELETE FROM alert_rules WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// ── Telegram chat_id ──────────────────────────────────────────────────────────

router.post('/telegram/test', async (req, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id required' });
  if (!process.env.TELEGRAM_SERVICE_BOT_TOKEN)
    return res.status(503).json({ error: 'TELEGRAM_SERVICE_BOT_TOKEN not set on server' });

  await sendTelegram(chat_id, '✅ <b>MPCB SSH</b> — Telegram алерты подключены!');
  // Save chat_id
  getDb().prepare('UPDATE users SET telegram_chat_id = ? WHERE id = ?').run(String(chat_id), req.user.id);
  res.json({ ok: true });
});

router.delete('/telegram', (req, res) => {
  getDb().prepare('UPDATE users SET telegram_chat_id = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.get('/telegram', (req, res) => {
  const user = getDb().prepare('SELECT telegram_chat_id FROM users WHERE id = ?').get(req.user.id);
  res.json({ chat_id: user?.telegram_chat_id || null });
});

module.exports = router;
