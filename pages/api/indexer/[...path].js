// asentum-explorer · Catch-all proxy to the sibling indexer service.
// The indexer binds to 127.0.0.1 only; browsers reach it via this proxy
// on the same origin as the explorer, so no CORS is needed.
//
// milkie · 2026

const INDEXER_URL = process.env.INDEXER_URL || 'http://127.0.0.1:3002';

export default async function handler(req, res) {
  const { path = [], ...query } = req.query;
  const subPath = Array.isArray(path) ? path.join('/') : path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v == null) continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.append(k, String(v));
  }
  const url = `${INDEXER_URL}/${subPath}${qs.toString() ? `?${qs}` : ''}`;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: 'indexer unreachable', detail: err?.message });
  }
}
