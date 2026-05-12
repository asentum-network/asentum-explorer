// asentum-explorer · Homepage. Live chain stats, recent blocks list,
// and the latest few transactions across those blocks.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import { getBlockNumber, getBlockByNumber, getValidators, CHAIN_NAME } from '@/lib/rpc';
import { hexToNumber, hexToBigInt, formatAse, shortHash, relativeTime } from '@/lib/format';

const RECENT_BLOCKS = 12;

export default function Home() {
  const [latest, setLatest] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [validatorCount, setValidatorCount] = useState(null);
  const [recentTxs, setRecentTxs] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let interval;

    const refresh = async () => {
      try {
        const head = await getBlockNumber();
        if (cancelled) return;
        setLatest(head);

        const start = Math.max(0, head - RECENT_BLOCKS + 1);
        const numbers = [];
        for (let n = head; n >= start; n--) numbers.push(n);
        const fetched = await Promise.all(numbers.map((n) => getBlockByNumber(n, true).catch(() => null)));
        if (cancelled) return;
        const valid = fetched.filter(Boolean);
        setBlocks(valid);

        // Flatten recent txs across the fetched blocks, capped at 8.
        const txs = [];
        for (const b of valid) {
          for (const tx of (b.transactions || [])) {
            if (typeof tx === 'object') {
              txs.push({ ...tx, blockNumber: b.number, blockTimestamp: b.timestamp });
            }
          }
          if (txs.length >= 8) break;
        }
        setRecentTxs(txs.slice(0, 8));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }

      try {
        const v = await getValidators();
        if (cancelled) return;
        if (Array.isArray(v?.validators)) setValidatorCount(v.validators.length);
        else if (Array.isArray(v)) setValidatorCount(v.length);
      } catch { /* optional endpoint, ignore failure */ }
    };

    refresh();
    interval = setInterval(refresh, 6000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <Layout title="Home" description="Live blocks, transactions, and validators on the Asentum chain.">
      {/* Hero */}
      <section className="dash-border-t px-[4%] py-16 md:py-24 relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <span
            className="font-dm-mono text-xs font-medium tracking-[0.15em] inline-block px-4 py-2"
            style={{ color: '#26CC6B', backgroundColor: '#0A1D12' }}
          >
            ● {CHAIN_NAME} · LIVE
          </span>
          <h1 className="text-[36px] md:text-[56px] font-bold tracking-tight leading-[1.1] font-plus">
            <span className="text-[#ACACAC]">Asentum </span>
            <span className="text-white">Block Explorer.</span>
          </h1>
          <p className="font-dm-mono text-[14px] text-[#7D7D7D] max-w-2xl mx-auto leading-relaxed">
            The post-quantum, JavaScript-native L1. Every block signed with Dilithium3. Validators rotate every block.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="dash-border-t px-[4%] py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-6xl mx-auto">
          <StatCard label="Latest block" value={latest != null ? `#${latest.toLocaleString()}` : '—'} color="#4ADE80" />
          <StatCard label="Block time" value="5.0s" sub="target" />
          <StatCard label="Validators" value={validatorCount != null ? validatorCount : '—'} sub="active" />
          <StatCard label="Signatures" value="Dilithium3" sub="ML-DSA-65" />
        </div>
        {error && (
          <p className="font-dm-mono text-[11px] text-[#F87171] mt-4 max-w-6xl mx-auto">
            RPC error: {error}
          </p>
        )}
      </section>

      {/* Recent blocks + txs */}
      <section className="dash-border-t px-[4%] py-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Blocks */}
          <div>
            <div className="flex items-end justify-between mb-4">
              <h2 className="font-plus text-[20px] font-bold text-white">Recent blocks</h2>
              <Link href="/blocks" className="font-dm-mono text-[11px] text-[#A6A6FF] hover:text-white underline">All blocks →</Link>
            </div>
            <div className="border border-[#1F1F1F] bg-[#0A0A0A]">
              {blocks.length === 0 ? (
                <p className="font-dm-mono text-[12px] text-[#5A5A5A] p-4">Loading…</p>
              ) : (
                blocks.map((b) => {
                  const n = hexToNumber(b.number);
                  const txCount = (b.transactions || []).length;
                  return (
                    <Link
                      key={b.hash}
                      href={`/block/${n}`}
                      className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A1A] last:border-b-0 hover:bg-[#0F0F0F] transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-dm-mono text-[13px] text-white tabular-nums">#{n.toLocaleString()}</p>
                        <p className="font-dm-mono text-[10px] text-[#5A5A5A] mt-0.5">
                          {relativeTime(b.timestamp)} · {b.miner ? shortHash(b.miner, 6, 4) : 'unknown proposer'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-dm-mono text-[12px] text-[#26CC6B] tabular-nums">{txCount} tx</p>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Txs */}
          <div>
            <div className="flex items-end justify-between mb-4">
              <h2 className="font-plus text-[20px] font-bold text-white">Recent transactions</h2>
            </div>
            <div className="border border-[#1F1F1F] bg-[#0A0A0A]">
              {recentTxs.length === 0 ? (
                <p className="font-dm-mono text-[12px] text-[#5A5A5A] p-4">{blocks.length ? 'No transactions in recent blocks.' : 'Loading…'}</p>
              ) : (
                recentTxs.map((tx) => (
                  <Link
                    key={tx.hash}
                    href={`/tx/${tx.hash}`}
                    className="flex items-center justify-between px-4 py-3 border-b border-[#1A1A1A] last:border-b-0 hover:bg-[#0F0F0F] transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-dm-mono text-[12px] text-[#A6A6FF]">{shortHash(tx.hash, 8, 6)}</p>
                      <p className="font-dm-mono text-[10px] text-[#5A5A5A] mt-0.5">
                        {tx.from && (<>from <span className="text-white">{shortHash(tx.from, 6, 4)}</span></>)}
                        {tx.to && (<> → <span className="text-white">{shortHash(tx.to, 6, 4)}</span></>)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-dm-mono text-[12px] text-[#26CC6B] tabular-nums">{formatAse(tx.value)} ASE</p>
                      <p className="font-dm-mono text-[10px] text-[#5A5A5A]">{relativeTime(tx.blockTimestamp)}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
