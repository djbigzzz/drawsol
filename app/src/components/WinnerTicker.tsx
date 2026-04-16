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
    <section className="relative py-3 overflow-hidden bg-surface/50 border-y border-white/[0.04]">
      {/* Edge fade gradients */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-bg to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-bg to-transparent z-10" />

      <div className="flex items-center">
        <div className="overflow-hidden relative flex-1">
          <div className="ticker-scroll flex gap-3 whitespace-nowrap">
            {[...wins, ...wins].map((win, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1"
              >
                <span className="font-mono text-[13px] font-semibold text-gold">
                  +${win.amount}
                </span>
                <span className="text-tertiary font-mono text-[11px]">
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
