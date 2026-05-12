// asentum-indexer · JSON-RPC client with batch support. No deps, pure fetch.
//
// milkie · 2026

let id = 1;

export function makeRpc(url) {
  async function call(method, params = []) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || 'rpc error');
    return data.result;
  }

  async function batch(calls) {
    // calls: [{ method, params }, ...]
    if (calls.length === 0) return [];
    const body = calls.map((c, i) => ({
      jsonrpc: '2.0', id: i + 1, method: c.method, params: c.params || [],
    }));
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [data];
    return arr.sort((a, b) => a.id - b.id).map((r) => (r.error ? null : r.result));
  }

  const getBlockNumber = async () => parseInt(await call('eth_blockNumber'), 16);
  const getBlockByNumber = (n, full = true) =>
    call('eth_getBlockByNumber', [typeof n === 'string' ? n : '0x' + n.toString(16), full]);
  const getReceipt = (h) => call('eth_getTransactionReceipt', [h]);

  return { call, batch, getBlockNumber, getBlockByNumber, getReceipt };
}
