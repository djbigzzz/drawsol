"use client";

import { useState, useEffect } from "react";

interface Activity {
  type: "buy" | "win";
  count?: number;
  amount?: number;
  wallet: string;
  ago: string;
  avatar: string;
}

const COLORS = ["#7C3AED", "#14F195", "#F5B731", "#EC4899", "#3B82F6", "#10B981", "#8B5CF6", "#FBBF24"];

const ACTIVITIES: Activity[] = [
  { type: "buy", count: 3, wallet: "7xKX...h3Qm", ago: "4s", avatar: COLORS[0] },
  { type: "win", amount: 25, wallet: "9pLv...bT5r", ago: "18s", avatar: COLORS[1] },
  { type: "buy", count: 1, wallet: "3mNq...dW8s", ago: "32s", avatar: COLORS[2] },
  { type: "win", amount: 10, wallet: "5kRf...gP2j", ago: "47s", avatar: COLORS[3] },
  { type: "buy", count: 5, wallet: "2vYt...cA9n", ago: "1m", avatar: COLORS[4] },
  { type: "win", amount: 5, wallet: "8wDz...fL4x", ago: "1m", avatar: COLORS[5] },
  { type: "buy", count: 2, wallet: "4jHm...eK7v", ago: "2m", avatar: COLORS[6] },
  { type: "win", amount: 50, wallet: "6nBs...iQ1w", ago: "2m", avatar: COLORS[7] },
  { type: "buy", count: 10, wallet: "1dPw...kR8m", ago: "3m", avatar: COLORS[0] },
  { type: "win", amount: 10, wallet: "9fTq...wV3n", ago: "3m", avatar: COLORS[3] },
  { type: "buy", count: 1, wallet: "8kBr...mP4w", ago: "4m", avatar: COLORS[5] },
  { type: "buy", count: 7, wallet: "5nXq...jL2d", ago: "5m", avatar: COLORS[2] },
];

export default function LiveFeed() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative py-3 overflow-hidden bg-surface/60 border-y border-white/[0.05]">
      {/* Edge fades */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-bg to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-bg to-transparent z-10" />

      {/* LIVE label */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 z-20 hidden lg:flex items-center gap-2 px-3 py-1.5 bg-bg rounded-full border border-white/[0.06]">
        <span className="w-1.5 h-1.5 rounded-full bg-sol-green animate-pulse" />
        <span className="text-[11px] text-sol-green font-bold tracking-wider">LIVE</span>
      </div>

      <div className="flex items-center lg:pl-28">
        <div className="overflow-hidden relative flex-1">
          <div className="ticker-scroll flex gap-2.5 whitespace-nowrap">
            {[...ACTIVITIES, ...ACTIVITIES].map((activity, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.03]"
              >
                {/* Avatar circle */}
                <div
                  className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold text-white/80"
                  style={{ backgroundColor: activity.avatar + "40", borderColor: activity.avatar + "60", borderWidth: 1 }}
                >
                  {activity.wallet.charAt(0)}
                </div>

                {activity.type === "win" ? (
                  <>
                    <span className="font-mono text-[13px] font-bold text-gold">
                      +${activity.amount}
                    </span>
                    <span className="text-secondary font-mono text-[11px]">
                      {activity.wallet}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] font-medium text-sol-green">
                      {activity.count} ticket{activity.count! > 1 ? "s" : ""}
                    </span>
                    <span className="text-secondary font-mono text-[11px]">
                      {activity.wallet}
                    </span>
                  </>
                )}
                <span className="text-tertiary/50 text-[10px] font-mono">{activity.ago}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
