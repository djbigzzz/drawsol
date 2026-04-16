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
    <nav className="fixed top-0 left-0 right-0 z-40 bg-bg/80 backdrop-blur-xl border-b border-white/[0.04]">
      <div className="max-w-[960px] mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-display font-bold text-[17px] bg-gradient-to-r from-primary-light via-text to-gold bg-clip-text text-transparent tracking-tight">
            DrawSol
          </span>
          <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-sol-green font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-sol-green animate-pulse" />
            <span>Draw #1 Live</span>
          </div>
        </div>
        <WalletMultiButton />
      </div>
    </nav>
  );
}
