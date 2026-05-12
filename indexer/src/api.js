// asentum-indexer · HTTP API. Exposes /health, /address/:addr/stats,
// /address/:addr/txs. Bound to 127.0.0.1 in production; the Next.js
// explorer proxies browser traffic through its /api/indexer route.
//
// milkie · 2026

import { createServer } from 'node:http';
import { URL } from 'node:url';
import { txsForAddress, statsForAddress, indexHealth, recentTxs, globalStats } from './db.js';

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

export function startApi({ db, rpc, port, host }) {
  const server = createServer(async (req, res) => {
    // Lenient CORS for local-dev convenience. In production the indexer
    // sits behind localhost and only Next.js reaches it, so the headers
    // are effectively no-ops.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = u.pathname;

      if (path === '/health') {
        const stats = indexHealth(db);
        let head = null;
        let lag = null;
        try {
          head = await rpc.getBlockNumber();
          lag = head - stats.lastIndexedBlock;
        } catch {}
        return json(res, 200, { ok: true, ...stats, head, lag });
      }

      // Network-wide aggregate counts.
      if (path === '/stats') {
        return json(res, 200, globalStats(db));
      }

      // Latest N transactions across the whole chain, regardless of address.
      if (path === '/txs/recent') {
        const limit = Math.min(50, Math.max(1, parseInt(u.searchParams.get('limit') || '13', 10)));
        return json(res, 200, { rows: recentTxs(db, limit) });
      }

      // /address/:addr/txs?page=&size=&role=
      const txMatch = path.match(/^\/address\/(0x[0-9a-fA-F]{40})\/txs$/);
      if (txMatch) {
        const addr = txMatch[1];
        const page = Math.max(1, parseInt(u.searchParams.get('page') || '1', 10));
        const size = Math.min(100, Math.max(1, parseInt(u.searchParams.get('size') || '25', 10)));
        const role = u.searchParams.get('role'); // 'from' | 'to' | 'created' | null
        const result = txsForAddress(db, addr, { page, size, role });
        return json(res, 200, result);
      }

      // /address/:addr/stats
      const statMatch = path.match(/^\/address\/(0x[0-9a-fA-F]{40})\/stats$/);
      if (statMatch) {
        return json(res, 200, statsForAddress(db, statMatch[1]));
      }

      return json(res, 404, { error: 'not found' });
    } catch (err) {
      console.error('[api] handler error:', err);
      return json(res, 500, { error: err?.message || 'internal error' });
    }
  });

  server.listen(port, host, () => {
    console.log(`[api] listening on http://${host}:${port}`);
  });

  return server;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
