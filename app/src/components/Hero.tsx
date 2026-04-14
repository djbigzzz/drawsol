"use client";

import { useSolPrice } from "@/hooks/useSolPrice";
import { GRAND_PRIZE_SOL, DRAW_NUMBER } from "@/lib/constants";

export default function Hero() {
  const { price } = useSolPrice();
  const usdValue = price ? (price * GRAND_PRIZE_SOL).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }) : "...";

  return (
    <section className="pt-24 pb-8 px-4 text-center">
      {/* SOL coin illustration */}
      <div className="mx-auto w-32 h-32 mb-6 relative">
        <svg viewBox="0 0 128 128" className="w-full h-full drop-shadow-2xl">
          <defs>
            <linearGradient id="solGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F7931A" />
              <stop offset="50%" stopColor="#FFB347" />
              <stop offset="100%" stopColor="#F7931A" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r="60" fill="url(#solGrad)" />
          <circle cx="64" cy="64" r="52" fill="none" stroke="#05080F" strokeWidth="1" opacity="0.3" />
          {/* SOL logo paths */}
          <g transform="translate(32, 38) scale(0.5)">
            <path
              d="M20.4 89.2l19.6-20.8c.6-.6 1.4-1 2.3-1h81.5c1.4 0 2.2 1.7 1.2 2.8l-19.6 20.8c-.6.6-1.4 1-2.3 1H21.6c-1.4 0-2.2-1.7-1.2-2.8z"
              fill="#05080F"
            />
            <path
              d="M20.4 17.6l19.6-20.8c.6-.6 1.4-1 2.3-1h81.5c1.4 0 2.2 1.7 1.2 2.8L105.4 19.4c-.6.6-1.4 1-2.3 1H21.6c-1.4 0-2.2-1.7-1.2-2.8z"
              fill="#05080F"
            />
            <path
              d="M105.4 53l-19.6-20.8c-.6-.6-1.4-1-2.3-1H2c-1.4 0-2.2 1.7-1.2 2.8l19.6 20.8c.6.6 1.4 1 2.3 1h81.5c1.4 0 2.2-1.7 1.2-2.8z"
              fill="#05080F"
            />
          </g>
        </svg>
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl -z-10" />
      </div>

      <h1 className="font-heading font-black text-5xl md:text-7xl mb-3">
        WIN <span className="text-primary">100 SOL</span>
      </h1>

      <p className="font-mono text-2xl md:text-3xl text-accent mb-2">
        {usdValue}
      </p>

      <p className="text-text/60 font-body text-sm">
        Draw #{DRAW_NUMBER} &middot; Provably Fair &middot; On-chain VRF
      </p>
    </section>
  );
}
