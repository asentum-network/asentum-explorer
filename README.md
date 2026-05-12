# Asentum Explorer

Standalone Next.js block explorer for the Asentum L1, with a sibling SQLite indexer that powers per-address transaction history.

Same design language as `asentum.com` (Plus Jakarta + DM Mono + dashed rails + dark theme). Talks to any Asentum node over Ethereum-style JSON-RPC. Default RPC is `https://testnet.asentum.com`.

## Architecture

```
   Browser ── HTTPS ── nginx ──► Next.js explorer  (:3001)
                                       │
                                       │  /api/indexer/* proxy
                                       ▼
                          asentum-indexer service  (:3002, 127.0.0.1)
                                       │
                                       ▼
                                  SQLite file
```

Three independent processes on the same box: Next.js explorer (port 3001), indexer worker + HTTP API (port 3002, localhost-only), and nginx as the public entry point. The explorer's `/api/indexer/*` route proxies all browser calls to the indexer so it can stay bound to 127.0.0.1.

## Features

- **Homepage**. live block counter, network stats, recent blocks list, recent transactions list.
- **Block list** (`/blocks`). paginated, 25 per page, newer/older buttons.
- **Block detail** (`/block/[number-or-hash]`). header fields, transactions table, prev/next navigation.
- **Transaction detail** (`/tx/[hash]`). status, block, from/to, value, gas, input data, logs.
- **Address detail** (`/address/[address]`). balance, nonce, EOA vs contract detection, **full transaction history (sent / received / contracts created) from the indexer, paginated.**
- **Validators** (`/validators`). active set + bonded stake (pulls from `/validators` endpoint on the node).
- **Universal search**. block number, tx hash, or address. Auto-routes based on shape.
- **Live block badge**. top-right header pill, polls every 6s.

## Run locally

Two processes, two terminals (or use a process manager).

```bash
# Terminal 1. the indexer
cd indexer
cp .env.example .env
npm install              # builds better-sqlite3 native binding
npm run dev              # tails /addresses, exposes :3002

# Terminal 2. the explorer
cd ..
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3001
```

The address page will surface a friendly "Indexer unreachable" warning if you only run the explorer. Run the indexer first, give it a moment to backfill some blocks, then refresh.

Dev server runs on `http://localhost:3001` (port 3001 so it doesn't collide with the main marketing site on 3000).

## Configuration

**Explorer (`.env.local`):**

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | `https://testnet.asentum.com` | JSON-RPC endpoint. Must be reachable from the browser (CORS-friendly). |
| `NEXT_PUBLIC_CHAIN_ID` | `1337` | Display-only chain id. |
| `NEXT_PUBLIC_CHAIN_NAME` | `Testnet` | Display-only chain name shown in header pill. |
| `INDEXER_URL` | `http://127.0.0.1:3002` | Server-side only. Where the Next.js `/api/indexer/*` proxy forwards. |

**Indexer (`indexer/.env`):**

| Variable | Default | What it does |
|---|---|---|
| `RPC_URL` | `https://testnet.asentum.com` | Where the indexer reads blocks from. |
| `DB_PATH` | `./data/index.db` | SQLite file path. Directory auto-created. |
| `HOST` | `127.0.0.1` | API bind address. Keep localhost in prod. |
| `PORT` | `3002` | API port. |
| `POLL_MS` | `3000` | Tick interval once caught up to head. |
| `BATCH_SIZE` | `25` | Blocks per JSON-RPC batch during backfill. |
| `START_FROM` | `0` | Backfill from this block on first run. Set to `latest` to skip backfill. |

## Production build

```bash
npm run build
npm start  # serves on :3001
```

## Hetzner deployment

Assumes a fresh Ubuntu 22.04 / Debian 12 box.

### 1. System packages

```bash
sudo apt update && sudo apt install -y curl git nginx ufw
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Clone + build (explorer and indexer)

```bash
sudo mkdir -p /opt/asentum-explorer
sudo chown $USER /opt/asentum-explorer
cd /opt/asentum-explorer
git clone <this-repo> .

# Explorer
cp .env.example .env.local           # edit if non-default
npm ci
npm run build

# Indexer (sibling subdirectory)
cd indexer
cp .env.example .env
npm ci                                # builds better-sqlite3 native binding
cd ..

# SQLite data dir owned by the indexer service account
sudo mkdir -p /var/lib/asentum-indexer
sudo chown -R www-data:www-data /var/lib/asentum-indexer
```

Set `DB_PATH=/var/lib/asentum-indexer/index.db` in `indexer/.env` so the database lives outside the source checkout (survives `git pull` and isn't owned by git).

### 3. systemd units. two services

**Explorer:**

```ini
# /etc/systemd/system/asentum-explorer.service
[Unit]
Description=Asentum Block Explorer
After=network.target asentum-indexer.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/asentum-explorer
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

**Indexer:**

```ini
# /etc/systemd/system/asentum-indexer.service
[Unit]
Description=Asentum Chain Indexer
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/asentum-explorer/indexer
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable both:

```bash
sudo chown -R www-data:www-data /opt/asentum-explorer
sudo systemctl daemon-reload
sudo systemctl enable --now asentum-indexer
sudo systemctl enable --now asentum-explorer
sudo systemctl status asentum-indexer asentum-explorer
```

Watch the indexer backfill:

```bash
sudo journalctl -fu asentum-indexer
# expect lines like: [indexer] block 12345 · 3 txs
```

Sanity check the API directly (still on the box):

```bash
curl http://127.0.0.1:3002/health
# {"ok":true,"lastIndexedBlock":20000,"totalTxs":...,"head":20001,"lag":1}
```

### 4. nginx reverse proxy

```nginx
# /etc/nginx/sites-available/explorer.asentum.com
server {
  listen 80;
  server_name explorer.asentum.com;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/explorer.asentum.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. DNS + TLS

- Point `explorer.asentum.com` A-record at the box's IPv4.
- After DNS propagates:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d explorer.asentum.com
```

### 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Updating

```bash
cd /opt/asentum-explorer
git pull

# Rebuild explorer
npm ci
npm run build

# Rebuild indexer only if its package-lock changed (rare)
cd indexer && npm ci && cd ..

sudo systemctl restart asentum-indexer asentum-explorer
```

The indexer's SQLite file lives outside the source tree (`/var/lib/asentum-indexer/index.db`), so it survives `git pull` and gradually grows over time. To force a full re-index, stop the service, delete the file, and restart. backfill from block 0 will run automatically.

## Known gaps (not yet built)

- **Contract source verification**. deferred. Add later by storing source + ABI in a small SQLite table next to the indexer.
- **Token tracking / ARC-20 events**. pending the ARC-20 standard rollout on the chain (see post-v1.10 roadmap item 15). Will add a `token_transfers` table to the indexer when it lands.
- **Internal txs**. needs `debug_traceTransaction`. Not exposed on the testnet RPC. Defer.
- **Logos / ENS-style names**. addresses display as raw hex. Could layer a name service later.
- **WebSocket live updates**. polling at 3-6s for now. WS subscriptions are a roadmap item.
- **Reorg handling**. Asentum's BFT finality is immediate, so this isn't an issue today. If consensus ever pivots, add a parent-hash sanity check before each insert.

## Repo layout

```
asentum-explorer/
├── components/
│   ├── Footer.jsx       # Site footer
│   ├── Header.jsx       # Sticky header + live block badge + nav
│   ├── Layout.jsx       # Page wrapper (Head, header, footer)
│   ├── SearchBar.jsx    # Universal search (block / tx / address)
│   └── StatCard.jsx     # Reusable stat tile
├── lib/
│   ├── format.js        # wei → ASE, hex helpers, timestamps, shortHash
│   └── rpc.js           # JSON-RPC client + convenience wrappers
├── pages/
│   ├── _app.js
│   ├── _document.js
│   ├── address/[address].js
│   ├── api/indexer/[...path].js   # proxy → indexer service
│   ├── block/[number].js
│   ├── blocks.js
│   ├── index.js
│   ├── tx/[hash].js
│   └── validators.js
├── styles/
│   └── globals.css      # Tailwind v4 + design tokens (matches asentum.com)
├── indexer/             # ── sibling indexer service ──
│   ├── src/
│   │   ├── api.js       # HTTP API (/health, /address/:addr/txs, /stats)
│   │   ├── db.js        # SQLite schema + queries
│   │   ├── index.js     # Entrypoint: boots indexer loop + API
│   │   ├── indexer.js   # Block scanner / backfill / tail loop
│   │   └── rpc.js       # JSON-RPC client with batch support
│   ├── .env.example
│   ├── package.json     # Separate from explorer (better-sqlite3 native)
│   └── README.md
├── .env.example
├── jsconfig.json        # @/ path alias
├── next.config.js
├── package.json
└── postcss.config.mjs
```
