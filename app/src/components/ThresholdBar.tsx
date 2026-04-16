"use client";

import { useDrawState } from "@/hooks/useDrawState";
import { useSolPrice } from "@/hooks/useSolPrice";
import { GRAND_PRIZE_SOL } from "@/lib/constants";

export default function ThresholdBar() {
  const { drawState } = useDrawState();
  const { price } = useSolPrice();

  const collected = drawState
    ? drawState.usdcCollected.toNumber() / 1_000_000
    : 0;

  const threshold =
    drawState && drawState.thresholdUsdc.toNumber() > 0
      ? drawState.thresholdUsdc.toNumber() / 1_000_000
      : price
      ? price * GRAND_PRIZE_SOL * 1.5
      : 12_600;

  const progress = Math.min((collected / threshold) * 100, 100);
  const ticketsSold = drawState?.ticketsSold ?? 0;

  return (
    <div className="card-glow bg-surface border border-white/[0.06] rounded-[20px] p-7 mb-5">
      <div className="flex justify-between items-baseline mb-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-sol-green animate-pulse" />
          <span className="text-[14px] text-text font-semibold">Prize Pool</span>
        </div>
        <span className="text-[13px] font-mono text-secondary">
          {ticketsSold} ticket{ticketsSold !== 1 ? "s" : ""} sold
        </span>
      </div>

      <div className="flex items-end justify-between mb-6">
        <div>
          <span className="font-mono text-4xl font-bold bg-gradient-to-r from-primary-light via-gold to-gold-bright bg-clip-text text-transparent">
            ${collected.toLocaleString("en-US", { minimumFractionDigits: 0 })}
          </span>
        </div>
        <div className="text-right pb-1">
          <span className="text-tertiary text-[13px]">of </span>
          <span className="font-mono text-xl font-semibold text-secondary">
            ${threshold.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Progress bar with strobe */}
      <div className="h-3.5 bg-white/[0.04] rounded-full overflow-hidden mb-3 relative border border-white/[0.03]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary-light to-gold transition-all duration-700 relative overflow-hidden"
          style={{
            width: `${Math.max(progress, 3)}%`,
            boxShadow: "0 0 16px rgba(124, 58, 237, 0.4), 0 0 4px rgba(251, 191, 36, 0.3)",
          }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.2] to-transparent" />
          <div className="progress-strobe" />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-tertiary text-[12px]">
          Draw fires automatically at target
        </p>
        <span className="font-mono text-[12px] text-sol-green font-semibold">
          {progress.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
