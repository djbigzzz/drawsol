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
    <div className="bg-surface border border-white/[0.06] rounded-[16px] p-6 mb-5">
      <div className="flex justify-between items-baseline mb-5">
        <span className="text-[13px] text-secondary font-medium">Prize Pool</span>
        <span className="text-[13px] font-mono text-secondary">
          {ticketsSold} ticket{ticketsSold !== 1 ? "s" : ""} sold
        </span>
      </div>

      <div className="flex items-baseline justify-between mb-5">
        <div>
          <span className="font-mono text-3xl font-bold bg-gradient-to-r from-primary-light to-gold bg-clip-text text-transparent">
            ${collected.toLocaleString("en-US", { minimumFractionDigits: 0 })}
          </span>
        </div>
        <div className="text-right">
          <span className="text-tertiary text-[12px]">of </span>
          <span className="font-mono text-xl text-secondary">
            ${threshold.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>

      {/* Progress bar with violet-to-gold gradient */}
      <div className="h-2.5 bg-white/[0.04] rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary-light to-gold transition-all duration-700 shadow-[0_0_12px_rgba(124,58,237,0.4)]"
          style={{ width: `${Math.max(progress, 2)}%` }}
        />
      </div>

      <p className="text-tertiary text-[12px] text-center">
        Draw fires automatically at target
      </p>
    </div>
  );
}
