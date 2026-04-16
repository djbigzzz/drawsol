"use client";

import { useState } from "react";

interface RecentWin {
  wallet: string;
  amount: number;
}

const DEMO_WINS: RecentWin[] = [
  { wallet: "7xKX...h3Qm", amount: 50 },
  { wallet: "9pLv...bT5r", amount: 5 },
  { wallet: "3mNq...dW8s", amount: 10 },
  { wallet: "5kRf...gP2j", amount: 25 },
  { wallet: "2vYt...cA9n", amount: 5 },
  { wallet: "8wDz...fL4x", amount: 10 },
  { wallet: "4jHm...eK7v", amount: 5 },
  { wallet: "6nBs...iQ1w", amount: 50 },
  { wallet: "1dPw...kR8m", amount: 25 },
  { wallet: "9fTq...wV3n", amount: 10 },
];

export default function WinnerTicker() {
  const [wins] = useState<RecentWin[]>(DEMO_WINS);

  return (
    <section className="relative py-4 overflow-hidden bg-surface/60 border-y border-white/[0.05]">
      {/* Edge fades */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-bg to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-bg to-transparent z-10" />

      {/* Label */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 z-20 hidden md:flex items-center gap-2 px-3 py-1 bg-surface rounded-full border border-white/[0.06]">
        <span className="w-1.5 h-1.5 rounded-full bg-gold-bright animate-pulse" />
        <span className="text-[11px] text-secondary font-semibold tracking-wide">RECENT WINS</span>
      </div>

      <div className="flex items-center md:pl-40">
        <div className="overflow-hidden relative flex-1">
          <div className="ticker-scroll flex gap-4 whitespace-nowrap">
            {[...wins, ...wins].map((win, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03]"
              >
                <span className="font-mono text-[14px] font-bold text-gold">
                  +${win.amount}
                </span>
                <span className="text-secondary font-mono text-[12px]">
                  {win.wallet}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
