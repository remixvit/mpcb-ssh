# MPCB SSH

Self-hosted web SSH manager with terminal, key management, tunnel control, serial/Bluetooth debugging, and agent monitoring. Think Termius/MobaXterm but accessible from any browser.

## Stack

- **Backend** — Node.js + Express + SQLite (better-sqlite3)
- **Frontend** — React 18 + Vite + xterm.js
- **Agent** — Node.js daemon (ws) for remote monitoring & future tunnel control
- **Auth** — JWT (access + refresh) + bcrypt + AES-256-GCM key encryption

## Quick Start (Docker)

```bash
# Copy and edit environment
cp .env.example .env   # set JWT_SECRET and JWT_REFRESH_SECRET

docker compose up -d
```

App available at `http://localhost:8882`.  
Default credentials: `admin` / `admin123` — **change immediately**.

## Development

```bash
# Backend
cd server && npm install && npm run dev   # :3000

# Frontend (separate terminal)
cd client && npm install && npm run dev   # :5173, proxies /api + /ws to :3000
```

## Features

| Feature | Status |
|---|---|
| SSH terminal (xterm.js + ssh2) | ✅ |
| SSH key management (PEM + PPK auto-convert) | ✅ |
| Port tunnels — local / remote / dynamic SOCKS5 | ✅ |
| Tunnel start/stop from UI | ✅ |
| Web Serial (UART) terminal | ✅ |
| Web Bluetooth BLE inspector | ✅ |
| IoT device browser (iframe) | ✅ |
| Agent daemons — online/CPU/mem monitoring | ✅ |
| Auto color prompt on SSH connect | ✅ |
| Reconnect button in terminal | ✅ |
| PPK → OpenSSH auto-conversion on upload | ✅ |
| CI/CD via GitHub Actions self-hosted runner | ✅ |
| 2FA (TOTP) | 🔜 |

## Agent

The agent is a small Node.js daemon you install on remote machines.  
It connects back to the MPCB SSH server and reports CPU/memory in real time.

### Install (one-liner)

In the MPCB SSH UI → **Agents** → **Add agent** → copy the install command, then run on the target machine:

```bash
curl -fsSL 'https://your-server/api/agents/install?id=ID&token=TOKEN&server=https://your-server' | sudo bash
```

**Requirements:** Linux/macOS, Node.js 16+ (auto-installed on Debian/Ubuntu), root for systemd.

### Manual install

```bash
mkdir -p /opt/mpcb-agent && cd /opt/mpcb-agent
curl -fsSL https://your-server/api/agents/download -o index.js
echo '{"name":"mpcb-agent","main":"index.js","dependencies":{"ws":"^8.18.0"}}' > package.json
npm install --omit=dev

# Run (replace values):
MPCB_SERVER=https://your-server MPCB_ID=1 MPCB_TOKEN=your-token node index.js
```

### Systemd service

```ini
[Unit]
Description=MPCB SSH Agent
After=network-online.target

[Service]
WorkingDirectory=/opt/mpcb-agent
EnvironmentFile=/opt/mpcb-agent/.env
ExecStart=/usr/bin/node /opt/mpcb-agent/index.js
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

`.env` format:
```
MPCB_SERVER=https://ssh.mpcbstudio.com
MPCB_ID=1
MPCB_TOKEN=your64hextoken
MPCB_NAME=My Server       # optional label
```

## CI/CD (self-hosted GitHub Actions runner)

The repo includes `.github/workflows/deploy.yml`.  
Set up a self-hosted runner on the deploy machine, put secrets in `~/.mpcb-ssh.env`.

```bash
docker compose --env-file ~/.mpcb-ssh.env build
docker compose --env-file ~/.mpcb-ssh.env up -d
```

## Roadmap

- [x] Phase 1 — Core SSH terminal + key management
- [x] Phase 2 — Tunnel start/stop management
- [x] Phase 3 — Agent daemon (monitoring)
- [x] Tools — Web Serial, Web Bluetooth, IoT Browser
- [ ] Phase 4 — 2FA (TOTP + backup codes)
- [ ] Agent Phase 2 — remote tunnel control via agent
