// asentum-explorer · Paginated block list. Default head-anchored; pass
// ?start=<n> to anchor anywhere in chain history.
//
// milkie · 2026

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { getBlockNumber, getBlockByNumber } from '@/lib/rpc';
import { hexToNumber, shortHash, relativeTime } from '@/lib/format';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 25;

export default function Blocks() {
  const router = useRouter();
  const startQuery = router.query.start ? parseInt(router.query.start, 10) : null;

  const [head, setHead] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const startFrom = startQuery != null ? startQuery : head;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await getBlockNumber();
      setHead(h);
      const top = startQuery != null ? Math.min(startQuery, h) : h;
      const numbers = [];
      for (let i = 0; i < PAGE_SIZE && top - i >= 0; i++) numbers.push(top - i);
      const fetched = await Promise.all(numbers.map((n) => getBlockByNumber(n, false).catch(() => null)));
      setBlocks(fetched.filter(Boolean));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startQuery]);

  useEffect(() => { load(); }, [load]);

  const goOlder = () => {
    if (startFrom == null) return;
    const next = Math.max(0, startFrom - PAGE_SIZE);
    router.push(`/blocks?start=${next}`);
  };
  const goNewer = () => {
    if (head == null || startFrom == null) return;
    const next = Math.min(head, startFrom + PAGE_SIZE);
    router.push(next === head ? '/blocks' : `/blocks?start=${next}`);
  };

  return (
    <Layout title="Blocks">
      <section className="dash-border-t px-[4%] py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="font-plus text-[28px] md:text-[36px] font-bold text-white">Blocks</h1>
              {head != null && (
                <p className="font-dm-mono text-[12px] text-[#7D7D7D] mt-1">
                  Head: <span className="text-white">#{head.toLocaleString()}</span>
                  {startFrom != null && startFrom !== head && (
                    <span> · Showing from #{startFrom.toLocaleString()}</span>
                  )}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={goNewer}
                disabled={head == null || startFrom == null || startFrom >= head}
                className="px-3 py-2 border border-[#1F1F1F] hover:border-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-dm-mono text-[11px] text-[#A1A1A6]"
              >
                <ChevronLeft className="w-3 h-3" /> Newer
              </button>
              <button
                onClick={goOlder}
                disabled={startFrom == null || startFrom <= 0}
                className="px-3 py-2 border border-[#1F1F1F] hover:border-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-dm-mono text-[11px] text-[#A1A1A6]"
              >
                Older <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {error && <p className="font-dm-mono text-[12px] text-[#F87171] mb-4">{error}</p>}

          <div className="border border-[#1F1F1F] bg-[#0A0A0A] overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#0F0F0F] border-b border-[#1F1F1F]">
                <tr>
                  <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Block</th>
                  <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Time</th>
                  <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Proposer</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Txs</th>
                  <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Gas used</th>
                </tr>
              </thead>
              <tbody>
                {loading && blocks.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 font-dm-mono text-[12px] text-[#5A5A5A] text-center">Loading…</td></tr>
                )}
                {blocks.map((b) => {
                  const n = hexToNumber(b.number);
                  const txCount = (b.transactions || []).length;
                  return (
                    <tr key={b.hash} className="border-b border-[#1A1A1A] hover:bg-[#0F0F0F]">
                      <td className="px-4 py-3">
                        <Link href={`/block/${n}`} className="font-dm-mono text-white hover:text-[#A6A6FF] tabular-nums">
                          #{n.toLocaleString()}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-dm-mono text-[#A1A1A6]">{relativeTime(b.timestamp)}</td>
                      <td className="px-4 py-3">
                        {b.miner ? (
                          <Link href={`/address/${b.miner.toLowerCase()}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                            {shortHash(b.miner, 6, 4)}
                          </Link>
                        ) : <span className="text-[#5A5A5A]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-dm-mono tabular-nums" style={{ color: txCount > 0 ? '#26CC6B' : '#5A5A5A' }}>
                        {txCount}
                      </td>
                      <td className="px-4 py-3 text-right font-dm-mono text-[#A1A1A6] tabular-nums">
                        {b.gasUsed ? hexToNumber(b.gasUsed).toLocaleString() : '—'}
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
