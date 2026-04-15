"use client";

import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/70 backdrop-blur-xl border-b border-white/[0.04]">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <span className="font-bold text-white text-sm tracking-tight">DS</span>
          </div>
          <span className="font-bold text-lg tracking-tight text-text">
            Draw<span className="gradient-text">Sol</span>
          </span>
          <div className="flex items-center gap-1.5 ml-3 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono font-semibold text-emerald-400 uppercase tracking-wider">Live</span>
          </div>
        </div>
        <WalletMultiButton />
      </div>
    </nav>
  );
}
