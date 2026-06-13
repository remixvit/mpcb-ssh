'use strict';
const express  = require('express');
const crypto   = require('crypto');
const bcrypt   = require('bcrypt');
const path     = require('path');
const fs       = require('fs');
const { getDb }           = require('../db/schema');
const { authenticate }    = require('../middleware/auth');
const { isOnline, getStats, sendCommand } = require('../ws/agent');

const router = express.Router();

// ── Public: download agent script ────────────────────────────────────────────
// (No auth — the agent token IS the credential)
router.get('/download', (_req, res) => {
  const agentPath = path.resolve(__dirname, '../../agent/index.js');
  if (!fs.existsSync(agentPath)) return res.status(404).send('Agent script not found on server');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="mpcb-agent.js"');
  res.sendFile(agentPath);
});

// ── Public: generate install script for a specific agent ─────────────────────
router.get('/install', (req, res) => {
  const { id, token, server } = req.query;
  if (!id || !token || !server) {
    return res.status(400).send('Missing params: id, token, server');
  }

  // Sanitise values before embedding in the shell script
  const safe = (s) => String(s).replace(/['"\\$`]/g, '');
  const safeServer = safe(server);
  const safeId     = safe(id);
  const safeToken  = safe(token);

  const script = `#!/usr/bin/env bash
set -euo pipefail

MPCB_SERVER="${safeServer}"
MPCB_ID="${safeId}"
MPCB_TOKEN="${safeToken}"
INSTALL_DIR="/opt/mpcb-agent"
SERVICE="mpcb-agent"

echo "==> MPCB SSH Agent installer"

# ── Check / install Node.js ──────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "==> Node.js not found — installing via NodeSource (LTS)..."
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(parseInt(process.versions.node)))")
if [ "$NODE_MAJOR" -lt 16 ]; then
  echo "ERROR: Node.js 16+ required (found v$(node -v)). Aborting."
  exit 1
fi
echo "==> Node.js $(node -v) ✓"

# ── Install agent ────────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
echo "==> Downloading agent from $MPCB_SERVER..."
curl -fsSL "$MPCB_SERVER/api/agents/download" -o "$INSTALL_DIR/index.js"

cat > "$INSTALL_DIR/package.json" <<'PKGJSON'
{"name":"mpcb-agent","version":"1.1.0","main":"index.js","dependencies":{"ws":"^8.18.0"}}
PKGJSON

echo "==> Installing dependencies..."
cd "$INSTALL_DIR" && npm install --omit=dev --quiet

# ── Write config ─────────────────────────────────────────────────────────────
cat > "$INSTALL_DIR/.env" <<ENVFILE
MPCB_SERVER=$MPCB_SERVER
MPCB_ID=$MPCB_ID
MPCB_TOKEN=$MPCB_TOKEN
ENVFILE
chmod 600 "$INSTALL_DIR/.env"

# ── Systemd service ──────────────────────────────────────────────────────────
if command -v systemctl &>/dev/null; then
  cat > "/etc/systemd/system/$SERVICE.service" <<SVCFILE
[Unit]
Description=MPCB SSH Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$(command -v node) $INSTALL_DIR/index.js
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCFILE

  systemctl daemon-reload
  systemctl enable "$SERVICE"
  systemctl restart "$SERVICE"

  echo ""
  echo "==> Agent installed and started."
  echo "    Status : systemctl status $SERVICE"
  echo "    Logs   : journalctl -u $SERVICE -f"
else
  echo ""
  echo "==> systemd not found. Start manually:"
  echo "    cd $INSTALL_DIR && node index.js"
fi

echo "==> Done! The agent should appear online in the MPCB dashboard within ~30 seconds."
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(script);
});

// ── Authenticated routes ──────────────────────────────────────────────────────
router.use(authenticate);

router.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT id, user_id, name, platform, hostname, last_seen, sensor_defs, sensor_config, created_at FROM agents WHERE user_id = ?')
    .all(req.user.id);

  res.json(rows.map(a => ({
    ...a,
    sensor_defs:   a.sensor_defs   ? JSON.parse(a.sensor_defs)   : null,
    sensor_config: a.sensor_config ? JSON.parse(a.sensor_config) : null,
    online: isOnline(a.id),
    ...getStats(a.id),
  })));
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const token     = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, 10);

  const result = getDb()
    .prepare('INSERT INTO agents (user_id, name, token_hash) VALUES (?, ?, ?)')
    .run(req.user.id, name, tokenHash);

  // Token returned once — client must save it
  res.status(201).json({ id: result.lastInsertRowid, name, token });
});

router.patch('/:id/sensor-config', (req, res) => {
  const { config } = req.body; // array of sensor keys
  if (!Array.isArray(config)) return res.status(400).json({ error: 'config must be an array' });
  const result = getDb()
    .prepare('UPDATE agents SET sensor_config = ? WHERE id = ? AND user_id = ?')
    .run(JSON.stringify(config), req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.post('/:id/update', (req, res) => {
  const db = getDb();
  const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!agent) return res.status(404).json({ error: 'Not found' });
  const sent = sendCommand(parseInt(req.params.id), { type: 'agent:update' });
  if (!sent) return res.status(409).json({ error: 'Agent is offline' });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM agents WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
