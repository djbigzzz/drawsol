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
    <section className="pt-32 pb-20 px-5 text-center">
      <p className="text-tertiary text-[13px] font-medium mb-6 tracking-wide">
        DRAW #{DRAW_NUMBER}
      </p>

      <h1 className="font-display font-bold text-[72px] md:text-[96px] leading-[0.9] tracking-tight mb-6">
        Win 100 SOL
      </h1>

      <p className="font-mono text-2xl md:text-3xl text-success font-medium mb-8">
        {usdValue}
      </p>

      <div className="flex items-center justify-center gap-4 text-tertiary text-[13px] mb-10">
        <span>Provably Fair</span>
        <span className="w-px h-3 bg-white/[0.08]" />
        <span>On-chain VRF</span>
        <span className="w-px h-3 bg-white/[0.08]" />
        <span>Instant Payouts</span>
      </div>

      <a
        href="#buy"
        className="inline-flex items-center gap-2 bg-primary hover:bg-[#D4691F] text-white font-semibold text-[15px] px-8 py-3.5 rounded-btn transition-colors active:scale-[0.98]"
      >
        Get Tickets
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </a>
    </section>
  );
}
