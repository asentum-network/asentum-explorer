// asentum-explorer · Validators page. Reads the node's /validators
// endpoint for membership + stake, and merges in proposer counts from
// the local indexer's blocks table.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { getValidators } from '@/lib/rpc';
import { shortHash, formatAse } from '@/lib/format';

const ONE_ASE = 10n ** 18n;
// Block production window for the "Recent" column. 10,000 blocks at 5s
// each is roughly 13.9 hours of activity, enough to surface validators
// that are producing now without including ancient history.
const RECENT_WINDOW = 10000;

function Stat({ label, value, sub, color, top, right }) {
  // Plain CSS classes for top + right collide because both define
  // background-image. Use the combined helper class when both are needed.
  let lineClass = '';
  if (top && right) lineClass = 'dash-t-and-r-desktop';
  else if (top) lineClass = 'dash-border-t';
  else if (right) lineClass = 'dash-sep-r-desktop';
  const classes = [
    'flex flex-col items-center justify-center text-center px-6 py-10 min-h-[160px]',
    lineClass,
  ].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#5A5A5A] mb-3">{label}</p>
      <p
        className="font-plus text-[26px] md:text-[32px] font-bold tabular-nums leading-none"
        style={{ color: color || '#FFFFFF' }}
      >
        {value}
      </p>
      {sub && <p className="font-dm-mono text-[11px] text-[#7D7D7D] mt-2 leading-relaxed">{sub}</p>}
    </div>
  );
}

export default function ValidatorsPage() {
  const [data, setData] = useState(null);
  const [proposerStats, setProposerStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const fetchOnce = async () => {
      try {
        const v = await getValidators();
        if (cancelled) return;
        setData(v);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      try {
        const r = await fetch(`/api/indexer/validators/proposer-stats?window=${RECENT_WINDOW}`);
        if (!r.ok) return;
        const ps = await r.json();
        if (!cancelled) setProposerStats(ps);
      } catch { /* indexer optional */ }
    };
    fetchOnce();
    timer = setInterval(fetchOnce, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Derived membership stats.
  const validators = Array.isArray(data?.validators) ? data.validators : [];
  const total = data?.count ?? validators.length;
  const activeCount = validators.filter((v) => (v.status || 'active') === 'active').length;
  let totalBondedWei = 0n;
  for (const v of validators) {
    try { totalBondedWei += BigInt(v.stake || v.bondedStake || v.amount || '0'); } catch {}
  }
  const totalBondedAse = (totalBondedWei / ONE_ASE).toString();
  const recentProposerCount = proposerStats?.recentProposerCount ?? null;
  const perValidator = proposerStats?.perValidator || {};

  return (
    <Layout title="Validators">
      <section className="dash-border-t px-[4%] py-10">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-plus text-[28px] md:text-[36px] font-bold text-white mb-2">Validators</h1>
          <p className="font-dm-mono text-[12px] text-[#7D7D7D]">
            Active set rebuilt every block from on-chain bonded stake. Block-production counts below cover the last {RECENT_WINDOW.toLocaleString()} blocks (~{Math.round(RECENT_WINDOW * 5 / 3600)}h of chain activity).
          </p>
        </div>
      </section>

      {/* Stats band */}
      <section className="dash-border-t">
        <div className="grid grid-cols-1 md:grid-cols-3">
          <Stat
            label="Total validators"
            value={total != null ? total : '—'}
            sub="bonded into the staking contract"
            right
          />
          <Stat
            label="Active set"
            value={activeCount}
            sub={`${activeCount} of ${total} bonded`}
            color="#4ADE80"
            right
          />
          <Stat
            label="Recent proposers"
            value={recentProposerCount != null ? recentProposerCount : '—'}
            sub={`last ${RECENT_WINDOW.toLocaleString()} blocks`}
            color="#A6A6FF"
          />
          <Stat
            label="Total bonded"
            value={`${Number(totalBondedAse).toLocaleString()}`}
            sub="ASE locked across the set"
            top
            right
          />
          <Stat
            label="Min self-bond"
            value="50,000"
            sub="ASE per validator (chain-enforced)"
            top
            right
          />
          <Stat
            label="Reward cap"
            value="10%"
            sub="per-block, anti-concentration"
            color="#F29751"
            top
          />
        </div>
      </section>

      {error && (
        <section className="dash-border-t px-[4%] py-4">
          <p className="font-dm-mono text-[12px] text-[#F87171]">{error}</p>
        </section>
      )}

      {/* Validator table */}
      <section className="dash-border-t px-[4%] py-10">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-plus font-bold text-white text-[18px] mb-4">All validators</h2>
          <div className="border border-[#1F1F1F] bg-[#0A0A0A] overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#0F0F0F] border-b border-[#1F1F1F]">
                <tr>
                  <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">#</th>
                  <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Address</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Bonded</th>
                  <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Status</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Blocks total</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]" title={`Blocks proposed in the last ${RECENT_WINDOW.toLocaleString()} blocks`}>Recent ({RECENT_WINDOW >= 1000 ? `${RECENT_WINDOW / 1000}k` : RECENT_WINDOW})</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Bonded at</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Pubkey size</th>
                </tr>
              </thead>
              <tbody>
                {validators.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 font-dm-mono text-[12px] text-[#5A5A5A] text-center">Loading…</td></tr>
                )}
                {validators
                  .slice()
                  .sort((a, b) => {
                    const pa = perValidator[a.address?.toLowerCase()]?.recentBlocks || 0;
                    const pb = perValidator[b.address?.toLowerCase()]?.recentBlocks || 0;
                    if (pa !== pb) return pb - pa;
                    try { return BigInt(b.stake || '0') > BigInt(a.stake || '0') ? 1 : -1; } catch { return 0; }
                  })
                  .map((v, i) => {
                    const addr = (v.address || '').toLowerCase();
                    const stake = v.stake || '0';
                    const isActive = (v.status || 'active') === 'active';
                    const stats = perValidator[addr];
                    const recent = stats?.recentBlocks ?? 0;
                    const totalBlocks = stats?.totalBlocks ?? 0;
                    const isRecentlyActive = recent > 0;
                    return (
                      <tr key={addr || i} className="border-b border-[#1A1A1A] hover:bg-[#0F0F0F]">
                        <td className="px-4 py-3 font-dm-mono text-[#5A5A5A] tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3">
                          {addr ? (
                            <Link href={`/address/${addr}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                              {shortHash(addr, 8, 6)}
                            </Link>
                          ) : <span className="text-[#5A5A5A]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-dm-mono text-white tabular-nums">
                          {formatAse(stake)} ASE
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-block font-dm-mono text-[10px] tracking-[0.1em] uppercase px-2 py-1"
                            style={
                              isRecentlyActive
                                ? { color: '#4ADE80', backgroundColor: '#0A1408', border: '1px solid #1A3A1A' }
                                : isActive
                                ? { color: '#F29751', backgroundColor: '#231409', border: '1px solid #4A2911' }
                                : { color: '#7D7D7D', backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A' }
                            }
                          >
                            {isRecentlyActive ? 'Proposing' : isActive ? 'Bonded' : v.status || 'Idle'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-dm-mono text-[#CACACA] tabular-nums">
                          {totalBlocks.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-dm-mono tabular-nums" style={{ color: recent > 0 ? '#4ADE80' : '#5A5A5A' }}>
                          {recent}
                        </td>
                        <td className="px-4 py-3 text-right font-dm-mono text-[#7D7D7D] tabular-nums">
                          {v.bondedAt ? `#${parseInt(v.bondedAt, 10).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-dm-mono text-[#7D7D7D] tabular-nums" title="ML-DSA-65 public key">
                          {v.pubKeySize ? `${v.pubKeySize.toLocaleString()} B` : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {data?.stakingContract && (
            <p className="font-dm-mono text-[11px] text-[#5A5A5A] mt-3">
              Staking contract:{' '}
              <Link href={`/address/${data.stakingContract.toLowerCase()}`} className="text-[#A6A6FF] hover:text-white underline">
                {data.stakingContract}
              </Link>
            </p>
          )}
        </div>
      </section>
    </Layout>
  );
}
