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
      {/* Breathing glow behind prize */}
      <div className="glow-breathe absolute top-[35%] left-1/2 w-[500px] h-[300px] rounded-full blur-[120px] bg-gradient-to-r from-gold/30 via-primary/20 to-gold/30 pointer-events-none" />

      <p className="relative text-secondary text-[14px] font-medium tracking-wide uppercase mb-4">
        Grand Prize
      </p>

      <h1 className="relative font-display font-bold text-[90px] md:text-[130px] leading-[0.85] tracking-[-0.03em] mb-3">
        <span className="bg-gradient-to-b from-gold-bright via-gold to-gold/60 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(245,183,49,0.3)]">
          100 SOL
        </span>
      </h1>

      <p className="relative font-mono text-[28px] md:text-[36px] text-success font-medium tracking-tight mb-6">
        ${usdValue}
      </p>

      <p className="relative text-secondary text-[15px] max-w-sm mx-auto leading-relaxed mb-10">
        Buy a ticket, scratch for instant wins, and enter the grand draw.
        Provably fair with on-chain VRF.
      </p>

      <a
        href="#buy"
        className="relative inline-flex bg-gradient-to-r from-primary to-primary-light text-white font-semibold text-[15px] px-8 py-3.5 rounded-[10px] transition-all shadow-[0_0_30px_rgba(124,58,237,0.3)] hover:shadow-[0_0_40px_rgba(124,58,237,0.45)] active:scale-[0.97] border border-white/[0.1]"
      >
        Get Tickets
      </a>
    </section>
  );
}
