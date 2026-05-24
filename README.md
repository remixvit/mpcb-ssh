# MPCB SSH

Self-hosted web SSH manager with terminal, key management, tunnel control, serial/Bluetooth debugging, and agent monitoring. Think Termius/MobaXterm but accessible from any browser.

## Stack

- **Backend** — Node.js + Express + SQLite (better-sqlite3)
- **Frontend** — React 18 + Vite + xterm.js
- **Agent** — Node.js daemon (ws) for remote monitoring and TCP proxy
- **Auth** — JWT (access + refresh) + bcrypt + AES-256-GCM key encryption + rate limiting

## Quick Start (Docker)

```bash
cp .env.example .env   # set JWT_SECRET and JWT_REFRESH_SECRET
docker compose up -d
```

App available at `http://localhost:8882`.  
Default credentials: `admin` / `admin123` — **change immediately** (see Password Change below).

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
| Agent daemons — CPU/mem/disk/uptime/load/network | ✅ |
| Agent TCP proxy — SSH via agent, no VPN needed | ✅ |
| ProxyJump (SSH bastion/jump host) | ✅ |
| Login rate limiting (10 req/min per IP) | ✅ |
| Auto color prompt on SSH connect | ✅ |
| PPK → OpenSSH auto-conversion on upload | ✅ |
| CI/CD via GitHub Actions self-hosted runner | ✅ |
| 2FA (TOTP) | 🔜 |

## Agent

The agent is a small Node.js daemon you install on remote machines. It connects back to the MPCB SSH server and:
- Reports CPU / memory / disk / uptime / load average / network RX+TX in real time
- Acts as a **TCP proxy** — lets you SSH to servers in that network without a VPN

### Install (one-liner)

In the MPCB SSH UI → **Agents** → **Add agent** → copy the install command, then run on the target machine:

```bash
curl -fsSL 'https://your-server/api/agents/install?id=ID&token=TOKEN&server=https://your-server' | sudo bash
```

**Requirements:** Linux/macOS, Node.js 16+ (auto-installed on Debian/Ubuntu), root for systemd.

> **Pangolin users:** add Authorization bypass rules for `/ws/agent`, `/api/agents/install`, `/api/agents/download` in your resource's Rules tab.

### Agent TCP Proxy (no VPN)

If the agent is installed on a machine inside a private network, you can use it as a proxy to reach other servers in that network:

1. In MPCB → **Add Server**, set **Proxy via Agent** to the online agent
2. Set **Host** to the internal IP the agent can reach (e.g. `127.0.0.1` for the agent's own machine, or `192.168.x.x` for another machine on the same LAN)
3. Connect — traffic flows: `Browser → MPCB backend → WebSocket → Agent → SSH server`

### Auto-start

The one-liner install script automatically creates and enables a systemd service.

**Linux (systemd)**
```bash
systemctl status mpcb-agent
journalctl -u mpcb-agent -f
```

**macOS (launchd)** — `~/Library/LaunchAgents/com.mpcb.agent.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.mpcb.agent</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/node</string><string>/opt/mpcb-agent/index.js</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MPCB_SERVER</key><string>https://your-server</string>
    <key>MPCB_ID</key><string>1</string>
    <key>MPCB_TOKEN</key><string>your-token</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
```
```bash
launchctl load ~/Library/LaunchAgents/com.mpcb.agent.plist
```

**Windows (Task Scheduler)**
```powershell
$action  = New-ScheduledTaskAction -Execute 'node' -Argument 'C:\mpcb-agent\index.js'
$trigger = New-ScheduledTaskTrigger -AtStartup
$env     = [System.Environment]
$env::SetEnvironmentVariable('MPCB_SERVER','https://your-server','Machine')
$env::SetEnvironmentVariable('MPCB_ID','1','Machine')
$env::SetEnvironmentVariable('MPCB_TOKEN','your-token','Machine')
Register-ScheduledTask -TaskName 'MPCB Agent' -Action $action -Trigger $trigger -RunLevel Highest -Force
```

### `.env` format
```
MPCB_SERVER=https://ssh.mpcbstudio.com
MPCB_ID=1
MPCB_TOKEN=your64hextoken
MPCB_NAME=My Server       # optional label
```

## Password Change

Changing the password re-derives the AES encryption key — all SSH keys are automatically re-encrypted:

```bash
docker exec -it <container> node change-password.js admin OLD_PASSWORD NEW_PASSWORD
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
- [x] Phase 3 — Agent daemon (monitoring + TCP proxy)
- [x] Tools — Web Serial, Web Bluetooth, IoT Browser
- [x] Security — Rate limiting, AES-256-GCM key encryption
- [ ] Phase 4 — 2FA (TOTP + backup codes)
