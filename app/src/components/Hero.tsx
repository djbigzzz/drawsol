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
    <section className="relative pt-36 pb-16 px-5 text-center">
      {/* The one gradient text — the prize headline */}
      <h1 className="font-display font-bold text-[80px] md:text-[110px] leading-[0.85] tracking-[-0.03em] mb-5">
        <span className="bg-gradient-to-b from-white via-white to-white/40 bg-clip-text text-transparent">
          Win{" "}
        </span>
        <span className="bg-gradient-to-r from-primary via-gold to-primary bg-clip-text text-transparent">
          100 SOL
        </span>
      </h1>

      <p className="font-mono text-[28px] md:text-[36px] text-success font-medium tracking-tight mb-6">
        ${usdValue}
      </p>

      <p className="text-secondary text-[15px] max-w-sm mx-auto leading-relaxed mb-10">
        Buy a ticket, scratch for instant wins, and enter the grand draw.
        Provably fair with on-chain VRF.
      </p>

      <a
        href="#buy"
        className="inline-flex bg-primary hover:bg-[#C05E1A] text-white font-semibold text-[15px] px-8 py-3.5 rounded-[10px] transition-all shadow-[0_0_24px_rgba(212,105,31,0.25)] hover:shadow-[0_0_32px_rgba(212,105,31,0.35)] active:scale-[0.97]"
      >
        Get Tickets
      </a>
    </section>
  );
}
