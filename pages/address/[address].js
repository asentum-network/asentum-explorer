// asentum-explorer · Address detail page. Live balance / nonce / code
// pulled from RPC, paginated tx history pulled from the local indexer.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import StatCard from '@/components/StatCard';
import { getBalance, getCode, getTxCount } from '@/lib/rpc';
import { formatAse, shortHash, relativeTime } from '@/lib/format';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

const PAGE_SIZE = 25;

function Field({ label, children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-1 md:gap-4 py-3 border-b border-[#1A1A1A] last:border-b-0">
      <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#7D7D7D] md:pt-1">{label}</p>
      <div className="font-dm-mono text-[12px] text-white break-all">{children}</div>
    </div>
  );
}

export default function AddressDetail() {
  const router = useRouter();
  const { address } = router.query;
  const [balance, setBalance] = useState(null);
  const [code, setCode] = useState(null);
  const [nonce, setNonce] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Indexer-sourced tx history.
  const [stats, setStats] = useState(null);
  const [txs, setTxs] = useState(null);
  const [txsTotal, setTxsTotal] = useState(0);
  const [txsPage, setTxsPage] = useState(1);
  const [txsLoading, setTxsLoading] = useState(false);
  const [txsError, setTxsError] = useState(null);

  useEffect(() => {
    if (!address || typeof address !== 'string') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [b, c, n] = await Promise.all([
          getBalance(address),
          getCode(address).catch(() => '0x'),
          getTxCount(address).catch(() => 0),
        ]);
        if (cancelled) return;
        setBalance(b);
        setCode(c);
        setNonce(n);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  // Load indexer-aggregated counts once per address.
  useEffect(() => {
    if (!address || typeof address !== 'string') return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/indexer/address/${address.toLowerCase()}/stats`);
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled) setStats(data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [address]);

  // Reload the tx table whenever the page index changes.
  useEffect(() => {
    if (!address || typeof address !== 'string') return;
    let cancelled = false;
    setTxsLoading(true);
    setTxsError(null);
    (async () => {
      try {
        const r = await fetch(`/api/indexer/address/${address.toLowerCase()}/txs?page=${txsPage}&size=${PAGE_SIZE}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'indexer error');
        if (cancelled) return;
        setTxs(data.rows || []);
        setTxsTotal(data.total || 0);
      } catch (err) {
        if (!cancelled) {
          setTxs(null);
          setTxsError(err.message);
        }
      } finally {
        if (!cancelled) setTxsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address, txsPage]);

  const isContract = !!code && code !== '0x' && code !== '0x0';
  const addrStr = typeof address === 'string' ? address : '';
  const lowerAddr = addrStr.toLowerCase();
  const totalPages = Math.max(1, Math.ceil(txsTotal / PAGE_SIZE));

  const copyAddress = () => {
    if (typeof navigator === 'undefined' || !addrStr) return;
    navigator.clipboard.writeText(addrStr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Layout title={addrStr ? `Address ${shortHash(addrStr, 6, 4)}` : 'Address'}>
      <section className="dash-border-t px-[4%] py-12">
        <div className="max-w-5xl mx-auto">
          <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#7D7D7D] mb-1">
            {isContract ? 'Contract' : 'Address'}
          </p>
          <div className="flex items-center flex-wrap gap-3 mb-6">
            <h1 className="font-plus text-[18px] md:text-[22px] font-bold text-white break-all">{addrStr}</h1>
            <button
              onClick={copyAddress}
              className="font-dm-mono text-[10px] tracking-[0.1em] uppercase px-2 py-1"
              style={{
                color: copied ? '#4ADE80' : '#BABABA',
                backgroundColor: copied ? '#0A1408' : '#1A1A1A',
                border: `1px solid ${copied ? '#1A3A1A' : '#2A2A2A'}`,
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          {loading && <p className="font-dm-mono text-[12px] text-[#5A5A5A]">Loading…</p>}
          {error && <p className="font-dm-mono text-[12px] text-[#F87171] mb-4">{error}</p>}

          {!loading && !error && balance != null && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard label="Balance" value={`${formatAse(balance.toString())} ASE`} color="#4ADE80" />
                <StatCard label="Nonce" value={nonce ?? 0} sub="outgoing tx count" />
                <StatCard label="Type" value={isContract ? 'Contract' : 'EOA'} color={isContract ? '#A6A6FF' : '#FFFFFF'} />
                <StatCard
                  label="Indexed txs"
                  value={stats ? (stats.sent + stats.received + stats.contractsCreated) : '—'}
                  sub={stats ? `${stats.sent} sent · ${stats.received} received` : null}
                />
              </div>

              <div className="border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-2 mb-6">
                <Field label="Address"><span className="text-white">{addrStr}</span></Field>
                <Field label="Balance (wei)">{balance.toString()}</Field>
                {isContract && (
                  <Field label="Code size">{Math.floor((code.length - 2) / 2).toLocaleString()} bytes</Field>
                )}
              </div>

              {/* Tx history (indexer) */}
              <div className="border border-[#1F1F1F] bg-[#0A0A0A]">
                <div className="px-4 py-3 border-b border-[#1F1F1F] flex items-center justify-between flex-wrap gap-3">
                  <h2 className="font-plus font-bold text-white text-[14px]">
                    Transactions {txsTotal > 0 && <span className="text-[#7D7D7D] font-normal text-[12px] ml-1">({txsTotal.toLocaleString()})</span>}
                  </h2>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTxsPage((p) => Math.max(1, p - 1))}
                        disabled={txsPage <= 1 || txsLoading}
                        className="px-2 py-1 border border-[#1F1F1F] hover:border-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed font-dm-mono text-[10px] text-[#A1A1A6] flex items-center gap-1"
                      >
                        <ChevronLeft className="w-3 h-3" /> Prev
                      </button>
                      <span className="font-dm-mono text-[10px] text-[#7D7D7D]">
                        Page {txsPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setTxsPage((p) => Math.min(totalPages, p + 1))}
                        disabled={txsPage >= totalPages || txsLoading}
                        className="px-2 py-1 border border-[#1F1F1F] hover:border-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed font-dm-mono text-[10px] text-[#A1A1A6] flex items-center gap-1"
                      >
                        Next <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {txsError && (
                  <div className="p-4 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-[#F29751] mt-0.5" />
                    <div className="font-dm-mono text-[11px] text-[#F29751]">
                      Indexer unreachable. Tx history is unavailable until the indexer is running.
                      <div className="text-[#7D7D7D] mt-1">{txsError}</div>
                    </div>
                  </div>
                )}

                {!txsError && txsLoading && txs == null && (
                  <p className="font-dm-mono text-[12px] text-[#5A5A5A] p-4">Loading…</p>
                )}

                {!txsError && txs && txs.length === 0 && (
                  <p className="font-dm-mono text-[12px] text-[#5A5A5A] p-4">No transactions found for this address.</p>
                )}

                {!txsError && txs && txs.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead className="bg-[#0F0F0F] border-b border-[#1F1F1F]">
                        <tr>
                          <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Hash</th>
                          <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Block</th>
                          <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Age</th>
                          <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Role</th>
                          <th className="text-left px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Counterparty</th>
                          <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Value</th>
                          <th className="text-right px-4 py-3 font-dm-mono text-[10px] uppercase tracking-[0.1em] text-[#7D7D7D]">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txs.map((tx) => {
                          const isFrom = tx.role === 'from';
                          const counterparty = isFrom ? tx.to_addr : tx.from_addr;
                          return (
                            <tr key={tx.hash + tx.role} className="border-b border-[#1A1A1A] hover:bg-[#0F0F0F]">
                              <td className="px-4 py-2">
                                <Link href={`/tx/${tx.hash}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                                  {shortHash(tx.hash, 8, 6)}
                                </Link>
                              </td>
                              <td className="px-4 py-2">
                                <Link href={`/block/${tx.block_number}`} className="font-dm-mono text-[#A6A6FF] hover:text-white tabular-nums">
                                  #{tx.block_number.toLocaleString()}
                                </Link>
                              </td>
                              <td className="px-4 py-2 font-dm-mono text-[#A1A1A6]">{relativeTime(tx.timestamp)}</td>
                              <td className="px-4 py-2">
                                <span
                                  className="inline-block font-dm-mono text-[9px] tracking-[0.1em] uppercase px-1.5 py-0.5"
                                  style={
                                    tx.role === 'from'
                                      ? { color: '#F29751', backgroundColor: '#231409', border: '1px solid #4A2911' }
                                      : tx.role === 'created'
                                      ? { color: '#A6A6FF', backgroundColor: '#150D20', border: '1px solid #2A1845' }
                                      : { color: '#4ADE80', backgroundColor: '#0A1408', border: '1px solid #1A3A1A' }
                                  }
                                >
                                  {tx.role === 'from' ? 'Sent' : tx.role === 'created' ? 'Deploy' : 'Received'}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                {counterparty ? (
                                  <Link href={`/address/${counterparty}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                                    {shortHash(counterparty, 6, 4)}
                                  </Link>
                                ) : tx.contract_created ? (
                                  <Link href={`/address/${tx.contract_created}`} className="font-dm-mono text-[#A6A6FF] hover:text-white">
                                    {shortHash(tx.contract_created, 6, 4)} <span className="text-[#5A5A5A]">(new)</span>
                                  </Link>
                                ) : (
                                  <span className="text-[#5A5A5A]">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right font-dm-mono text-[#26CC6B] tabular-nums">
                                {formatAse(tx.value)} ASE
                              </td>
                              <td className="px-4 py-2 text-right">
                                {tx.status === 1 ? (
                                  <span className="font-dm-mono text-[#4ADE80] text-[10px]">OK</span>
                                ) : tx.status === 0 ? (
                                  <span className="font-dm-mono text-[#F87171] text-[10px]">REVERT</span>
                                ) : (
                                  <span className="font-dm-mono text-[#7D7D7D] text-[10px]">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
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
