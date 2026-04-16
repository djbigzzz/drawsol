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
    <section className="relative pt-24 pb-8 px-5 text-center overflow-hidden">
      {/* Background glows */}
      <div className="glow-breathe absolute top-[30%] left-1/2 w-[800px] h-[450px] rounded-full blur-[160px] bg-gold/[0.08] pointer-events-none" />
      <div className="glow-breathe absolute top-[35%] left-1/2 w-[400px] h-[220px] rounded-full blur-[80px] bg-gold-bright/[0.12] pointer-events-none" />

      {/* Floating particles */}
      <div className="float-1 absolute top-[15%] left-[15%] w-1.5 h-1.5 rounded-full bg-gold/70" />
      <div className="float-2 absolute top-[22%] right-[18%] w-1 h-1 rounded-full bg-primary-light/50" />
      <div className="float-3 absolute top-[45%] left-[25%] w-1 h-1 rounded-full bg-sol-green/40" />
      <div className="float-4 absolute top-[35%] right-[25%] w-1.5 h-1.5 rounded-full bg-primary/40" />
      <div className="float-2 absolute bottom-[15%] left-[20%] w-1 h-1 rounded-full bg-gold/50" />
      <div className="float-3 absolute bottom-[20%] right-[15%] w-1 h-1 rounded-full bg-sol-green/30" />

      {/* Badge */}
      <div className="relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sol-green/[0.08] border border-sol-green/[0.15] mb-5">
        <span className="w-2 h-2 rounded-full bg-sol-green animate-pulse" />
        <span className="text-sol-green text-[13px] font-semibold tracking-wider">LIVE DRAW</span>
      </div>

      {/* Prize headline with shimmer */}
      <div className="relative mb-2" style={{ filter: "drop-shadow(0 0 60px rgba(245, 183, 49, 0.25))" }}>
        <h1 className="font-display font-bold text-[90px] md:text-[130px] leading-[0.85] tracking-[-0.03em]">
          <span className="shimmer-gold">100 SOL</span>
        </h1>
      </div>

      {/* USD value */}
      <p className="relative font-mono text-[26px] md:text-[34px] font-bold tracking-tight mb-6 bg-gradient-to-r from-gold to-gold-bright bg-clip-text text-transparent">
        ${usdValue}
      </p>

      {/* Stacked scratch cards */}
      <div className="relative mx-auto w-[300px] h-[170px] mb-6">
        {/* Back card (left) */}
        <div
          className="absolute left-2 top-2 w-[220px] h-[140px] rounded-xl overflow-hidden opacity-50"
          style={{ transform: "rotate(-8deg)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#D4940F] via-[#C88A0A] to-[#A67208]" />
          <div className="absolute inset-0 crosshatch" />
        </div>

        {/* Back card (right) */}
        <div
          className="absolute right-2 top-1 w-[220px] h-[140px] rounded-xl overflow-hidden opacity-50"
          style={{ transform: "rotate(6deg)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#D4940F] via-[#C88A0A] to-[#A67208]" />
          <div className="absolute inset-0 crosshatch" />
        </div>

        {/* Front card (center) */}
        <div
          className="card-shimmer absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] h-[150px] rounded-xl overflow-hidden shadow-[0_15px_50px_rgba(245,183,49,0.2)] z-10"
          style={{ transform: "translate(-50%, -50%) rotate(-2deg)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#F7D14B] via-[#E8A817] to-[#C88A0A]" />
          <div className="absolute inset-0 crosshatch" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-white/50 text-[10px] font-bold tracking-[0.25em]">SCRATCH & WIN</span>
            <span className="text-white/30 text-4xl font-display font-bold mt-0.5">???</span>
            <span className="text-white/45 text-[11px] font-semibold mt-1">UP TO $50 INSTANT</span>
          </div>
        </div>

        {/* Shadow under stack */}
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-[200px] h-[15px] bg-gold/[0.1] rounded-full blur-xl z-0" />
      </div>

      <p className="relative text-secondary text-[15px] max-w-md mx-auto leading-relaxed mb-7">
        Every ticket includes an instant scratch card. Answer a skill question,
        buy tickets, and enter the provably fair grand draw.
      </p>

      <a
        href="#buy"
        className="pulse-cta relative inline-flex bg-gradient-to-r from-primary to-primary-light text-white font-bold text-[16px] px-10 py-4 rounded-full transition-all shadow-[0_0_30px_rgba(124,58,237,0.35)] hover:shadow-[0_0_50px_rgba(124,58,237,0.5)] active:scale-[0.97] border border-white/[0.15] hover:-translate-y-0.5"
      >
        Get Tickets
      </a>
    </section>
  );
}
