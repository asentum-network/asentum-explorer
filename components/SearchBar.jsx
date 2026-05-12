// asentum-explorer · Universal search box. Routes the input to the
// right detail page based on shape (block number, tx hash, address).
//
// milkie · 2026

import { useState } from 'react';
import { useRouter } from 'next/router';
import { Search } from 'lucide-react';
import { isHash, isAddress, isBlockNumber } from '@/lib/format';

export default function SearchBar() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  const submit = (e) => {
    e?.preventDefault();
    setError(null);
    const raw = q.trim();
    if (!raw) return;
    if (isHash(raw)) {
      router.push(`/tx/${raw}`);
      setQ('');
    } else if (isAddress(raw)) {
      router.push(`/address/${raw.toLowerCase()}`);
      setQ('');
    } else if (isBlockNumber(raw)) {
      router.push(`/block/${raw}`);
      setQ('');
    } else if (/^0x[0-9a-fA-F]+$/.test(raw)) {
      // Hex input that's neither a 64-char hash nor a 40-char address.
      // Treat it as a block hash; the block detail page falls back gracefully.
      router.push(`/block/${raw}`);
      setQ('');
    } else {
      setError('Enter a block number, tx hash, or address.');
    }
  };

  return (
    <form onSubmit={submit} className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#5A5A5A]" />
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); if (error) setError(null); }}
        placeholder="Block / tx hash / address"
        className="w-full pl-9 pr-3 py-2 bg-[#0A0A0A] border border-[#1F1F1F] focus:border-[#2A2A2A] outline-none font-dm-mono text-[12px] text-white placeholder-[#5A5A5A]"
      />
      {error && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-[#1A0808] border border-[#3A1A1A] px-3 py-2 font-dm-mono text-[10px] text-[#F87171]">
          {error}
        </div>
      )}
    </form>
  );
}
