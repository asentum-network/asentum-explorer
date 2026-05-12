// asentum-explorer · Transaction detail page. Fetches the tx body, its
// receipt, and the parent block in parallel; renders status, value, gas,
// input data, and any emitted logs.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { getTx, getReceipt, getBlockByNumber } from '@/lib/rpc';
import { hexToNumber, hexToBigInt, formatAse, formatGwei, shortHash, relativeTime, absTime } from '@/lib/format';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';

function Field({ label, children }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-1 md:gap-4 py-3 border-b border-[#1A1A1A] last:border-b-0">
      <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#7D7D7D] md:pt-1">{label}</p>
      <div className="font-dm-mono text-[12px] text-white break-all">{children}</div>
    </div>
  );
}

export default function TxDetail() {
  const router = useRouter();
  const { hash } = router.query;
  const [tx, setTx] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [block, setBlock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [t, r] = await Promise.all([getTx(hash), getReceipt(hash).catch(() => null)]);
        if (cancelled) return;
        if (!t) throw new Error('Transaction not found.');
        setTx(t);
        setReceipt(r);
        if (t.blockNumber) {
          const b = await getBlockByNumber(t.blockNumber, false).catch(() => null);
          if (!cancelled) setBlock(b);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hash]);

  const status = receipt ? hexToNumber(receipt.status) : null;
  const isSuccess = status === 1;
  const isPending = !tx?.blockNumber;

  return (
    <Layout title={tx ? `Tx ${shortHash(tx.hash, 6, 4)}` : 'Transaction'}>
      <section className="dash-border-t px-[4%] py-12">
        <div className="max-w-5xl mx-auto">
          <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#7D7D7D] mb-1">Transaction</p>
          <h1 className="font-plus text-[20px] md:text-[24px] font-bold text-white break-all mb-6">
            {tx?.hash || hash || '—'}
          </h1>

          {loading && <p className="font-dm-mono text-[12px] text-[#5A5A5A]">Loading…</p>}
          {error && <p className="font-dm-mono text-[12px] text-[#F87171] mb-4">{error}</p>}

          {tx && (
            <div className="border border-[#1F1F1F] bg-[#0A0A0A] px-4 py-2">
              <Field label="Status">
                {isPending ? (
                  <span className="inline-flex items-center gap-1.5 text-[#F29751]"><Clock className="w-3.5 h-3.5" /> Pending</span>
                ) : isSuccess ? (
                  <span className="inline-flex items-center gap-1.5 text-[#26CC6B]"><CheckCircle2 className="w-3.5 h-3.5" /> Success</span>
                ) : status === 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[#F87171]"><XCircle className="w-3.5 h-3.5" /> Reverted</span>
                ) : (
                  <span className="text-[#7D7D7D]">Unknown</span>
                )}
              </Field>
              <Field label="Block">
                {tx.blockNumber ? (
                  <Link href={`/block/${hexToNumber(tx.blockNumber)}`} className="text-[#A6A6FF] hover:text-white underline tabular-nums">
                    #{hexToNumber(tx.blockNumber).toLocaleString()}
                  </Link>
                ) : <span className="text-[#F29751]">Pending</span>}
                {block?.timestamp && (
                  <span className="text-[#7D7D7D] ml-3">{absTime(block.timestamp)} ({relativeTime(block.timestamp)})</span>
                )}
              </Field>
              <Field label="From">
                <Link href={`/address/${tx.from.toLowerCase()}`} className="text-[#A6A6FF] hover:text-white underline">{tx.from}</Link>
              </Field>
              <Field label="To">
                {tx.to ? (
                  <Link href={`/address/${tx.to.toLowerCase()}`} className="text-[#A6A6FF] hover:text-white underline">{tx.to}</Link>
                ) : receipt?.contractAddress ? (
                  <>
                    <span className="text-[#F29751]">Contract creation: </span>
                    <Link href={`/address/${receipt.contractAddress.toLowerCase()}`} className="text-[#A6A6FF] hover:text-white underline">
                      {receipt.contractAddress}
                    </Link>
                  </>
                ) : <span className="text-[#F29751]">Contract creation</span>}
              </Field>
              <Field label="Value"><span className="text-[#26CC6B] font-bold">{formatAse(tx.value)} ASE</span></Field>
              <Field label="Gas price">{tx.gasPrice ? `${formatGwei(tx.gasPrice)} Gwei` : '—'}</Field>
              <Field label="Gas limit">{tx.gas ? hexToNumber(tx.gas).toLocaleString() : '—'}</Field>
              {receipt && (
                <Field label="Gas used">
                  {receipt.gasUsed ? hexToNumber(receipt.gasUsed).toLocaleString() : '—'}
                </Field>
              )}
              <Field label="Nonce">{tx.nonce != null ? hexToNumber(tx.nonce) : '—'}</Field>
              {tx.input && tx.input !== '0x' && (
                <Field label="Input data">
                  <pre className="bg-[#050505] border border-[#1F1F1F] p-3 text-[10px] text-[#A1A1A6] overflow-x-auto whitespace-pre-wrap break-all">{tx.input}</pre>
                </Field>
              )}
            </div>
          )}

          {receipt?.logs?.length > 0 && (
            <div className="border border-[#1F1F1F] bg-[#0A0A0A] mt-6">
              <div className="px-4 py-3 border-b border-[#1F1F1F]">
                <h2 className="font-plus font-bold text-white text-[14px]">Logs ({receipt.logs.length})</h2>
              </div>
              <div className="divide-y divide-[#1A1A1A]">
                {receipt.logs.map((log, i) => (
                  <div key={i} className="p-4">
                    <div className="font-dm-mono text-[11px] text-[#7D7D7D] mb-2">
                      <span className="text-[#5A5A5A]">#{i} · address: </span>
                      <Link href={`/address/${log.address.toLowerCase()}`} className="text-[#A6A6FF] hover:text-white underline">{log.address}</Link>
                    </div>
                    {log.topics?.map((t, j) => (
                      <div key={j} className="font-dm-mono text-[10px] text-[#A1A1A6] mb-1 break-all">
                        <span className="text-[#5A5A5A]">topic[{j}]: </span>{t}
                      </div>
                    ))}
                    {log.data && log.data !== '0x' && (
                      <div className="font-dm-mono text-[10px] text-[#A1A1A6] mt-2 break-all">
                        <span className="text-[#5A5A5A]">data: </span>{log.data}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
