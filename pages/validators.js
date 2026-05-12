// asentum-explorer · Validators page. Reads the node's /validators
// endpoint and renders the active set with bonded stake and recent
// proposal counts.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import { getValidators } from '@/lib/rpc';
import { shortHash, formatAse } from '@/lib/format';

export default function ValidatorsPage() {
  const [validators, setValidators] = useState(null);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const fetchOnce = async () => {
      try {
        const data = await getValidators();
        if (cancelled) return;
        const list = Array.isArray(data?.validators) ? data.validators : Array.isArray(data) ? data : [];
        setValidators(list);
        setMeta({
          totalBondedStake: data?.totalBondedStake,
          activeCount: data?.activeCount,
          recentProposerCount: data?.recentProposerCount,
        });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchOnce();
    timer = setInterval(fetchOnce, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <Layout title="Validators">
      <section className="dash-border-t px-[4%] py-12">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-plus text-[28px] md:text-[36px] font-bold text-white mb-2">Validators</h1>
          <p className="font-dm-mono text-[12px] text-[#7D7D7D] mb-6">
            The active set is rebuilt every block from on-chain bonded stake.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatCard label="Validators" value={validators ? validators.length : '—'} color="#4ADE80" />
            <StatCard label="Active" value={meta.activeCount ?? '—'} sub="proposed recently" />
            <StatCard
              label="Total bonded"
              value={meta.totalBondedStake ? `${formatAse(meta.totalBondedStake)} ASE` : '—'}
            />
            <StatCard label="Recent proposers" value={meta.recentProposerCount ?? '—'} sub="last 30 blocks" />
          </div>

          {error && <p className="font-dm-mono text-[12px] text-[#F87171] mb-4">{error}</p>}

          <div className="border border-[#1F1F1F] bg-[#0A0A0A] overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#0F0F0F] border-b border-[#1F1F1F]">
                <tr>
                  <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Address</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Bonded</th>
                  <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Status</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Blocks proposed</th>
                </tr>
              </thead>
              <tbody>
                {loading && !validators && (
                  <tr><td colSpan={4} className="px-4 py-6 font-dm-mono text-[12px] text-[#5A5A5A] text-center">Loading…</td></tr>
                )}
                {validators && validators.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 font-dm-mono text-[12px] text-[#5A5A5A] text-center">No validators reported.</td></tr>
                )}
                {validators && validators.map((v) => {
                  const addr = v.address || v.validatorAddress || v.account || v.id;
                  const stake = v.bondedStake || v.bonded || v.stake || v.amount;
                  const isActive = v.active !== false && (v.recentProposals === undefined || v.recentProposals > 0);
                  return (
                    <tr key={addr} className="border-b border-[#1A1A1A] hover:bg-[#0F0F0F]">
                      <td className="px-4 py-3">
                        {addr ? (
                          <Link href={`/address/${addr.toLowerCase()}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                            {addr}
                          </Link>
                        ) : <span className="text-[#5A5A5A]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-dm-mono text-white tabular-nums">
                        {stake ? `${formatAse(stake)} ASE` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-block font-dm-mono text-[10px] tracking-[0.1em] uppercase px-2 py-1"
                          style={{
                            color: isActive ? '#4ADE80' : '#7D7D7D',
                            backgroundColor: isActive ? '#0A1408' : '#1A1A1A',
                            border: `1px solid ${isActive ? '#1A3A1A' : '#2A2A2A'}`,
                          }}
                        >
                          {isActive ? 'Active' : 'Idle'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-dm-mono text-[#A1A1A6] tabular-nums">
                        {v.recentProposals ?? v.proposedCount ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </Layout>
  );
}
