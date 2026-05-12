// asentum-explorer · Ethereum-style JSON-RPC client used by every page
// for live chain reads. Endpoint resolves from NEXT_PUBLIC_RPC_URL.
//
// milkie · 2026

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://testnet.asentum.com';
export const CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || '1337';
export const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME || 'Testnet';

let rpcId = 1;

export async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'rpc error');
  return data.result;
}

export async function rpcBatch(calls) {
  // calls: [{ method, params }, ...]
  const body = calls.map((c, i) => ({
    jsonrpc: '2.0',
    id: i + 1,
    method: c.method,
    params: c.params || [],
  }));
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const data = await res.json();
  // Some servers respond to batch with single object; normalize.
  const arr = Array.isArray(data) ? data : [data];
  return arr
    .sort((a, b) => a.id - b.id)
    .map((r) => (r.error ? null : r.result));
}

// Hit a non-RPC endpoint on the node (e.g. /validators, /metadata).
export async function rpcGet(path) {
  const base = RPC_URL.replace(/\/+$/, '');
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}

// Convenience wrappers.
export const getBlockNumber = async () => parseInt(await rpc('eth_blockNumber'), 16);
export const getBlockByNumber = (n, full = true) =>
  rpc('eth_getBlockByNumber', [typeof n === 'string' ? n : '0x' + n.toString(16), full]);
export const getBlockByHash = (h, full = true) => rpc('eth_getBlockByHash', [h, full]);
export const getTx = (h) => rpc('eth_getTransactionByHash', [h]);
export const getReceipt = (h) => rpc('eth_getTransactionReceipt', [h]);
export const getBalance = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));
export const getCode = (a) => rpc('eth_getCode', [a, 'latest']);
export const getTxCount = async (a) => parseInt(await rpc('eth_getTransactionCount', [a, 'latest']), 16);
export const getValidators = () => rpcGet('/validators');
export const getChainInfo = () => rpcGet('/metadata').catch(() => null);
