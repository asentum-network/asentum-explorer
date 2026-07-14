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

// bech32 ase1 encoder (self-contained, BIP-173) — for rendering 20-byte hex
// addresses coming from RPC endpoints that still return hex (e.g. /consensus/state)
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= BECH32_GEN[i];
  }
  return chk;
}
function bech32HrpExpand(hrp) {
  const ret = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >>> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}
function bech32Checksum(hrp, data) {
  const values = bech32HrpExpand(hrp).concat(data).concat([0,0,0,0,0,0]);
  const mod = bech32Polymod(values) ^ 1;
  const ret = [];
  for (let p = 0; p < 6; p++) ret.push((mod >>> (5 * (5 - p))) & 31);
  return ret;
}
function convertBits(data, fromBits, toBits, pad) {
  let acc = 0, bits = 0;
  const ret = [];
  const maxv = (1 << toBits) - 1;
  for (const value of data) {
    if (value < 0 || (value >>> fromBits) !== 0) return null;
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) { bits -= toBits; ret.push((acc >>> bits) & maxv); }
  }
  if (pad) { if (bits > 0) ret.push((acc << (toBits - bits)) & maxv); }
  else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) return null;
  return ret;
}
export function hexToAse1(hex) {
  if (typeof hex !== "string") return hex;
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) return hex;
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substring(i, i + 2), 16));
  const converted = convertBits(bytes, 8, 5, true);
  if (!converted) return hex;
  const combined = converted.concat(bech32Checksum("ase", converted));
  return "ase1" + combined.map((c) => BECH32_CHARSET.charAt(c)).join("");
}
