# asentum-indexer

Background indexer that scans the Asentum chain via JSON-RPC and writes a per-address transaction history into a local SQLite database. Exposes a small HTTP API on `127.0.0.1:3002` for the Next.js explorer to query.

## What it does

- On boot, reads `last_indexed_block` from the SQLite `meta` table. If empty, starts from the configured `START_FROM` (default 0).
- Loops: fetch `eth_blockNumber`, then batch-fetch missing blocks via `eth_getBlockByNumber` + `eth_getTransactionReceipt` in groups of `BATCH_SIZE`. Writes them atomically.
- Once caught up, idles `POLL_MS` between ticks.
- Idempotent. re-running over already-indexed blocks just rewrites the same rows (UPSERT on tx hash).

## Schema

```
txs (hash PK, block_number, block_hash, timestamp, from, to, value, gas_used, status, has_input, contract_created)
address_txs (address, tx_hash, block_number, role). role: from | to | created
meta (key PK, value). stores last_indexed_block
```

## HTTP API

```
GET /health                            → status + last indexed block + lag
GET /address/:addr/stats               → counts: sent / received / contractsCreated
GET /address/:addr/txs?page=&size=&role=  → paginated tx list (role optional)
```

All addresses are normalized to lowercase. Pagination via `page` (1-indexed) and `size` (1-100, default 25).

## Run locally

```bash
cp .env.example .env
npm install                # builds better-sqlite3 native binding
npm run dev                # node --watch. restarts on file changes
```

By default writes to `./data/index.db` and listens on `http://127.0.0.1:3002`.

## Deployment (Hetzner)

See the parent repo's README. there's a combined systemd-unit + nginx section that brings up both the indexer and the explorer together.

## Known gaps

- **No reorg handling.** Asentum's BFT finality means committed blocks don't get rewritten in practice. If consensus ever changes, add a parent-hash check before each insert.
- **No internal tx tracing.** Needs `debug_traceTransaction` (not exposed on the testnet RPC). Defer.
- **No token transfer indexing.** Will be added alongside the ARC-20 standard rollout.
- **No log indexing.** Address page shows tx-level info only. Logs are still on the per-tx page (read live from RPC).
