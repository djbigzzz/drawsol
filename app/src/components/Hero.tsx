"use client";

import { useSolPrice } from "@/hooks/useSolPrice";
import { GRAND_PRIZE_SOL, DRAW_NUMBER } from "@/lib/constants";

export default function Hero() {
  const { price } = useSolPrice();
  const usdValue = price
    ? (price * GRAND_PRIZE_SOL).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "...";

  return (
    <section className="pt-28 pb-12 px-4 text-center relative">
      {/* Animated SOL coin */}
      <div className="mx-auto w-36 h-36 mb-8 relative float">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400/30 to-orange-600/10 blur-2xl scale-150" />
        <svg viewBox="0 0 128 128" className="w-full h-full relative z-10 drop-shadow-2xl">
          <defs>
            <linearGradient id="solGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="50%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="64" cy="64" r="62" fill="url(#solGrad)" filter="url(#glow)" />
          <circle cx="64" cy="64" r="54" fill="none" stroke="white" strokeWidth="0.5" opacity="0.15" />
          <g transform="translate(32, 38) scale(0.5)">
            <path
              d="M20.4 89.2l19.6-20.8c.6-.6 1.4-1 2.3-1h81.5c1.4 0 2.2 1.7 1.2 2.8l-19.6 20.8c-.6.6-1.4 1-2.3 1H21.6c-1.4 0-2.2-1.7-1.2-2.8z"
              fill="white" opacity="0.9"
            />
            <path
              d="M20.4 17.6l19.6-20.8c.6-.6 1.4-1 2.3-1h81.5c1.4 0 2.2 1.7 1.2 2.8L105.4 19.4c-.6.6-1.4 1-2.3 1H21.6c-1.4 0-2.2-1.7-1.2-2.8z"
              fill="white" opacity="0.9"
            />
            <path
              d="M105.4 53l-19.6-20.8c-.6-.6-1.4-1-2.3-1H2c-1.4 0-2.2 1.7-1.2 2.8l19.6 20.8c.6.6 1.4 1 2.3 1h81.5c1.4 0 2.2-1.7 1.2-2.8z"
              fill="white" opacity="0.9"
            />
          </g>
        </svg>
      </div>

      <div className="space-y-4">
        <p className="text-muted text-sm font-medium uppercase tracking-widest">Grand Prize</p>
        <h1 className="font-black text-6xl md:text-8xl tracking-tight">
          <span className="text-text">WIN </span>
          <span className="gradient-text">100 SOL</span>
        </h1>
        <p className="font-mono text-3xl md:text-4xl gradient-text-green font-bold">
          {usdValue}
        </p>
        <div className="flex items-center justify-center gap-3 text-muted/60 text-sm pt-2">
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Provably Fair
          </span>
          <span className="w-1 h-1 rounded-full bg-muted/30" />
          <span>Draw #{DRAW_NUMBER}</span>
          <span className="w-1 h-1 rounded-full bg-muted/30" />
          <span>On-chain VRF</span>
        </div>
      </div>
    </section>
  );
}
