const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '30d' }
  );
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.totp_enabled) {
    const tempToken = jwt.sign({ sub: user.id, purpose: '2fa' }, process.env.JWT_SECRET, { expiresIn: '5m' });
    return res.json({ requires2fa: true, tempToken });
  }

  const accessToken = signAccess(user);
  const refreshToken = signRefresh(user);

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(user.id, tokenHash, expiresAt);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 3600 * 1000,
  });

  res.json({ accessToken, user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const db = getDb();
  const tokenHash = require('crypto').createHash('sha256').update(refreshToken).digest('hex');
  const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > unixepoch()').get(tokenHash);
  if (!session) return res.status(401).json({ error: 'Session expired' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user) return res.status(401).json({ error: 'User not found' });

  res.json({ accessToken: signAccess(user) });
});

router.post('/logout', (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (refreshToken) {
    const tokenHash = require('crypto').createHash('sha256').update(refreshToken).digest('hex');
    getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }
  res.clearCookie('refreshToken');
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  const user = getDb().prepare('SELECT id, username, email, role, totp_enabled FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Returns encryption salt for a username — needed by client to derive encryption key
router.get('/encryption-salt', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username required' });
  const user = getDb().prepare('SELECT encryption_salt FROM users WHERE username = ?').get(username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ salt: user.encryption_salt });
});

module.exports = router;
