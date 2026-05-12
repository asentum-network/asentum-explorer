// asentum-explorer · Block detail page. Accepts a decimal block number,
// a hex block number, or a 64-char block hash in the route segment.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { getBlockByNumber, getBlockByHash } from '@/lib/rpc';
import { hexToNumber, hexToBigInt, formatAse, shortHash, relativeTime, absTime } from '@/lib/format';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

function Field({ label, children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-1 md:gap-4 py-3 border-b border-[#1A1A1A] last:border-b-0">
      <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#7D7D7D] md:pt-1">{label}</p>
      <div className="font-dm-mono text-[12px] text-white break-all">{children}</div>
    </div>
  );
}

export default function BlockDetail() {
  const router = useRouter();
  const { number } = router.query;
  const [block, setBlock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!number) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const raw = String(number);
        let b;
        if (/^0x[0-9a-fA-F]{64}$/.test(raw)) {
          b = await getBlockByHash(raw, true);
        } else if (/^\d+$/.test(raw)) {
          b = await getBlockByNumber(parseInt(raw, 10), true);
        } else if (/^0x[0-9a-fA-F]+$/.test(raw)) {
          b = await getBlockByNumber(raw, true);
        } else {
          throw new Error('Invalid block identifier');
        }
        if (!cancelled) setBlock(b);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [number]);

  const n = block ? hexToNumber(block.number) : null;
  const txs = block?.transactions || [];

  return (
    <Layout title={block ? `Block #${n}` : 'Block'}>
      <section className="dash-border-t px-[4%] py-12">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
            <div>
              <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#7D7D7D] mb-1">Block</p>
              <h1 className="font-plus text-[28px] md:text-[36px] font-bold text-white">
                {block ? `#${n.toLocaleString()}` : (loading ? 'Loading…' : '—')}
              </h1>
            </div>
            {block && n != null && (
              <div className="flex gap-2">
                <Link
                  href={`/block/${n - 1}`}
                  className={`px-3 py-2 border border-[#1F1F1F] hover:border-[#2A2A2A] flex items-center gap-1 font-dm-mono text-[11px] text-[#A1A1A6] ${n === 0 ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  <ChevronLeft className="w-3 h-3" /> Prev
                </Link>
                <Link
                  href={`/block/${n + 1}`}
                  className="px-3 py-2 border border-[#1F1F1F] hover:border-[#2A2A2A] flex items-center gap-1 font-dm-mono text-[11px] text-[#A1A1A6]"
                >
                  Next <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            )}
          </div>

          {error && <p className="font-dm-mono text-[12px] text-[#F87171] mb-4">{error}</p>}

          {block && (
            <>
              <div className="border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-2 mb-6">
                <Field label="Hash">
                  <span className="text-white">{block.hash}</span>
                </Field>
                <Field label="Parent hash">
                  {block.parentHash && (
                    <Link href={`/block/${block.parentHash}`} className="text-[#A6A6FF] hover:text-white underline break-all">
                      {block.parentHash}
                    </Link>
                  )}
                </Field>
                <Field label="Timestamp">
                  <span className="text-white">{absTime(block.timestamp)}</span>
                  <span className="text-[#7D7D7D] ml-2">({relativeTime(block.timestamp)})</span>
                </Field>
                <Field label="Proposer">
                  {block.miner ? (
                    <Link href={`/address/${block.miner.toLowerCase()}`} className="text-[#A6A6FF] hover:text-white underline">
                      {block.miner}
                    </Link>
                  ) : <span className="text-[#5A5A5A]">—</span>}
                </Field>
                <Field label="Transactions">
                  <span className="text-[#26CC6B] font-bold">{txs.length}</span>
                </Field>
                <Field label="Gas used">
                  {block.gasUsed ? hexToNumber(block.gasUsed).toLocaleString() : '0'}
                  {block.gasLimit ? <span className="text-[#5A5A5A]"> / {hexToNumber(block.gasLimit).toLocaleString()}</span> : null}
                </Field>
                <Field label="Size">
                  {block.size ? `${hexToNumber(block.size).toLocaleString()} bytes` : '—'}
                </Field>
                <Field label="State root">
                  <span className="text-white">{block.stateRoot}</span>
                </Field>
                {block.extraData && block.extraData !== '0x' && (
                  <Field label="Extra data"><span className="text-[#A1A1A6]">{block.extraData}</span></Field>
                )}
              </div>

              <div className="border border-[#1F1F1F] bg-[#0A0A0A]">
                <div className="px-4 py-3 border-b border-[#1F1F1F]">
                  <h2 className="font-plus font-bold text-white text-[14px]">Transactions ({txs.length})</h2>
                </div>
                {txs.length === 0 ? (
                  <p className="font-dm-mono text-[12px] text-[#5A5A5A] p-4">No transactions in this block.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-[#0F0F0F] border-b border-[#1F1F1F]">
                        <tr>
                          <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Hash</th>
                          <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">From</th>
                          <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">To</th>
                          <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txs.map((tx) => (
                          <tr key={tx.hash} className="border-b border-[#1A1A1A] hover:bg-[#0F0F0F]">
                            <td className="px-4 py-2">
                              <Link href={`/tx/${tx.hash}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                                {shortHash(tx.hash, 8, 6)}
                              </Link>
                            </td>
                            <td className="px-4 py-2">
                              {tx.from ? (
                                <Link href={`/address/${tx.from.toLowerCase()}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                                  {shortHash(tx.from, 6, 4)}
                                </Link>
                              ) : <span className="text-[#5A5A5A]">—</span>}
                            </td>
                            <td className="px-4 py-2">
                              {tx.to ? (
                                <Link href={`/address/${tx.to.toLowerCase()}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                                  {shortHash(tx.to, 6, 4)}
                                </Link>
                              ) : <span className="font-dm-mono text-[#F29751]">Contract creation</span>}
                            </td>
                            <td className="px-4 py-2 text-right font-dm-mono text-[#26CC6B] tabular-nums">
                              {formatAse(tx.value)} ASE
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
