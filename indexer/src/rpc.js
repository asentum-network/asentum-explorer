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

    // Resolve responses by id, not by array position. Some RPC servers
    // silently drop entries from batched responses (return a shorter
    // array than calls.length); the previous "sort+map" approach
    // assumed 1:1 positional alignment and would map shifted entries
    // to the wrong call slot. The indexer's loop then attributed
    // results to the wrong block number and advanced last_indexed_block
    // past blocks that were never recorded — the 4k-block gap discovered
    // 2026-06-07. Building an id→response map and materialising a fixed
    // calls.length-sized array (null at dropped positions) restores
    // strict positional alignment; the caller's existing null-handling
    // then triggers a clean retry on the next tick.
    const byId = new Map();
    for (const r of arr) if (r && typeof r.id === 'number') byId.set(r.id, r);
    const out = new Array(calls.length).fill(null);
    for (let i = 0; i < calls.length; i++) {
      const r = byId.get(i + 1);
      if (r && !r.error) out[i] = r.result;
    }
    return out;
  }

  const getBlockNumber = async () => parseInt(await call('eth_blockNumber'), 16);
  const getBlockByNumber = (n, full = true) =>
    call('eth_getBlockByNumber', [typeof n === 'string' ? n : '0x' + n.toString(16), full]);
  const getReceipt = (h) => call('eth_getTransactionReceipt', [h]);

  return { call, batch, getBlockNumber, getBlockByNumber, getReceipt };
}
