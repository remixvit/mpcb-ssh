# MPCB SSH

Self-hosted web SSH manager with terminal, key management, and tunnel support. Think Termius/MobaXterm but accessible from any browser.

## Stack

- **Backend** — Node.js + Express + SQLite (better-sqlite3)
- **Frontend** — React 18 + Vite + xterm.js
- **Agent** — Node.js daemon for local tunnel management
- **Auth** — JWT (access + refresh) + bcrypt + AES-256-GCM key encryption

## Quick Start (development)

```bash
# Backend
cd server
cp .env.example .env   # edit JWT_SECRET
npm install
npm run dev            # runs on :3000

# Frontend (separate terminal)
cd client
npm install
npm run dev            # runs on :5173, proxies /api to :3000
```

Default credentials: `admin` / `admin123` — **change immediately**.

## Deploy (Docker)

```bash
cp server/.env.example .env
# Set JWT_SECRET and JWT_REFRESH_SECRET in .env
docker compose up -d
```

App available at `http://localhost:8882`.

## Agent

Install on any machine to enable local tunnel management:

```bash
npm install -g mpcb-ssh-agent
mpcb-agent --server wss://ssh.mpcbstudio.com --token <TOKEN> --name "Home Desktop"
```

## Roadmap

- [x] Phase 1 — Core: auth, servers CRUD, DB schema
- [ ] Phase 1 — SSH terminal (xterm.js + ssh2)
- [ ] Phase 2 — SSH keys & tunnels on backend
- [ ] Phase 3 — Agent with local tunnel management
- [ ] Phase 4 — 2FA (TOTP + backup codes)
