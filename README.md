# MPCB SSH

Self-hosted web SSH manager with terminal, key management, and tunnel support. Think Termius/MobaXterm but accessible from any browser.

## Stack

- **Backend** — Node.js + Express + SQLite (better-sqlite3)
- **Frontend** — React 18 + Vite + xterm.js
- **Agent** — Node.js daemon for local tunnel management
- **Auth** — JWT (access + refresh) + bcrypt + AES-256-GCM key encryption

## Quick Start (Docker — recommended)

```bash
cp .env.example .env   # set JWT_SECRET and JWT_REFRESH_SECRET
docker compose up -d
```

App available at `http://localhost:8882`.

## Quick Start (development)

```bash
# Backend
cd server
npm install
npm run dev            # runs on :8882

# Frontend (separate terminal)
cd client
npm install
npm run dev            # runs on :5173, proxies /api and /ws to :8882
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

## UI

Atom Material Theme — dark teal design with Matrix rain login screen, glassmorphism cards, and JetBrains Mono terminal font.

## Roadmap

- [x] Phase 1 — Core: auth, servers CRUD, DB schema, SSH terminal (xterm.js + ssh2)
- [x] Phase 1 — UI redesign: Atom Material Theme, all pages
- [ ] Phase 2 — Live tunnel management (start/stop via backend)
- [ ] Phase 3 — Agent daemon + local tunnel management
- [ ] Phase 4 — 2FA (TOTP + backup codes)
