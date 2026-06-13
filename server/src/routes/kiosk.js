'use strict';
const express = require('express');
const crypto  = require('crypto');
const { getDb }        = require('../db/schema');
const { authenticate } = require('../middleware/auth');
const { isOnline, getStats } = require('../ws/agent');

const router = express.Router();

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ── Public: get stats by kiosk token ─────────────────────────────────────────
router.get('/stats', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(401).json({ error: 'token required' });

  const db  = getDb();
  const row = db.prepare('SELECT user_id FROM kiosk_tokens WHERE token_hash = ?').get(hashToken(token));
  if (!row) return res.status(401).json({ error: 'invalid token' });

  const agents = db
    .prepare('SELECT id, name, hostname, platform, last_seen, sensor_config, sensor_defs FROM agents WHERE user_id = ?')
    .all(row.user_id);

  res.json(agents.map(a => {
    const stats   = getStats(a.id);
    const rawConfig = a.sensor_config ? JSON.parse(a.sensor_config) : null;
    const allDefs   = a.sensor_defs   ? JSON.parse(a.sensor_defs)   : [];
    // Normalize config: support both old [key] and new [{key,name}] format
    const configItems = rawConfig
      ? rawConfig.map(c => typeof c === 'string' ? { key: c, name: '' } : c)
      : null;
    const configKeys = configItems ? configItems.map(c => c.key) : null;
    const sensors    = (configKeys && stats.sensors)
      ? Object.fromEntries(configKeys.filter(k => k in stats.sensors).map(k => [k, stats.sensors[k]]))
      : null;
    // Merge defs with custom names from config
    const sensorDefs = configKeys
      ? allDefs
          .filter(d => configKeys.includes(d.key))
          .map(d => ({ ...d, name: configItems.find(c => c.key === d.key)?.name || '' }))
      : [];
    return {
      id:       a.id,
      name:     a.name,
      hostname: a.hostname,
      platform: a.platform,
      online:   isOnline(a.id),
      ...stats,
      sensors,
      sensor_defs: sensorDefs.length ? sensorDefs : undefined,
    };
  }));
});

// ── Authenticated: manage tokens ──────────────────────────────────────────────
router.use(authenticate);

router.get('/tokens', (req, res) => {
  const rows = getDb()
    .prepare('SELECT id, name, created_at FROM kiosk_tokens WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id);
  res.json(rows);
});

router.post('/tokens', (req, res) => {
  const { name = 'Display' } = req.body;
  const token = crypto.randomBytes(32).toString('hex');
  const result = getDb()
    .prepare('INSERT INTO kiosk_tokens (user_id, name, token_hash) VALUES (?, ?, ?)')
    .run(req.user.id, name, hashToken(token));
  // Token returned once — save it!
  res.status(201).json({ id: result.lastInsertRowid, name, token });
});

router.delete('/tokens/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM kiosk_tokens WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
