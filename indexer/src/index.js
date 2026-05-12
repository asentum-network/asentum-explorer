// asentum-indexer · Entrypoint. Boots the SQLite store, starts the HTTP
// API, and runs the indexing loop until SIGTERM.
//
// milkie · 2026

import { openDb } from './db.js';
import { makeRpc } from './rpc.js';
import { runIndexer } from './indexer.js';
import { startApi } from './api.js';

const RPC_URL = process.env.RPC_URL || 'https://testnet.asentum.com';
const DB_PATH = process.env.DB_PATH || './data/index.db';
const PORT = parseInt(process.env.PORT || '3002', 10);
const HOST = process.env.HOST || '127.0.0.1';
const POLL_MS = parseInt(process.env.POLL_MS || '3000', 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '25', 10);
const START_FROM = process.env.START_FROM || '0';

console.log('[boot] asentum-indexer');
console.log(`[boot] rpc      = ${RPC_URL}`);
console.log(`[boot] db       = ${DB_PATH}`);
console.log(`[boot] api      = http://${HOST}:${PORT}`);

const db = openDb(DB_PATH);
const rpc = makeRpc(RPC_URL);

startApi({ db, rpc, port: PORT, host: HOST });

runIndexer({
  db,
  rpc,
  batchSize: BATCH_SIZE,
  pollMs: POLL_MS,
  startFrom: START_FROM,
}).catch((err) => {
  console.error('[indexer] fatal:', err);
  process.exit(1);
});

// Graceful shutdown.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[boot] received ${sig}, closing db`);
    db.close();
    process.exit(0);
  });
}
