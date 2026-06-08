const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

let db;

function initDb(dbPath) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      totp_backup_codes TEXT,
      telegram_chat_id TEXT,
      encryption_salt TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS ssh_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      encrypted_pem TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      public_key TEXT,
      fingerprint TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 22,
      username TEXT NOT NULL,
      key_id INTEGER REFERENCES ssh_keys(id),
      password_encrypted TEXT,
      password_iv TEXT,
      password_auth_tag TEXT,
      tags TEXT,
      color TEXT,
      jump_server_id INTEGER REFERENCES servers(id),
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tunnels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      server_id INTEGER NOT NULL REFERENCES servers(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      local_host TEXT DEFAULT '127.0.0.1',
      local_port INTEGER,
      remote_host TEXT,
      remote_port INTEGER,
      socks_port INTEGER,
      auto_start INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      platform TEXT,
      hostname TEXT,
      last_seen INTEGER,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  // Migrations for existing databases
  try { db.exec('ALTER TABLE servers ADD COLUMN proxy_agent_id INTEGER REFERENCES agents(id)'); } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS kiosk_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL DEFAULT 'Display',
      token_hash TEXT NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    )`);
  } catch {}

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const salt = require('crypto').randomBytes(32).toString('hex');
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, password_hash, role, encryption_salt)
      VALUES ('admin', ?, 'admin', ?)
    `).run(passwordHash, salt);
    console.log('Created default admin user (admin / admin123) — change password immediately!');
  }

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

module.exports = { initDb, getDb };
