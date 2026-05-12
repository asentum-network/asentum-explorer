// asentum-explorer · Formatting helpers. wei to ASE, hex to number,
// timestamps to relative strings, identifier shape detection.
//
// milkie · 2026

const ONE_ASE = 10n ** 18n;

export function hexToBigInt(hex) {
  if (hex == null) return 0n;
  if (typeof hex === 'bigint') return hex;
  if (typeof hex === 'number') return BigInt(hex);
  if (typeof hex !== 'string') return 0n;
  return BigInt(hex);
}

export function hexToNumber(hex) {
  if (hex == null) return 0;
  if (typeof hex === 'number') return hex;
  return parseInt(hex, 16);
}

export function formatAse(wei, maxFrac = 4) {
  const n = hexToBigInt(wei);
  const whole = n / ONE_ASE;
  const frac = n % ONE_ASE;
  if (frac === 0n) return whole.toLocaleString();
  let fracStr = frac.toString().padStart(18, '0').slice(0, maxFrac).replace(/0+$/, '');
  if (!fracStr) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function formatGwei(wei) {
  const n = hexToBigInt(wei);
  const gwei = n / 1_000_000_000n;
  const remainder = n % 1_000_000_000n;
  if (remainder === 0n) return gwei.toString();
  return `${gwei}.${remainder.toString().padStart(9, '0').replace(/0+$/, '')}`;
}

export function shortHash(h, head = 6, tail = 4) {
  if (!h) return '';
  if (h.length <= head + tail + 2) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function isHash(s) { return typeof s === 'string' && /^0x[0-9a-fA-F]{64}$/.test(s); }
export function isAddress(s) { return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s); }
export function isBlockNumber(s) { return typeof s === 'string' && /^\d+$/.test(s); }

export function relativeTime(unixSec) {
  if (!unixSec) return '';
  const n = typeof unixSec === 'string' ? parseInt(unixSec, 16) : unixSec;
  const diff = Math.floor(Date.now() / 1000) - n;
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function absTime(unixSec) {
  if (!unixSec) return '';
  const n = typeof unixSec === 'string' ? parseInt(unixSec, 16) : unixSec;
  return new Date(n * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}
