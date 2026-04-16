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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/80 backdrop-blur-lg border-b border-white/[0.04]">
      <div className="max-w-[960px] mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
            <span className="font-display font-bold text-white text-xs">D</span>
          </div>
          <span className="font-display font-semibold text-[15px] text-text">DrawSol</span>
          <span className="ml-2 text-[10px] font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
            LIVE
          </span>
        </div>
        <WalletMultiButton />
      </div>
    </nav>
  );
}
