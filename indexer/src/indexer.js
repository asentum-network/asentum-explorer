// asentum-indexer · Block scanner. Backfills from genesis (or START_FROM)
// then tails the head, writing block + tx rows into SQLite.
//
// milkie · 2026

import { getMeta, setMeta, insertBlockTxs } from './db.js';

// Idempotent. INSERT OR REPLACE keys on tx hash, so re-running over already
// indexed blocks just rewrites the same rows.
export async function runIndexer({ db, rpc, batchSize = 25, pollMs = 3000, startFrom = 0 }) {
  let nextBlock = (() => {
    const stored = getMeta(db, 'last_indexed_block');
    if (stored !== null) return parseInt(stored, 10) + 1;
    if (startFrom === 'latest') return null; // resolved on first tick
    return Math.max(0, parseInt(String(startFrom), 10));
  })();

  console.log(`[indexer] starting; next block = ${nextBlock === null ? 'latest' : nextBlock}`);

  // Resolve 'latest' once.
  if (nextBlock === null) {
    const head = await rpc.getBlockNumber();
    nextBlock = head + 1;
    console.log(`[indexer] start_from=latest resolved to block ${nextBlock}`);
  }

  while (true) {
    let head;
    try {
      head = await rpc.getBlockNumber();
    } catch (err) {
      console.error('[indexer] head fetch failed:', err.message);
      await sleep(pollMs);
      continue;
    }

    if (nextBlock > head) {
      // Caught up. Wait for new blocks.
      await sleep(pollMs);
      continue;
    }

    // Build a batch of block-fetches.
    const end = Math.min(head, nextBlock + batchSize - 1);
    const calls = [];
    for (let n = nextBlock; n <= end; n++) {
      calls.push({ method: 'eth_getBlockByNumber', params: ['0x' + n.toString(16), true] });
    }

    let blocks;
    try {
      blocks = await rpc.batch(calls);
    } catch (err) {
      console.error('[indexer] block batch failed:', err.message);
      await sleep(pollMs);
      continue;
    }

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const expectedBlockNum = nextBlock + i;
      if (!block) {
        console.error(`[indexer] block ${expectedBlockNum} returned null, retrying next tick`);
        break;
      }

      // Fetch receipts. gasUsed + status come from the receipt, not the tx body.
      const txs = block.transactions || [];
      let receiptsByHash = {};
      if (txs.length > 0) {
        try {
          const receipts = await rpc.batch(
            txs.map((tx) => ({ method: 'eth_getTransactionReceipt', params: [tx.hash] })),
          );
          for (let j = 0; j < txs.length; j++) {
            if (receipts[j]) receiptsByHash[txs[j].hash.toLowerCase()] = receipts[j];
          }
        } catch (err) {
          console.error(`[indexer] receipt batch failed for block ${expectedBlockNum}:`, err.message);
          // Continue without receipts. Partial index beats stalling on a transient RPC blip.
        }
      }

      try {
        insertBlockTxs(db, block, receiptsByHash);
        setMeta(db, 'last_indexed_block', expectedBlockNum);
        if (txs.length > 0) {
          console.log(`[indexer] block ${expectedBlockNum} · ${txs.length} tx${txs.length === 1 ? '' : 's'}`);
        }
        nextBlock = expectedBlockNum + 1;
      } catch (err) {
        console.error(`[indexer] write failed for block ${expectedBlockNum}:`, err.message);
        await sleep(pollMs);
        break;
      }
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
