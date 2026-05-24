const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');
const { encrypt } = require('../services/crypto');
const { ppkToOpenSSH } = require('../services/ppkToOpenSSH');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const keys = getDb()
    .prepare('SELECT id, user_id, name, public_key, fingerprint, created_at FROM ssh_keys WHERE user_id = ?')
    .all(req.user.id);
  res.json(keys);
});

router.post('/', (req, res) => {
  const { name, pem, encryptionKey } = req.body;
  if (!name || !pem || !encryptionKey) {
    return res.status(400).json({ error: 'name, pem and encryptionKey are required' });
  }

  // Auto-convert PuTTY PPK format to OpenSSH
  let keyPem = pem;
  if (pem.startsWith('PuTTY-User-Key-File')) {
    try {
      keyPem = ppkToOpenSSH(pem);
    } catch (err) {
      return res.status(400).json({ error: `PPK conversion failed: ${err.message}` });
    }
  }

  let publicKey = null;
  let fingerprint = null;

  try {
    const keyObj = crypto.createPublicKey({ key: keyPem, format: 'pem' });
    publicKey = keyObj.export({ type: 'spki', format: 'pem' });
    const der = keyObj.export({ type: 'spki', format: 'der' });
    fingerprint = crypto.createHash('sha256').update(der).digest('base64');
  } catch {
    // key might be encrypted or unsupported format — skip fingerprint
  }

  const keyBuffer = Buffer.from(encryptionKey, 'base64');
  const { encrypted, iv, authTag } = encrypt(keyPem, keyBuffer);

  const result = getDb().prepare(`
    INSERT INTO ssh_keys (user_id, name, encrypted_pem, iv, auth_tag, public_key, fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, name, encrypted, iv, authTag, publicKey, fingerprint);

  res.status(201).json({ id: result.lastInsertRowid, name, fingerprint });
});

router.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM ssh_keys WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.get('/:id/public', (req, res) => {
  const key = getDb()
    .prepare('SELECT public_key FROM ssh_keys WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!key) return res.status(404).json({ error: 'Not found' });
  res.json({ publicKey: key.public_key });
});

module.exports = router;
