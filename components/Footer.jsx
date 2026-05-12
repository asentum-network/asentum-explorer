// asentum-explorer · Page footer. Network info plus links to the
// marketing site, docs, X, and Telegram.
//
// milkie · 2026

import Link from 'next/link';
import { RPC_URL, CHAIN_NAME, CHAIN_ID } from '@/lib/rpc';

export default function Footer() {
  return (
    <footer className="dash-border-t mt-20">
      <div className="px-[4%] py-10 grid grid-cols-1 md:grid-cols-4 gap-6">
        <div>
          <p className="font-plus font-bold text-white text-[14px] mb-2">Asentum Explorer</p>
          <p className="font-dm-mono text-[11px] text-[#7D7D7D] leading-relaxed">
            Block explorer for the post-quantum, JavaScript-native L1.
          </p>
        </div>

        <div>
          <p className="font-dm-mono text-[10px] tracking-[0.15em] uppercase text-[#5A5A5A] mb-3">Explorer</p>
          <ul className="space-y-2 font-dm-mono text-[12px]">
            <li><Link href="/blocks" className="text-[#A1A1A6] hover:text-white">Blocks</Link></li>
            <li><Link href="/validators" className="text-[#A1A1A6] hover:text-white">Validators</Link></li>
          </ul>
        </div>

        <div>
          <p className="font-dm-mono text-[10px] tracking-[0.15em] uppercase text-[#5A5A5A] mb-3">Network</p>
          <ul className="space-y-2 font-dm-mono text-[12px] text-[#A1A1A6]">
            <li>Chain: <span className="text-white">{CHAIN_NAME}</span></li>
            <li>Chain ID: <span className="text-white">{CHAIN_ID}</span></li>
            <li className="break-all">
              RPC: <a href={RPC_URL} className="text-[#A6A6FF] hover:text-white underline">{RPC_URL}</a>
            </li>
          </ul>
        </div>

        <div>
          <p className="font-dm-mono text-[10px] tracking-[0.15em] uppercase text-[#5A5A5A] mb-3">Project</p>
          <ul className="space-y-2 font-dm-mono text-[12px]">
            <li><a href="https://asentum.com" className="text-[#A1A1A6] hover:text-white">asentum.com →</a></li>
            <li><a href="https://asentum.com/docs" className="text-[#A1A1A6] hover:text-white">Docs →</a></li>
            <li><a href="https://x.com/asentum" className="text-[#A1A1A6] hover:text-white">X / Twitter →</a></li>
            <li><a href="https://t.me/asentum" className="text-[#A1A1A6] hover:text-white">Telegram →</a></li>
          </ul>
        </div>
      </div>
      <div className="dash-border-t px-[4%] py-4">
        <p className="font-dm-mono text-[10px] text-[#5A5A5A]">© Asentum {new Date().getUTCFullYear()}</p>
      </div>
    </footer>
  );
}
