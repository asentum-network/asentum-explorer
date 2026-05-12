// asentum-explorer · Universal search box with realtime preview dropdown.
// Detects the entity type from the input shape (block number, tx hash,
// block hash, address) and fetches a tight preview before the user
// commits to navigation. Click a result or hit Enter to navigate.
//
// milkie · 2026

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Search, Loader2, Cuboid, ArrowRight, User, FileText } from 'lucide-react';
import { rpc, getBlockByNumber, getBlockByHash, getTx, getReceipt, getBalance, getCode } from '@/lib/rpc';
import { hexToNumber, hexToBigInt, formatAse, shortHash, relativeTime } from '@/lib/format';

// Resolve a raw query into a preview. Returns one of:
//   { kind: 'block', path, data: { number, miner, txCount, timestamp } }
//   { kind: 'tx', path, data: { hash, from, to, value, status, blockNumber, timestamp } }
//   { kind: 'address', path, data: { address, balance, isContract, codeSize } }
//   { kind: 'miss', path: null, message }
//   null  (query is too short / malformed to even try)
async function resolveQuery(raw) {
  const q = raw.trim();
  if (!q) return null;

  // Block number (decimal).
  if (/^\d+$/.test(q)) {
    try {
      const block = await getBlockByNumber(parseInt(q, 10), false);
      if (!block) return { kind: 'miss', path: null, message: `Block #${q} not found.` };
      return {
        kind: 'block',
        path: `/block/${parseInt(q, 10)}`,
        data: {
          number: hexToNumber(block.number),
          miner: block.miner,
          txCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
          timestamp: block.timestamp,
          gasUsed: block.gasUsed,
        },
      };
    } catch {
      return { kind: 'miss', path: null, message: `Block #${q} not found.` };
    }
  }

  // Hex 0x... — 40 chars = address, 64 chars = tx hash or block hash.
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
    try {
      const [bal, code] = await Promise.all([
        getBalance(q),
        getCode(q).catch(() => '0x'),
      ]);
      const isContract = !!code && code !== '0x' && code !== '0x0';
      return {
        kind: 'address',
        path: `/address/${q.toLowerCase()}`,
        data: {
          address: q.toLowerCase(),
          balance: bal.toString(),
          isContract,
          codeSize: isContract ? Math.floor((code.length - 2) / 2) : 0,
        },
      };
    } catch (err) {
      return { kind: 'miss', path: null, message: 'Could not load address.' };
    }
  }

  if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
    // Race tx vs block-hash. Take the first non-null. Tx is more common so
    // it gets the visible priority on tie.
    try {
      const [tx, blockByHash] = await Promise.all([
        getTx(q).catch(() => null),
        getBlockByHash(q, false).catch(() => null),
      ]);
      if (tx) {
        const receipt = tx.blockNumber ? await getReceipt(q).catch(() => null) : null;
        return {
          kind: 'tx',
          path: `/tx/${q}`,
          data: {
            hash: q,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            blockNumber: tx.blockNumber ? hexToNumber(tx.blockNumber) : null,
            status: receipt ? hexToNumber(receipt.status) : null,
            contractCreated: receipt?.contractAddress || null,
          },
        };
      }
      if (blockByHash) {
        return {
          kind: 'block',
          path: `/block/${hexToNumber(blockByHash.number)}`,
          data: {
            number: hexToNumber(blockByHash.number),
            miner: blockByHash.miner,
            txCount: Array.isArray(blockByHash.transactions) ? blockByHash.transactions.length : 0,
            timestamp: blockByHash.timestamp,
            gasUsed: blockByHash.gasUsed,
            isBlockHash: true,
          },
        };
      }
      return { kind: 'miss', path: null, message: 'Hash not found on-chain.' };
    } catch {
      return { kind: 'miss', path: null, message: 'Lookup failed.' };
    }
  }

  // Hex that doesn't match either length — too short / too long.
  if (/^0x[0-9a-fA-F]+$/.test(q)) {
    return { kind: 'partial', path: null, message: 'Keep typing… need 40 chars for address or 64 for hash.' };
  }

  return { kind: 'partial', path: null, message: 'Enter a block number, tx hash, or address.' };
}

function PreviewCard({ result }) {
  if (!result) return null;
  if (result.kind === 'partial' || result.kind === 'miss') {
    return (
      <div className="px-4 py-3 font-dm-mono text-[11px]" style={{ color: result.kind === 'miss' ? '#F87171' : '#7D7D7D' }}>
        {result.message}
      </div>
    );
  }
  if (result.kind === 'block') {
    const d = result.data;
    return (
      <div className="px-4 py-3 flex items-start gap-3">
        <Cuboid className="w-4 h-4 text-[#4ADE80] mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-plus font-bold text-white text-[14px] tabular-nums">Block #{d.number.toLocaleString()}</span>
            <span className="font-dm-mono text-[10px] text-[#7D7D7D]">{relativeTime(d.timestamp)}</span>
            {d.isBlockHash && (
              <span className="font-dm-mono text-[9px] tracking-[0.1em] uppercase px-1.5 py-0.5 text-[#A6A6FF] bg-[#150D20] border border-[#2A1845]">
                matched by hash
              </span>
            )}
          </div>
          <p className="font-dm-mono text-[10px] text-[#7D7D7D] mt-1 truncate">
            <span className="text-[#5A5A5A]">Proposer </span>
            {d.miner ? <span className="text-[#A6A6FF]">{shortHash(d.miner, 8, 6)}</span> : <span className="text-[#5A5A5A]">unknown</span>}
            <span className="text-[#2A2A2A] mx-2">·</span>
            <span className="text-[#26CC6B]">{d.txCount} tx</span>
            {d.gasUsed && (
              <>
                <span className="text-[#2A2A2A] mx-2">·</span>
                <span className="text-[#7D7D7D]">{hexToNumber(d.gasUsed).toLocaleString()} gas</span>
              </>
            )}
          </p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-[#5A5A5A] mt-1 flex-shrink-0" />
      </div>
    );
  }
  if (result.kind === 'tx') {
    const d = result.data;
    const isPending = !d.blockNumber;
    const isSuccess = d.status === 1;
    return (
      <div className="px-4 py-3 flex items-start gap-3">
        <FileText className="w-4 h-4 text-[#A6A6FF] mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-plus font-bold text-white text-[14px]">Transaction</span>
            <span className="font-dm-mono text-[10px] text-[#A6A6FF]">{shortHash(d.hash, 8, 6)}</span>
            <span
              className="font-dm-mono text-[9px] tracking-[0.1em] uppercase px-1.5 py-0.5"
              style={
                isPending
                  ? { color: '#F29751', backgroundColor: '#231409', border: '1px solid #4A2911' }
                  : isSuccess
                  ? { color: '#4ADE80', backgroundColor: '#0A1408', border: '1px solid #1A3A1A' }
                  : { color: '#F87171', backgroundColor: '#1A0808', border: '1px solid #3A1A1A' }
              }
            >
              {isPending ? 'Pending' : isSuccess ? 'Success' : 'Reverted'}
            </span>
          </div>
          <p className="font-dm-mono text-[10px] text-[#7D7D7D] mt-1 truncate">
            <span className="text-white">{d.from ? shortHash(d.from, 6, 4) : '—'}</span>
            <span className="mx-1">→</span>
            {d.to ? <span className="text-white">{shortHash(d.to, 6, 4)}</span> : d.contractCreated ? <span className="text-[#A6A6FF]">deployed contract</span> : <span className="text-[#F29751]">contract creation</span>}
            <span className="text-[#2A2A2A] mx-2">·</span>
            <span className="text-[#26CC6B]">{formatAse(d.value)} ASE</span>
            {d.blockNumber != null && (
              <>
                <span className="text-[#2A2A2A] mx-2">·</span>
                <span className="text-[#7D7D7D]">block #{d.blockNumber.toLocaleString()}</span>
              </>
            )}
          </p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-[#5A5A5A] mt-1 flex-shrink-0" />
      </div>
    );
  }
  if (result.kind === 'address') {
    const d = result.data;
    return (
      <div className="px-4 py-3 flex items-start gap-3">
        <User className="w-4 h-4 text-[#F29751] mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-plus font-bold text-white text-[14px]">{d.isContract ? 'Contract' : 'Address'}</span>
            <span className="font-dm-mono text-[10px] text-[#A6A6FF]">{shortHash(d.address, 8, 6)}</span>
          </div>
          <p className="font-dm-mono text-[10px] text-[#7D7D7D] mt-1 truncate">
            <span className="text-[#26CC6B]">{formatAse(d.balance)} ASE</span>
            {d.isContract && (
              <>
                <span className="text-[#2A2A2A] mx-2">·</span>
                <span className="text-[#7D7D7D]">{d.codeSize.toLocaleString()} bytes deployed</span>
              </>
            )}
          </p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-[#5A5A5A] mt-1 flex-shrink-0" />
      </div>
    );
  }
  return null;
}

export default function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Debounced lookup.
  useEffect(() => {
    const raw = q.trim();
    if (!raw) {
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const r = await resolveQuery(raw);
      // Drop the result if the user has typed past it.
      setResult((prev) => (raw === q.trim() ? r : prev));
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    const onClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Clear preview on route change so it doesn't linger after navigation.
  useEffect(() => {
    const reset = () => { setQ(''); setResult(null); setOpen(false); };
    router.events?.on('routeChangeStart', reset);
    return () => router.events?.off('routeChangeStart', reset);
  }, [router]);

  const commit = useCallback(() => {
    if (result?.path) {
      router.push(result.path);
      return;
    }
    // Fallback: try a best-effort routing based on raw shape.
    const raw = q.trim();
    if (/^\d+$/.test(raw)) router.push(`/block/${raw}`);
    else if (/^0x[0-9a-fA-F]{40}$/.test(raw)) router.push(`/address/${raw.toLowerCase()}`);
    else if (/^0x[0-9a-fA-F]{64}$/.test(raw)) router.push(`/tx/${raw}`);
  }, [router, result, q]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5A5A5A] pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Block / tx hash / address"
        className="w-full pl-9 pr-9 py-2 bg-[#0A0A0A] border border-[#1F1F1F] focus:border-[#2A2A2A] outline-none font-dm-mono text-[12px] text-white placeholder-[#5A5A5A]"
        spellCheck="false"
        autoComplete="off"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5A5A5A] animate-spin" />
      )}

      {open && q.trim() && (result || loading) && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0A0A0A] border border-[#1F1F1F] shadow-xl">
          {result?.path ? (
            <button
              type="button"
              onClick={() => { commit(); setOpen(false); }}
              className="block w-full text-left hover:bg-[#0F0F0F] transition-colors"
            >
              <PreviewCard result={result} />
            </button>
          ) : result ? (
            <PreviewCard result={result} />
          ) : (
            <div className="px-4 py-3 font-dm-mono text-[11px] text-[#5A5A5A] flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> looking up…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
