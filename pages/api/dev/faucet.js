// asentum-explorer · Public faucet relay.
//
// Forwards drip requests to a known-good validator node (which is also
// the only authority that can sign from the faucet account). The public
// validator behind testnet.asentum.com sometimes returns accepted:true
// with a hash that never lands; routing through the primary's local
// /dev/faucet has been reliable in practice.
//
// Rate-limited per IP and per recipient address with in-memory token
// buckets. Resets on every deploy — that's fine for testnet UX.
//
// The /dev/faucet path is exposed via a rewrite in next.config.js, so
// both /api/dev/faucet AND /dev/faucet hit this handler. The wallet bot
// is configured with FAUCET_URL pointing at this host, and constructs
// `${FAUCET_URL}/dev/faucet` for the call.
//
// milkie · 2026

const FAUCET_TARGET = process.env.FAUCET_TARGET_URL || 'http://204.168.132.194:8545';
const DEFAULT_AMOUNT_WEI = (100n * 10n ** 18n).toString(); // 100 ASE
const MAX_AMOUNT_WEI = (500n * 10n ** 18n).toString();     // safety cap

// Rate limits: 1 drip per IP per 60s, 1 drip per recipient per 5 min.
// The per-IP bucket is for casual abuse on the web faucet form. The
// per-recipient bucket is the real teeth — every recipient address
// pays the cooldown regardless of which IP requested.
const IP_COOLDOWN_MS = 60 * 1000;
const RECIPIENT_COOLDOWN_MS = 5 * 60 * 1000;

const ipLastDrip = new Map();        // ip → ms timestamp
const addrLastDrip = new Map();      // addr → ms timestamp

// IPs of trusted server-side callers (the Telegram wallet bot, etc.).
// These bypass the per-IP rate limit since they route many distinct
// end-users through a single source address. The per-recipient
// cooldown still applies, so abuse via one user spamming themselves
// is still rate-limited at the recipient level.
const TRUSTED_IPS = new Set(
  (process.env.FAUCET_TRUSTED_IPS || '178.104.0.193')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function isAddress(s) {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

function takeBucket(map, key, cooldownMs) {
  const now = Date.now();
  const last = map.get(key) || 0;
  const remainingMs = cooldownMs - (now - last);
  if (remainingMs > 0) {
    return { ok: false, retryAfterMs: remainingMs };
  }
  map.set(key, now);
  return { ok: true };
}

function rollbackBucket(map, key, value) {
  if (value == null) map.delete(key);
  else map.set(key, value);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ accepted: false, reason: 'POST required' });
  }

  const body = req.body || {};
  const to = typeof body.to === 'string' ? body.to.toLowerCase().trim() : '';
  if (!isAddress(to)) {
    return res.status(400).json({ accepted: false, reason: 'invalid `to` address' });
  }

  // Amount: optional. Default 100 ASE (in wei). Capped at MAX_AMOUNT_WEI.
  let amountWei;
  if (typeof body.amount === 'string' && body.amount.length > 0) {
    try {
      const n = BigInt(body.amount);
      if (n <= 0n) throw new Error('non-positive');
      const cap = BigInt(MAX_AMOUNT_WEI);
      amountWei = (n > cap ? cap : n).toString();
    } catch {
      return res.status(400).json({ accepted: false, reason: 'invalid `amount` (must be a positive wei string)' });
    }
  } else {
    amountWei = DEFAULT_AMOUNT_WEI;
  }

  const ip = clientIp(req);
  const trusted = TRUSTED_IPS.has(ip);
  const ipPrev = trusted ? undefined : ipLastDrip.get(ip);
  if (!trusted) {
    const ipCheck = takeBucket(ipLastDrip, ip, IP_COOLDOWN_MS);
    if (!ipCheck.ok) {
      res.setHeader('Retry-After', String(Math.ceil(ipCheck.retryAfterMs / 1000)));
      return res.status(429).json({
        accepted: false,
        reason: `IP rate limited — try again in ${Math.ceil(ipCheck.retryAfterMs / 1000)}s`,
        retryAfterMs: ipCheck.retryAfterMs,
      });
    }
  }

  const addrPrev = addrLastDrip.get(to);
  const addrCheck = takeBucket(addrLastDrip, to, RECIPIENT_COOLDOWN_MS);
  if (!addrCheck.ok) {
    // Roll back the IP token (if we took one) — the user didn't actually consume a drip.
    if (!trusted) rollbackBucket(ipLastDrip, ip, ipPrev);
    res.setHeader('Retry-After', String(Math.ceil(addrCheck.retryAfterMs / 1000)));
    return res.status(429).json({
      accepted: false,
      reason: `address rate limited — try again in ${Math.ceil(addrCheck.retryAfterMs / 60_000)}m`,
      retryAfterMs: addrCheck.retryAfterMs,
    });
  }

  // Forward to the upstream faucet.
  let upstream;
  try {
    upstream = await fetch(`${FAUCET_TARGET}/dev/faucet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, amount: amountWei }),
    });
  } catch (err) {
    // Couldn't reach upstream — roll back any tokens we took so the
    // user can retry immediately.
    if (!trusted) rollbackBucket(ipLastDrip, ip, ipPrev);
    rollbackBucket(addrLastDrip, to, addrPrev);
    return res.status(502).json({
      accepted: false,
      reason: `faucet upstream unreachable: ${err.message || err}`,
    });
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    if (!trusted) rollbackBucket(ipLastDrip, ip, ipPrev);
    rollbackBucket(addrLastDrip, to, addrPrev);
    return res.status(502).json({
      accepted: false,
      reason: `faucet upstream returned non-JSON (status ${upstream.status})`,
    });
  }

  // Pass through upstream's shape. If upstream rejected (e.g. rate-limit
  // on its side, or depleted) also roll back our own tokens.
  if (data?.accepted !== true) {
    if (!trusted) rollbackBucket(ipLastDrip, ip, ipPrev);
    rollbackBucket(addrLastDrip, to, addrPrev);
    return res.status(upstream.status === 200 ? 400 : upstream.status).json(data);
  }

  return res.status(200).json({
    accepted: true,
    txHash: data.txHash,
    amountWei,
  });
}
