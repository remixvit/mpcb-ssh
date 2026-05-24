#!/usr/bin/env node
/**
 * Usage: node change-password.js <username> <old_password> <new_password>
 * Run inside the Docker container:
 *   docker exec -it <container> node change-password.js admin OLD NEW
 */
'use strict';
const crypto   = require('crypto');
const bcrypt   = require('bcrypt');
const Database = require('better-sqlite3');
const path     = require('path');

const [,, username, oldPass, newPass] = process.argv;
if (!username || !oldPass || !newPass) {
  console.error('Usage: node change-password.js <username> <old_password> <new_password>');
  process.exit(1);
}

const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'data/db.sqlite');
const db = new Database(dbPath);

const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
if (!user) { console.error('User not found'); process.exit(1); }

if (!bcrypt.compareSync(oldPass, user.password_hash)) {
  console.error('Old password is incorrect');
  process.exit(1);
}

function deriveKey(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

const oldKey = deriveKey(oldPass, user.encryption_salt);
const newKey = deriveKey(newPass, user.encryption_salt);

const keys = db.prepare('SELECT * FROM ssh_keys WHERE user_id = ?').all(user.id);
console.log(`Re-encrypting ${keys.length} SSH key(s)...`);

for (const k of keys) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', oldKey, Buffer.from(k.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(k.auth_tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(k.encrypted_pem, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', newKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    db.prepare('UPDATE ssh_keys SET encrypted_pem=?, iv=?, auth_tag=? WHERE id=?')
      .run(encrypted.toString('base64'), iv.toString('base64'), authTag.toString('base64'), k.id);

    console.log(`  ✓ ${k.name}`);
  } catch (err) {
    console.error(`  ✗ ${k.name}: ${err.message}`);
  }
}

const newHash = bcrypt.hashSync(newPass, 12);
db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(newHash, user.id);

console.log('Password changed successfully.');
db.close();
