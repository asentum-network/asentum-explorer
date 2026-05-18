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

// The chain's per-validator faucet keeps a local nonce counter; if one
// validator's counter falls behind / collides, its /dev/faucet returns
// "duplicate or mempool full" until it self-corrects. We rotate across
// the healthy validators on each request, and on a per-call failure
// we fall back to the next one in line. Comma-separated, in order of
// preference.
const FAUCET_TARGETS = (
  process.env.FAUCET_TARGET_URL ||
  'http://178.104.168.222:8545,http://87.99.145.52:8545,http://5.78.196.152:8545,http://5.223.89.82:8545'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const DEFAULT_AMOUNT_WEI = (100n * 10n ** 18n).toString();    // 100 ASE

// Two-tier cap:
//   - Web faucet (no token):  max 500 ASE   — generous casual use
//   - Validator bootstrap:    max 51,000 ASE — bond + gas buffer
//
// The validator tier requires `X-Asentum-Faucet-Kind: validator` plus a
// matching `X-Asentum-Faucet-Token` header. The token is shared with
// the one-liner installer + the Operator app at build time. It is NOT
// a real secret — anyone reverse-engineering the binary can read it —
// but it raises the friction enough to stop drive-by frontend abuse
// (which is what was happening: a request from the web page that just
// happens to pass `amount` could otherwise drain the faucet 51K at a
// time, gated only by the rate-limit cooldowns). The per-IP and
// per-recipient cooldowns below still bound the worst case.
const PUBLIC_MAX_AMOUNT_WEI    = (500n    * 10n ** 18n).toString();
const VALIDATOR_MAX_AMOUNT_WEI = (51_000n * 10n ** 18n).toString();
const VALIDATOR_FAUCET_TOKEN =
  process.env.VALIDATOR_FAUCET_TOKEN || 'asentum-validator-2026';

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

// Monotonically-incrementing counter used to round-robin the
// validator targets, so we don't always hit the same one first.
let _rotate = 0;
function rotateOffset() { return _rotate++; }

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

  // Decide the cap based on request kind. Validator-tier requests must
  // present both headers; web requests get the public cap.
  const faucetKind = String(req.headers['x-asentum-faucet-kind'] || '').toLowerCase();
  const faucetToken = String(req.headers['x-asentum-faucet-token'] || '');
  const isValidatorTier =
    faucetKind === 'validator' && faucetToken === VALIDATOR_FAUCET_TOKEN;
  const capWei = isValidatorTier ? VALIDATOR_MAX_AMOUNT_WEI : PUBLIC_MAX_AMOUNT_WEI;

  // Amount: optional. Default 100 ASE (in wei). Capped at the selected tier.
  let amountWei;
  if (typeof body.amount === 'string' && body.amount.length > 0) {
    try {
      const n = BigInt(body.amount);
      if (n <= 0n) throw new Error('non-positive');
      const cap = BigInt(capWei);
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

  // Forward to the upstream faucet, falling through the validator list on
  // transient failures (network / "duplicate or mempool full" / bad JSON).
  // Try targets in a rotated order so we don't always hammer the first one.
  const rotated = [
    ...FAUCET_TARGETS.slice(rotateOffset() % FAUCET_TARGETS.length),
    ...FAUCET_TARGETS.slice(0, rotateOffset() % FAUCET_TARGETS.length),
  ];
  let data = null;
  let lastReason = 'no targets configured';
  let lastStatus = 502;
  for (const target of rotated) {
    let upstream;
    try {
      upstream = await fetch(`${target}/dev/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, amount: amountWei }),
      });
    } catch (err) {
      lastReason = `unreachable (${target}): ${err.message || err}`;
      continue;
    }
    let body;
    try { body = await upstream.json(); }
    catch { lastReason = `non-JSON from ${target} (status ${upstream.status})`; lastStatus = 502; continue; }
    if (body?.accepted === true) { data = body; break; }
    // Retryable validator-side rejections: "duplicate or mempool full"
    // or anything else that's clearly the validator's fault.
    const reason = String(body?.reason || '');
    if (reason.includes('duplicate') || reason.includes('mempool full') || reason.includes('nonce')) {
      lastReason = `${target}: ${reason}`;
      continue;
    }
    // Non-retryable (rate limit, bad input, depleted): pass through immediately.
    if (!trusted) rollbackBucket(ipLastDrip, ip, ipPrev);
    rollbackBucket(addrLastDrip, to, addrPrev);
    return res.status(upstream.status === 200 ? 400 : upstream.status).json(body);
  }

  if (!data) {
    if (!trusted) rollbackBucket(ipLastDrip, ip, ipPrev);
    rollbackBucket(addrLastDrip, to, addrPrev);
    return res.status(lastStatus).json({
      accepted: false,
      reason: `faucet failed across all targets: ${lastReason}`,
    });
  }

  return res.status(200).json({
    accepted: true,
    txHash: data.txHash,
    amountWei,
  });
}
