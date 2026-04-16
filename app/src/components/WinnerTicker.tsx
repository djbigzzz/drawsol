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
  { wallet: "6nBs...iQ1w", amount: 5 },
];

export default function WinnerTicker() {
  const [wins] = useState<RecentWin[]>(DEMO_WINS);

  return (
    <section className="py-4 mt-12 overflow-hidden border-y border-white/[0.04]">
      <div className="flex items-center">
        <span className="text-[10px] text-tertiary px-5 whitespace-nowrap font-medium tracking-wide">
          RECENT WINS
        </span>
        <div className="overflow-hidden relative flex-1">
          <div className="ticker-scroll flex gap-3 whitespace-nowrap">
            {[...wins, ...wins].map((win, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 bg-surface rounded-full px-3.5 py-1 border border-white/[0.04]"
              >
                <span className="font-mono text-[13px] font-semibold text-success">
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
