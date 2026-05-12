// asentum-explorer · Sticky page header. Logo, primary nav, universal
// search, and a live block badge that polls the RPC every 6 seconds.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SearchBar from './SearchBar';
import { getBlockNumber, CHAIN_NAME } from '@/lib/rpc';

function BlockBadge() {
  const [block, setBlock] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const fetchBlock = async () => {
      try {
        const n = await getBlockNumber();
        if (cancelled) return;
        setBlock(n);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    fetchBlock();
    timer = setInterval(fetchBlock, 6000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <Link
      href="/blocks"
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-[#1F1F1F] hover:border-[#2A2A2A] transition-colors"
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: failed ? '#F87171' : '#26CC6B' }}
      />
      <span className="font-dm-mono text-[10px] tracking-[0.1em] uppercase text-[#7D7D7D]">
        {CHAIN_NAME}
      </span>
      <span className="font-dm-mono text-[11px] tabular-nums text-white">
        {block !== null ? `#${block.toLocaleString()}` : '—'}
      </span>
    </Link>
  );
}

const NAV_ITEMS = [
  { label: 'Blocks', href: '/blocks' },
  { label: 'Validators', href: '/validators' },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-sm bg-black/80 border-b border-[#1F1F1F]">
      <div className="px-[4%] py-3 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <img src="https://asentum.com/images/logo.svg" alt="Asentum" style={{ width: 110, height: 22 }} />
          <span className="font-dm-mono text-[10px] tracking-[0.15em] text-[#7D7D7D] uppercase border-l border-[#1F1F1F] pl-3">
            Explorer
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-dm-mono text-[12px] text-[#A1A1A6] hover:text-white transition-colors px-3 py-1.5"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1 max-w-xl mx-auto">
          <SearchBar />
        </div>

        <BlockBadge />
      </div>
    </header>
  );
}
