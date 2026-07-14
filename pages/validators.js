import { hexToAse1 } from "../lib/format";
// asentum-explorer · Validators page. Reads three live node endpoints:
//   /validators         — full bonded set (stake, status, participation)
//   /participation      — per-validator heartbeat over a sliding window
//                         (signedBlocks, participationRatio, last seen)
//   /consensus/state    — current scheduled proposer (height/round/proposer)
//
// Replaces the older "recent proposers via indexer" flow — those counts
// were a proxy for liveness. Phase B's heartbeat data is the ground truth.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { getValidators, getParticipation, getConsensusState } from '@/lib/rpc';
import { shortHash, formatAse } from '@/lib/format';

const ONE_ASE = 10n ** 18n;
// Heartbeat window. 200 blocks at ~4–5s = ~15 minutes — long enough for a
// briefly-restarted validator not to look dormant, short enough that real
// outages surface quickly.
const HEARTBEAT_LOOKBACK = 200;

function Stat({ label, value, sub, color, top, right }) {
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

// Phase B liveness statuses ranked by health for sort ordering. signing is
// the healthy state; idle = bonded, eligible, but no recent sign; dormant =
// missed the entire window.
const STATUS_STYLE = {
  signing: { label: 'SIGNING', color: '#4ADE80', bg: '#0A1408', border: '#1A3A1A' },
  idle:    { label: 'IDLE',    color: '#F29751', bg: '#231409', border: '#4A2911' },
  dormant: { label: 'DORMANT', color: '#7D7D7D', bg: '#1A1A1A', border: '#2A2A2A' },
};
const STATUS_RANK = { signing: 0, idle: 1, dormant: 2, pending: 3 };

export default function ValidatorsPage() {
  const [data, setData] = useState(null);
  const [participation, setParticipation] = useState(null);
  const [consensus, setConsensus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const fetchOnce = async () => {
      try {
        const [v, p, c] = await Promise.all([
          getValidators(),
          getParticipation(HEARTBEAT_LOOKBACK).catch(() => null),
          getConsensusState().catch(() => null),
        ]);
        if (cancelled) return;
        setData(v);
        setParticipation(p);
        setConsensus(c);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    fetchOnce();
    timer = setInterval(fetchOnce, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  const validators = Array.isArray(data?.validators) ? data.validators : [];
  const total = data?.count ?? validators.length;
  let totalBondedWei = 0n;
  for (const v of validators) {
    try { totalBondedWei += BigInt(v.stake || '0'); } catch {}
  }
  const totalBondedAse = (totalBondedWei / ONE_ASE).toString();

  // Heartbeat lookup keyed by address.
  const partByAddr = {};
  if (Array.isArray(participation?.validators)) {
    for (const p of participation.validators) {
      if (p.address) partByAddr[p.address.toLowerCase()] = p;
    }
  }
  const signingCount = participation?.signing ?? null;
  const idleCount = participation?.idle ?? null;
  const dormantCount = participation?.dormant ?? null;
  const heartbeatHead = participation?.head ? parseInt(participation.head, 10) : null;
  const heartbeatFrom = participation?.scannedFrom ? parseInt(participation.scannedFrom, 10) : null;

  // Currently-scheduled proposer (next-block leader from BFT engine).
  const scheduledProposerHex = consensus?.proposer?.toLowerCase?.() || null;
  const scheduledProposer = scheduledProposerHex ? hexToAse1(scheduledProposerHex) : null;
  const consensusHeight = consensus?.height ? parseInt(consensus.height, 10) : null;
  const consensusRound = consensus?.round ? parseInt(consensus.round, 10) : null;

  return (
    <Layout title="Validators">
      <section className="dash-border-t px-[4%] py-10">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-plus text-[28px] md:text-[36px] font-bold text-white mb-2">Validators</h1>
          <p className="font-dm-mono text-[12px] text-[#7D7D7D]">
            Live Phase B heartbeat over the last {HEARTBEAT_LOOKBACK} blocks
            {heartbeatFrom != null && heartbeatHead != null
              ? <> (#{heartbeatFrom.toLocaleString()} → #{heartbeatHead.toLocaleString()})</>
              : null}.
            Status reflects who is actually signing — not just who is bonded.
          </p>
        </div>
      </section>

      {/* Stats band */}
      <section className="dash-border-t">
        <div className="grid grid-cols-1 md:grid-cols-3">
          <Stat
            label="Signing"
            value={signingCount != null ? signingCount : '—'}
            sub={`active heartbeat in last ${HEARTBEAT_LOOKBACK} blocks`}
            color="#4ADE80"
            right
          />
          <Stat
            label="Idle"
            value={idleCount != null ? idleCount : '—'}
            sub="bonded · briefly silent"
            color="#F29751"
            right
          />
          <Stat
            label="Dormant"
            value={dormantCount != null ? dormantCount : '—'}
            sub="bonded · no signatures in window"
            color="#7D7D7D"
          />
          <Stat
            label="Total bonded"
            value={total != null ? total : '—'}
            sub={`${Number(totalBondedAse).toLocaleString()} ASE in staking contract`}
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

      {/* Currently scheduled */}
      {scheduledProposer && (
        <section className="dash-border-t px-[4%] py-6">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#5A5A5A] mb-1">Currently proposing</p>
              <Link
                href={`/address/${scheduledProposer}`}
                className="font-dm-mono text-[14px] text-[#A6A6FF] hover:text-white"
              >
                {scheduledProposer}
              </Link>
            </div>
            <div className="font-dm-mono text-[11px] text-[#7D7D7D] tabular-nums">
              h={consensusHeight ?? '—'} · r={consensusRound ?? '—'} · phase={consensus?.phase || '—'}
            </div>
          </div>
        </section>
      )}

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
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]" title="Share of the last 200 blocks this validator signed">Participation</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]" title="Last block the validator's signature appeared in">Last seen</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Bonded at</th>
                </tr>
              </thead>
              <tbody>
                {validators.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-6 font-dm-mono text-[12px] text-[#5A5A5A] text-center">Loading…</td></tr>
                )}
                {validators
                  .slice()
                  .sort((a, b) => {
                    const sa = partByAddr[a.address?.toLowerCase()]?.status || 'pending';
                    const sb = partByAddr[b.address?.toLowerCase()]?.status || 'pending';
                    const ra = STATUS_RANK[sa] ?? 99;
                    const rb = STATUS_RANK[sb] ?? 99;
                    if (ra !== rb) return ra - rb;
                    try { return BigInt(b.stake || '0') > BigInt(a.stake || '0') ? 1 : -1; } catch { return 0; }
                  })
                  .map((v, i) => {
                    const addr = (v.address || '').toLowerCase();
                    const stake = v.stake || '0';
                    const p = partByAddr[addr];
                    const status = p?.status || 'pending';
                    const style = STATUS_STYLE[status] || STATUS_STYLE.dormant;
                    const ratio = typeof p?.participationRatio === 'number' ? p.participationRatio : null;
                    const lastSigned = p?.lastSignedBlock ? parseInt(p.lastSignedBlock, 10) : null;
                    const blocksSince = (lastSigned != null && heartbeatHead != null) ? heartbeatHead - lastSigned : null;
                    const isScheduled = scheduledProposer && addr === scheduledProposer;
                    return (
                      <tr
                        key={addr || i}
                        className="border-b border-[#1A1A1A] hover:bg-[#0F0F0F]"
                        style={isScheduled ? { backgroundColor: '#080A14' } : null}
                      >
                        <td className="px-4 py-3 font-dm-mono text-[#5A5A5A] tabular-nums">
                          {i + 1}
                          {isScheduled && <span className="ml-2 text-[#A6A6FF]" title="Currently scheduled proposer">●</span>}
                        </td>
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
                            style={{ color: style.color, backgroundColor: style.bg, border: `1px solid ${style.border}` }}
                          >
                            {p ? style.label : (v.status || 'PENDING').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-dm-mono tabular-nums" style={{ color: ratio == null ? '#5A5A5A' : ratio >= 0.9 ? '#4ADE80' : ratio >= 0.5 ? '#F29751' : '#7D7D7D' }}>
                          {ratio == null ? '—' : `${(ratio * 100).toFixed(0)}%`}
                          {p?.signedBlocks != null && (
                            <span className="text-[#5A5A5A] ml-1">({p.signedBlocks}/{HEARTBEAT_LOOKBACK})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-dm-mono text-[#CACACA] tabular-nums">
                          {lastSigned != null ? (
                            <>
                              #{lastSigned.toLocaleString()}
                              {blocksSince != null && blocksSince > 0 && (
                                <span className="text-[#5A5A5A] ml-1">(−{blocksSince})</span>
                              )}
                            </>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-dm-mono text-[#7D7D7D] tabular-nums">
                          {v.bondedAt ? `#${parseInt(v.bondedAt, 10).toLocaleString()}` : '—'}
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
