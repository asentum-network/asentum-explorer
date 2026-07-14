// asentum-explorer · Sticky page header. Logo, primary nav, universal
// search, and a live block badge that polls the RPC every 6 seconds.
//
// On screens below `md`, the nav collapses into a hamburger dropdown
// so the row only carries the logo, search, and toggle. The block
// badge moves inside the dropdown.
//
// milkie · 2026

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import SearchBar from './SearchBar';
import { getBlockNumber, CHAIN_NAME } from '@/lib/rpc';

function BlockBadge({ className = 'hidden sm:flex' }) {
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
      className={`${className} items-center gap-2 px-3 py-1.5 border border-[#1F1F1F] hover:border-[#2A2A2A] transition-colors`}
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
  { label: 'Faucet', href: '/faucet' },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-50 backdrop-blur-sm bg-black/80 border-b border-[#1F1F1F]">
      <div className="px-[6%] py-3 flex items-center gap-3 md:gap-4">
        <Link href="/" className="flex items-center gap-3 flex-shrink-0" onClick={closeMobile}>
          <img src="https://asentum.com/images/logo.svg" alt="Asentum" style={{ width: 110, height: 22 }} />
          <span className="hidden sm:inline-block font-dm-mono text-[10px] tracking-[0.15em] text-[#7D7D7D] uppercase border-l border-[#1F1F1F] pl-3">
            Explorer
          </span>
        </Link>

        {/* Desktop nav */}
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

        {/* Search — flexes to fill remaining row width */}
        <div className="flex-1 min-w-0 max-w-xl mx-auto">
          <SearchBar />
        </div>

        <BlockBadge className="hidden sm:flex" />

        {/* Mobile hamburger — only visible below md */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden p-2 text-white flex-shrink-0"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 border-t border-[#1F1F1F] ${
          mobileOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0 border-transparent'
        }`}
      >
        <div className="px-[6%] py-3 flex flex-col gap-1">
          {/* Block badge shows here on extra-small screens too */}
          <div className="sm:hidden mb-2">
            <BlockBadge className="inline-flex" />
          </div>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={closeMobile}
              className="font-dm-mono text-[13px] text-[#A1A1A6] hover:text-white transition-colors px-3 py-2.5 rounded hover:bg-[#0F0F0F]"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
