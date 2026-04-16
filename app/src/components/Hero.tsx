"use client";

import { useSolPrice } from "@/hooks/useSolPrice";
import { GRAND_PRIZE_SOL } from "@/lib/constants";

export default function Hero() {
  const { price } = useSolPrice();
  const usdValue = price
    ? (price * GRAND_PRIZE_SOL).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })
    : "...";

  return (
    <section className="relative pt-32 pb-20 px-5 text-center overflow-hidden">
      {/* Outer golden glow */}
      <div className="glow-breathe absolute top-[38%] left-1/2 w-[800px] h-[450px] rounded-full blur-[160px] bg-gold/[0.1] pointer-events-none" />
      {/* Inner bright halo */}
      <div className="glow-breathe absolute top-[42%] left-1/2 w-[400px] h-[220px] rounded-full blur-[80px] bg-gold-bright/[0.15] pointer-events-none" />

      {/* Floating particles */}
      <div className="float-1 absolute top-[20%] left-[20%] w-1.5 h-1.5 rounded-full bg-gold/70" />
      <div className="float-2 absolute top-[30%] right-[22%] w-1 h-1 rounded-full bg-primary-light/50" />
      <div className="float-3 absolute top-[55%] left-[30%] w-1 h-1 rounded-full bg-gold-bright/60" />
      <div className="float-4 absolute top-[45%] right-[30%] w-1.5 h-1.5 rounded-full bg-primary/40" />
      <div className="float-2 absolute bottom-[25%] left-[25%] w-1 h-1 rounded-full bg-gold/50" />
      <div className="float-3 absolute bottom-[30%] right-[20%] w-1 h-1 rounded-full bg-primary-light/30" />

      {/* Badge */}
      <div className="relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.12] border border-primary/[0.2] mb-8">
        <span className="w-2 h-2 rounded-full bg-gold-bright animate-pulse" />
        <span className="text-primary-light text-[13px] font-semibold tracking-wider">GRAND PRIZE</span>
      </div>

      {/* Prize headline with shimmer */}
      <div className="relative" style={{ filter: "drop-shadow(0 0 60px rgba(245, 183, 49, 0.3))" }}>
        <h1 className="font-display font-bold text-[100px] md:text-[140px] leading-[0.85] tracking-[-0.03em] mb-4">
          <span className="shimmer-gold">100 SOL</span>
        </h1>
      </div>

      {/* USD value in gold, not green */}
      <p className="relative font-mono text-[30px] md:text-[40px] font-bold tracking-tight mb-7 bg-gradient-to-r from-gold to-gold-bright bg-clip-text text-transparent">
        ${usdValue}
      </p>

      <p className="relative text-secondary text-[16px] max-w-md mx-auto leading-relaxed mb-12">
        Buy a ticket, scratch for instant wins, and enter the grand draw.
        Provably fair with on-chain VRF.
      </p>

      <a
        href="#buy"
        className="pulse-cta relative inline-flex bg-gradient-to-r from-primary to-primary-light text-white font-bold text-[16px] px-10 py-4 rounded-[12px] transition-all shadow-[0_0_30px_rgba(124,58,237,0.35)] hover:shadow-[0_0_50px_rgba(124,58,237,0.5)] active:scale-[0.97] border border-white/[0.15] hover:-translate-y-0.5"
      >
        Get Tickets
      </a>
    </section>
  );
}
