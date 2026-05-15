// asentum-explorer · Public faucet UI.
//
// Calls /api/dev/faucet, then polls eth_getTransactionByHash until the
// tx lands (or 90s timeout). Testnet mempool can sit busy for 30s+ so
// the waiting state is the most important part of the UX.
//
// milkie · 2026

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { rpc } from '@/lib/rpc';
import { isAddress, formatAse, shortHash } from '@/lib/format';

const DRIP_AMOUNT_ASE = 100;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

export default function Faucet() {
  const [address, setAddress] = useState('');
  const [state, setState] = useState('idle'); // idle | submitting | pending | confirmed | error
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef(null);
  const elapsedRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, []);

  const reset = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    setState('idle');
    setTxHash(null);
    setError(null);
    setElapsed(0);
  };

  const startElapsed = () => {
    const start = Date.now();
    setElapsed(0);
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
  };

  const drip = async () => {
    setError(null);
    const trimmed = address.trim();
    if (!isAddress(trimmed)) {
      setError('Enter a valid 0x… address (40 hex characters).');
      return;
    }
    setState('submitting');
    let data;
    try {
      const res = await fetch('/api/dev/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: trimmed }),
      });
      data = await res.json();
      if (!res.ok || !data?.accepted) {
        setState('error');
        setError(data?.reason || `Request failed (${res.status})`);
        return;
      }
    } catch (err) {
      setState('error');
      setError(err.message || String(err));
      return;
    }

    setTxHash(data.txHash);
    setState('pending');
    startElapsed();

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    pollRef.current = setInterval(async () => {
      try {
        const tx = await rpc('eth_getTransactionByHash', [data.txHash]);
        if (tx && tx.blockNumber) {
          clearInterval(pollRef.current); pollRef.current = null;
          if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
          setState('confirmed');
          return;
        }
      } catch { /* transient */ }
      if (Date.now() > deadline) {
        clearInterval(pollRef.current); pollRef.current = null;
        if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
        setState('error');
        setError("Submitted but didn't confirm in 90 seconds. It may still land — check the tx page.");
      }
    }, POLL_INTERVAL_MS);
  };

  return (
    <Layout>
      <div className="px-[6%] py-12 max-w-3xl mx-auto">
        <div className="dash-border-b pb-8 mb-10">
          <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#5A5A5A] mb-3">
            Testnet faucet
          </p>
          <h1 className="font-plus text-[36px] md:text-[44px] font-bold text-white leading-tight">
            Drip 100 ASE
          </h1>
          <p className="font-dm-mono text-[13px] text-[#7D7D7D] mt-4 leading-relaxed max-w-xl">
            Get testnet ASE for the address below. One drip per address every 5 minutes.
            Testnet mempool can run busy — drips usually land in 5–30 seconds.
          </p>
        </div>

        <div className="border border-[#1F1F1F] rounded-sm p-6 md:p-8 bg-[#0A0A0A]">
          <label
            htmlFor="addr"
            className="block font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#7D7D7D] mb-2"
          >
            Recipient address
          </label>
          <input
            id="addr"
            type="text"
            value={address}
            onChange={(e) => { setAddress(e.target.value); if (state === 'error') setError(null); }}
            placeholder="0x…"
            disabled={state === 'submitting' || state === 'pending'}
            className="w-full bg-black border border-[#2A2A2A] rounded-sm px-4 py-3 font-dm-mono text-[14px] text-white placeholder:text-[#3A3A3A] focus:outline-none focus:border-[#4A4A4A] tabular-nums"
          />

          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              type="button"
              onClick={state === 'confirmed' || state === 'error' ? reset : drip}
              disabled={state === 'submitting' || state === 'pending'}
              className="font-dm-mono text-[12px] tracking-[0.15em] uppercase font-medium bg-white text-black px-6 py-3 rounded-sm hover:bg-[#E5E5E5] transition-colors disabled:bg-[#2A2A2A] disabled:text-[#5A5A5A] disabled:cursor-not-allowed"
            >
              {state === 'submitting' && 'Submitting…'}
              {state === 'pending' && `Waiting… ${elapsed}s`}
              {state === 'confirmed' && 'Drip again'}
              {state === 'error' && 'Try again'}
              {state === 'idle' && `Drip ${DRIP_AMOUNT_ASE} ASE`}
            </button>

            {txHash && (
              <Link
                href={`/tx/${txHash}`}
                className="font-dm-mono text-[12px] text-[#A1A1A6] hover:text-white underline underline-offset-4"
              >
                tx: {shortHash(txHash)}
              </Link>
            )}
          </div>

          {state === 'pending' && (
            <p className="font-dm-mono text-[12px] text-[#7D7D7D] mt-6 leading-relaxed">
              Submitted to the chain — waiting for it to land in a block. This usually
              takes 5–30 seconds. You can leave this page and check the address later.
            </p>
          )}

          {state === 'confirmed' && (
            <div className="border-l-2 border-[#26CC6B] pl-4 mt-6">
              <p className="font-dm-mono text-[11px] uppercase tracking-[0.15em] text-[#26CC6B] mb-1">
                Confirmed
              </p>
              <p className="font-dm-mono text-[13px] text-white">
                Sent {formatAse(BigInt(DRIP_AMOUNT_ASE) * 10n ** 18n)} ASE to {shortHash(address.trim(), 6, 4)}
              </p>
            </div>
          )}

          {state === 'error' && error && (
            <div className="border-l-2 border-[#E0345A] pl-4 mt-6">
              <p className="font-dm-mono text-[11px] uppercase tracking-[0.15em] text-[#E0345A] mb-1">
                Error
              </p>
              <p className="font-dm-mono text-[13px] text-white">{error}</p>
            </div>
          )}
        </div>

        <div className="dash-border-t mt-12 pt-8">
          <p className="font-dm-mono text-[10px] uppercase tracking-[0.15em] text-[#5A5A5A] mb-3">
            Other ways to get testnet ASE
          </p>
          <ul className="font-dm-mono text-[13px] text-[#A1A1A6] leading-relaxed space-y-2">
            <li>· In the wallet extension: tap the faucet button on your account.</li>
            <li>· In the Telegram bot: <span className="text-white">@AsentumBot</span> → 🚰 Faucet.</li>
            <li>· Direct: <code className="text-[#7D7D7D]">POST /dev/faucet {'{to, amount}'}</code></li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
