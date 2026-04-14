"use client";

import { useState, useEffect } from "react";

interface RecentWin {
  wallet: string;
  amount: number;
  timestamp: number;
}

// Demo data — in production, this fetches from PendingPayout PDAs
const DEMO_WINS: RecentWin[] = [
  { wallet: "7xKX...h3Qm", amount: 50, timestamp: Date.now() - 3600000 },
  { wallet: "9pLv...bT5r", amount: 5, timestamp: Date.now() - 7200000 },
  { wallet: "3mNq...dW8s", amount: 10, timestamp: Date.now() - 10800000 },
  { wallet: "5kRf...gP2j", amount: 25, timestamp: Date.now() - 14400000 },
  { wallet: "2vYt...cA9n", amount: 5, timestamp: Date.now() - 18000000 },
  { wallet: "8wDz...fL4x", amount: 10, timestamp: Date.now() - 21600000 },
  { wallet: "4jHm...eK7v", amount: 5, timestamp: Date.now() - 25200000 },
  { wallet: "6nBs...iQ1w", amount: 5, timestamp: Date.now() - 28800000 },
];

export default function WinnerTicker() {
  const [wins] = useState<RecentWin[]>(DEMO_WINS);

  return (
    <section className="py-6 overflow-hidden border-y border-white/5">
      <div className="flex items-center">
        <span className="text-xs text-text/40 font-body px-4 whitespace-nowrap">
          RECENT WINS
        </span>
        <div className="overflow-hidden relative flex-1">
          <div className="ticker-scroll flex gap-6 whitespace-nowrap">
            {[...wins, ...wins].map((win, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 bg-white/5 rounded-full px-4 py-1.5"
              >
                <span className="text-accent font-mono text-sm font-bold">
                  ${win.amount}
                </span>
                <span className="text-text/40 font-mono text-xs">
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
