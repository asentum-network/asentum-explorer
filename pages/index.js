// asentum-explorer · Homepage. Live chain stats sourced from RPC + the
// /validators node endpoint + the local indexer, plus side-by-side feeds
// of recent blocks and recent transactions.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { getBlockNumber, getBlockByNumber, getValidators, getChainInfo, CHAIN_NAME, CHAIN_ID } from '@/lib/rpc';
import { hexToNumber, formatAse, shortHash, relativeTime } from '@/lib/format';

// Inline stat cell for the hero band. No background or border; visually
// separated from siblings by the page-level dashed rails (top + right).
function Stat({ label, value, sub, color, top, right }) {
  // Plain CSS classes for top + right collide because both define
  // background-image. Use the combined helper class when both are needed.
  let lineClass = '';
  if (top && right) lineClass = 'dash-t-and-r-desktop';
  else if (top) lineClass = 'dash-border-t';
  else if (right) lineClass = 'dash-sep-r-desktop';
  const classes = [
    'flex flex-col items-center justify-center text-center px-6 py-12 min-h-[180px]',
    lineClass,
  ].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#5A5A5A] mb-3">{label}</p>
      <p
        className="font-plus text-[28px] md:text-[36px] font-bold tabular-nums leading-none"
        style={{ color: color || '#FFFFFF' }}
      >
        {value}
      </p>
      {sub && <p className="font-dm-mono text-[11px] text-[#7D7D7D] mt-3 leading-relaxed">{sub}</p>}
    </div>
  );
}

const RECENT_BLOCKS = 13;
const RECENT_TXS = 13;
const ONE_ASE = 10n ** 18n;

export default function Home() {
  const [latest, setLatest] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [validators, setValidators] = useState(null);
  const [validatorMeta, setValidatorMeta] = useState({});
  const [chainMeta, setChainMeta] = useState(null);
  const [indexerStats, setIndexerStats] = useState(null);
  const [indexerHealth, setIndexerHealth] = useState(null);
  const [recentTxs, setRecentTxs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let interval;

    const refresh = async () => {
      // Chain stats from RPC.
      try {
        const head = await getBlockNumber();
        if (cancelled) return;
        setLatest(head);
        const start = Math.max(0, head - RECENT_BLOCKS + 1);
        const numbers = [];
        for (let n = head; n >= start; n--) numbers.push(n);
        const fetched = await Promise.all(numbers.map((n) => getBlockByNumber(n, false).catch(() => null)));
        if (cancelled) return;
        setBlocks(fetched.filter(Boolean));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }

      // Validators (count, bonded total).
      try {
        const v = await getValidators();
        if (cancelled) return;
        const list = Array.isArray(v?.validators) ? v.validators : Array.isArray(v) ? v : [];
        setValidators(list);
        let totalBonded = 0n;
        for (const x of list) {
          const stake = x.stake || x.bondedStake || x.amount || '0';
          try { totalBonded += BigInt(stake); } catch {}
        }
        setValidatorMeta({
          count: v?.count ?? list.length,
          stakingContract: v?.stakingContract,
          totalBondedWei: totalBonded.toString(),
        });
      } catch { /* optional endpoint */ }

      // Chain metadata.
      try {
        const m = await getChainInfo();
        if (!cancelled && m) setChainMeta(m);
      } catch { /* optional */ }

      // Indexer-sourced data.
      try {
        const [statsRes, txsRes, healthRes] = await Promise.all([
          fetch('/api/indexer/stats').then((r) => r.ok ? r.json() : null),
          fetch(`/api/indexer/txs/recent?limit=${RECENT_TXS}`).then((r) => r.ok ? r.json() : null),
          fetch('/api/indexer/health').then((r) => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;
        if (statsRes) setIndexerStats(statsRes);
        if (txsRes) setRecentTxs(txsRes.rows || []);
        if (healthRes) setIndexerHealth(healthRes);
      } catch { /* indexer optional */ }
    };

    refresh();
    interval = setInterval(refresh, 6000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const validatorCount = validatorMeta.count ?? (validators ? validators.length : null);
  const totalBondedAse = validatorMeta.totalBondedWei
    ? (BigInt(validatorMeta.totalBondedWei) / ONE_ASE).toString()
    : null;

  return (
    <Layout title="Home" description="Live blocks, transactions, validators, and indexed network stats on the Asentum chain.">
      {/* Hero */}
      <section className="dash-border-t px-[4%] py-16 md:py-20 relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center space-y-5">
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
            The post-quantum, JavaScript-native L1. Every block, vote, and transaction signed with Dilithium3.
          </p>
        </div>
      </section>

      {/* Primary chain stats — full-width band, dashed separators */}
      <section className="dash-border-t">
        <div className="grid grid-cols-1 md:grid-cols-3 px-[4%]">
          <Stat
            label="Latest block"
            value={latest != null ? `#${latest.toLocaleString()}` : '—'}
            color="#4ADE80"
            sub={chainMeta?.chainName || CHAIN_NAME}
            right
          />
          <Stat
            label="Validators"
            value={validatorCount != null ? validatorCount : '—'}
            sub={totalBondedAse ? `${Number(totalBondedAse).toLocaleString()} ASE bonded` : 'active set'}
            right
          />
          <Stat
            label="Signatures"
            value="Dilithium3"
            sub="ML-DSA-65 · 3,309 bytes"
            color="#A6A6FF"
          />

          <Stat
            label="Indexed txs"
            value={indexerStats ? indexerStats.totalTxs.toLocaleString() : '—'}
            sub="all-time"
            top
            right
          />
          <Stat
            label="Unique addresses"
            value={indexerStats ? indexerStats.distinctAddresses.toLocaleString() : '—'}
            sub="seen on-chain"
            top
            right
          />
          <Stat
            label="Contracts"
            value={indexerStats ? indexerStats.contractsCreated.toLocaleString() : '—'}
            sub="deployed"
            top
          />
        </div>
        {(indexerHealth?.lag > 5 || error) && (
          <div className="px-[4%] py-3 dash-border-t">
            {indexerHealth?.lag > 5 && (
              <p className="font-dm-mono text-[11px] text-[#F29751]">
                Indexer is {indexerHealth.lag} blocks behind. Catching up…
              </p>
            )}
            {error && (
              <p className="font-dm-mono text-[11px] text-[#F87171]">
                RPC error: {error}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Recent blocks + txs */}
      <section className="dash-border-t px-[4%] py-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent blocks */}
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
                      className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#1A1A1A] last:border-b-0 hover:bg-[#0F0F0F] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="font-dm-mono text-[13px] text-white tabular-nums">#{n.toLocaleString()}</p>
                          <p className="font-dm-mono text-[10px] text-[#5A5A5A]">{relativeTime(b.timestamp)}</p>
                        </div>
                        <p className="font-dm-mono text-[10px] text-[#7D7D7D] mt-1 truncate">
                          <span className="text-[#5A5A5A]">Proposer </span>
                          {b.miner ? (
                            <span className="text-[#A6A6FF]">{shortHash(b.miner, 8, 6)}</span>
                          ) : (
                            <span className="text-[#5A5A5A]">unknown</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-dm-mono text-[12px] tabular-nums" style={{ color: txCount > 0 ? '#26CC6B' : '#5A5A5A' }}>
                          {txCount} tx
                        </p>
                        {b.gasUsed && (
                          <p className="font-dm-mono text-[10px] text-[#5A5A5A] mt-1">
                            {hexToNumber(b.gasUsed).toLocaleString()} gas
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* Recent transactions (indexer-sourced) */}
          <div>
            <div className="flex items-end justify-between mb-4">
              <h2 className="font-plus text-[20px] font-bold text-white">Recent transactions</h2>
              <span className="font-dm-mono text-[11px] text-[#5A5A5A]">across all blocks</span>
            </div>
            <div className="border border-[#1F1F1F] bg-[#0A0A0A]">
              {recentTxs === null ? (
                <p className="font-dm-mono text-[12px] text-[#5A5A5A] p-4">Loading…</p>
              ) : recentTxs.length === 0 ? (
                <p className="font-dm-mono text-[12px] text-[#5A5A5A] p-4">No transactions indexed yet.</p>
              ) : (
                recentTxs.map((tx) => (
                  <Link
                    key={tx.hash}
                    href={`/tx/${tx.hash}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#1A1A1A] last:border-b-0 hover:bg-[#0F0F0F] transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="font-dm-mono text-[12px] text-[#A6A6FF]">{shortHash(tx.hash, 8, 6)}</p>
                        <p className="font-dm-mono text-[10px] text-[#5A5A5A]">{relativeTime(tx.timestamp)}</p>
                      </div>
                      <p className="font-dm-mono text-[10px] text-[#7D7D7D] mt-1 truncate">
                        <span className="text-white">{shortHash(tx.from_addr, 6, 4)}</span>
                        {' → '}
                        {tx.to_addr ? (
                          <span className="text-white">{shortHash(tx.to_addr, 6, 4)}</span>
                        ) : tx.contract_created ? (
                          <span className="text-[#A6A6FF]">contract deploy</span>
                        ) : (
                          <span className="text-[#F29751]">contract creation</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-dm-mono text-[12px] text-[#26CC6B] tabular-nums">{formatAse(tx.value)} ASE</p>
                      <p className="font-dm-mono text-[10px] text-[#5A5A5A] mt-1">
                        block #{tx.block_number.toLocaleString()}
                      </p>
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
