# SSH Manager — Project Brief for Claude Code

## Обзор проекта

Web-приложение для управления SSH-соединениями, ключами и туннелями. Аналог Termius / MobaXterm, но self-hosted, с доступом через браузер с любого устройства.

Рабочее название: **MPCB SSH** (или придумать в процессе)

---

## Архитектура

```
mpcb-ssh/
├── server/          # Node.js backend (центральный, на VPS/локальном сервере)
├── client/          # React frontend
└── agent/           # Лёгкий Node.js демон (устанавливается на каждую машину)
```

### Поток данных

```
Браузер (React + xterm.js)
    │  WebSocket (терминал / управление агентами)
    │  REST API (CRUD: серверы, ключи, туннели, юзеры)
    ▼
Node.js backend (server/)
    │  ssh2 — SSH соединения и туннели
    │  SQLite — хранилище
    ▼
Целевые серверы (SSH)

Агент (agent/) — запущен на машине пользователя
    │  WebSocket → backend (постоянное соединение)
    │  Получает команды: открыть/закрыть туннель
    │  Открывает SSH туннель локально (localhost:PORT)
```

---

## Стек технологий

### Backend (server/)
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **WebSocket**: ws
- **SSH**: ssh2
- **БД**: better-sqlite3 (SQLite, один файл)
- **Auth**: jsonwebtoken (access + refresh tokens)
- **Crypto**: Node.js built-in crypto (AES-256-GCM)
- **Пароли**: bcrypt
- **2FA**: speakeasy + qrcode
- **Логирование**: winston или pino

### Frontend (client/)
- **Framework**: React 18 + Vite
- **Терминал**: xterm.js + xterm-addon-fit + xterm-addon-web-links
- **HTTP**: axios
- **WebSocket**: нативный browser WebSocket
- **UI**: минималистичный, тёмная тема (как MobaXterm)
- **Роутинг**: react-router-dom v6
- **State**: React Context / Zustand

### Agent (agent/)
- **Runtime**: Node.js (один файл index.js)
- **WebSocket**: ws
- **SSH туннели**: ssh2
- **Упаковка**: pkg (для сборки в exe/бинарник)
- **Установка**: `npm install -g mpcb-ssh-agent`

---

## База данных (SQLite)

```sql
-- Пользователи
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,        -- bcrypt
  role TEXT DEFAULT 'user',           -- 'admin' | 'user'
  totp_secret TEXT,                   -- AES-256-GCM зашифрован
  totp_enabled INTEGER DEFAULT 0,
  totp_backup_codes TEXT,             -- JSON массив хешированных кодов
  telegram_chat_id TEXT,              -- для OTP через Telegram
  encryption_salt TEXT NOT NULL,      -- PBKDF2 salt для ключа шифрования
  created_at INTEGER DEFAULT (unixepoch())
);

-- SSH ключи
CREATE TABLE ssh_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  encrypted_pem TEXT NOT NULL,        -- AES-256-GCM зашифрован
  iv TEXT NOT NULL,                   -- base64
  public_key TEXT,                    -- открытая часть (не шифруем)
  fingerprint TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Серверы
CREATE TABLE servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  username TEXT NOT NULL,
  key_id INTEGER REFERENCES ssh_keys(id),
  password_encrypted TEXT,            -- если auth по паролю (AES-256-GCM)
  password_iv TEXT,
  tags TEXT,                          -- JSON массив строк
  color TEXT,                         -- hex цвет метки
  jump_server_id INTEGER REFERENCES servers(id),  -- ProxyJump
  created_at INTEGER DEFAULT (unixepoch())
);

-- SSH туннели
CREATE TABLE tunnels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  server_id INTEGER NOT NULL REFERENCES servers(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,                 -- 'local' | 'remote' | 'dynamic'
  local_host TEXT DEFAULT '127.0.0.1',
  local_port INTEGER,
  remote_host TEXT,
  remote_port INTEGER,
  socks_port INTEGER,                 -- для dynamic
  auto_start INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Агенты (зарегистрированные машины)
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,                 -- "Home Desktop", "Laptop"
  token_hash TEXT NOT NULL,           -- bcrypt хеш токена агента
  platform TEXT,                      -- 'win32' | 'linux' | 'darwin'
  hostname TEXT,
  last_seen INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Сессии (refresh tokens)
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
```

---

## Шифрование ключей

```
Пользователь вводит пароль при логине
        │
        ▼
PBKDF2(password, salt, 100000 iterations, SHA-256) → 32-byte ключ шифрования
        │
        ▼
AES-256-GCM encrypt(privateKey) → { encrypted, iv, authTag }
        │
        ▼
Хранится в БД: encrypted_pem, iv
Ключ шифрования: ТОЛЬКО в памяти сессии (не хранится нигде)
```

**Ключ живёт только в памяти JWT-сессии** — при логауте или истечении токена ключ пропадает. Ключи без пароля недоступны.

---

## Аутентификация и 2FA

### Флоу логина
```
1. POST /api/auth/login { username, password }
2. Проверка bcrypt
3. Если totp_enabled:
   - Вернуть { requires2fa: true, tempToken: '...' }
   - Клиент запрашивает TOTP код
   - POST /api/auth/verify-2fa { tempToken, code }
4. Выдать access token (15 мин) + refresh token (30 дней)
5. Refresh token хранится в httpOnly cookie
```

### 2FA методы
- **Основной**: TOTP (Google Authenticator / Yandex Key / любое TOTP приложение)
- **Резервный**: 8 одноразовых backup кодов (генерируются при настройке 2FA)
- **Опционально**: OTP через Telegram (отправка кода в указанный chat_id)

### Роли
- `admin` — все пользователи, системные настройки
- `user` — только свои данные (серверы, ключи, туннели, агенты)

---

## WebSocket протокол

### Терминал (браузер → backend)
```json
// Открыть терминал
{ "type": "terminal:open", "serverId": 1, "decryptionKey": "base64..." }

// Ввод пользователя
{ "type": "terminal:input", "sessionId": "uuid", "data": "ls\n" }

// Изменение размера
{ "type": "terminal:resize", "sessionId": "uuid", "cols": 120, "rows": 35 }

// Закрыть
{ "type": "terminal:close", "sessionId": "uuid" }
```

### Туннели через агент
```json
// Агент → backend (регистрация)
{ "type": "agent:hello", "token": "...", "platform": "win32", "hostname": "PC-HOME" }

// Backend → агент (команды)
{ "type": "tunnel:start", "tunnelId": 1, "config": { ... } }
{ "type": "tunnel:stop",  "tunnelId": 1 }

// Агент → backend (статус)
{ "type": "tunnel:status", "tunnelId": 1, "status": "active" | "error", "error": "..." }

// Backend → браузер (обновления)
{ "type": "agent:status", "agentId": 1, "online": true }
{ "type": "tunnel:update", "tunnelId": 1, "status": "active" }
```

---

## REST API

```
POST   /api/auth/login
POST   /api/auth/verify-2fa
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/auth/2fa/setup          → QR код
POST   /api/auth/2fa/enable         { code }
POST   /api/auth/2fa/disable        { code }

GET    /api/servers
POST   /api/servers
GET    /api/servers/:id
PUT    /api/servers/:id
DELETE /api/servers/:id

GET    /api/keys
POST   /api/keys                    { name, pem }  — PEM шифруется на лету
DELETE /api/keys/:id
GET    /api/keys/:id/public         → открытая часть ключа

GET    /api/tunnels
POST   /api/tunnels
PUT    /api/tunnels/:id
DELETE /api/tunnels/:id
POST   /api/tunnels/:id/start       { agentId }   — запустить на агенте
POST   /api/tunnels/:id/stop        { agentId }

GET    /api/agents
POST   /api/agents                  { name } → { token }  — токен показывается 1 раз
DELETE /api/agents/:id

GET    /api/users                   (admin only)
POST   /api/users                   (admin only)
PUT    /api/users/:id               (admin only)
DELETE /api/users/:id               (admin only)
```

---

## Агент (agent/)

### Установка
```bash
npm install -g mpcb-ssh-agent
mpcb-agent --server wss://ssh.mpcbstudio.com --token <TOKEN> --name "Home Desktop"
```

### Конфиг файл (~/.mpcb-agent/config.json)
```json
{
  "server": "wss://ssh.mpcbstudio.com",
  "token": "...",
  "name": "Home Desktop"
}
```

### Запуск как сервис
- **Windows**: `mpcb-agent install` → создаёт Windows Service через node-windows
- **Linux**: `mpcb-agent install` → создаёт systemd unit
- **Mac**: launchd plist

### Что делает агент
1. Подключается к backend по WebSocket с аутентификацией по токену
2. Держит соединение alive (ping/pong каждые 30 сек)
3. При получении `tunnel:start` — открывает SSH туннель через ssh2 локально
4. При получении `tunnel:stop` — закрывает туннель
5. При разрыве соединения — переподключается с экспоненциальным backoff

---

## UI (React)

### Страницы / разделы
```
/login              → форма входа (+ 2FA шаг)
/                   → дашборд (список серверов, статус агентов)
/servers            → список серверов
/servers/new        → добавить сервер
/servers/:id        → редактировать сервер
/terminal/:id       → SSH терминал (xterm.js)
/keys               → управление SSH ключами
/tunnels            → список туннелей + статус
/agents             → список агентов + токены
/settings           → профиль, 2FA, смена пароля
/admin/users        → управление пользователями (admin only)
```

### Терминал
- xterm.js, тёмная тема
- Вкладки (несколько одновременных соединений)
- Авто-ресайз при изменении окна (xterm-addon-fit)
- Отображение статуса соединения

### Туннели UI
```
┌─────────────────────────────────────────────────────────────┐
│ SSH Tunnels                               [+ New Tunnel]    │
├──────────┬───────┬─────────────┬───────────────┬──────────┤
│ Name     │ Type  │ Forward     │ Via server    │ Status   │
├──────────┼───────┼─────────────┼───────────────┼──────────┤
│ WG UI    │ Local │ 51821→51821 │ aeza-vps      │ ● Active │
│ Marzban  │ Local │ 8443→8443   │ aeza-vps      │ ○ Idle   │
└──────────┴───────┴─────────────┴───────────────┴──────────┘

Кнопки: [Start All] [Stop All]
При старте туннеля: выбор агента из dropdown (только online)
```

---

## Docker (deploy)

```yaml
# docker-compose.yml
services:
  mpcb-ssh:
    build: ./server
    ports:
      - "8050:3000"
    volumes:
      - ./data:/app/data      # SQLite файл
    environment:
      - JWT_SECRET=...
      - NODE_ENV=production
    restart: unless-stopped
```

### Nginx конфиг (proxy + WebSocket)
```nginx
server {
    listen 443 ssl;
    server_name ssh.mpcbstudio.com;

    location / {
        proxy_pass http://localhost:8050;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Порядок разработки (MVP)

### Фаза 1 — Core
1. Backend: Express + SQLite + auth (JWT, bcrypt)
2. Backend: шифрование ключей (AES-256-GCM)
3. Backend: WebSocket + ssh2 терминал
4. Frontend: логин, список серверов, xterm.js терминал

### Фаза 2 — SSH ключи и туннели на backend
1. CRUD для ключей и серверов
2. SSH туннели (local forwarding) на backend-сервере
3. Frontend: управление ключами, туннелями

### Фаза 3 — Агент
1. Agent: WebSocket клиент + туннели локально
2. Backend: управление агентами
3. Frontend: список агентов, запуск туннеля на агенте

### Фаза 4 — 2FA и multi-user
1. TOTP setup/verify
2. Backup codes
3. Admin: управление пользователями
4. (Опц.) Telegram OTP

---

## Окружение разработчика

- **Деплой**: 192.168.1.201, порт 8882
- **Продакшн**: ssh.mpcbstudio.com (через nginx reverse proxy)
- **GitHub**: remixvit/mpcb-ssh (создать)
- **Node.js**: 20+

---

## Замечания

- Все приватные ключи **НИКОГДА** не передаются на frontend в открытом виде
- Операции дешифрования ключей — только на backend
- Frontend получает ключ шифрования от пользователя при логине, передаёт его backend только в рамках защищённого соединения (HTTPS/WSS)
- Агент аутентифицируется отдельным токеном (не JWT пользователя)
- SQLite файл = вся БД, легко бэкапить: `cp data/db.sqlite backup/`
