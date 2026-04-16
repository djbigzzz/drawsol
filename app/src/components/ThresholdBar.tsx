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
    <div className="mb-6">
      <div className="bg-surface rounded-card border border-white/[0.06] p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <p className="text-tertiary text-[11px] font-medium mb-1">Tickets</p>
            <p className="font-mono text-xl font-bold text-text">{ticketsSold.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-tertiary text-[11px] font-medium mb-1">Collected</p>
            <p className="font-mono text-xl font-bold text-primary">
              ${collected.toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-tertiary text-[11px] font-medium mb-1">Target</p>
            <p className="font-mono text-xl font-bold text-secondary">
              ${threshold.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${Math.max(progress, 1)}%` }}
          />
        </div>

        <p className="text-tertiary text-[12px] text-center">
          {progress < 100
            ? "Draw triggers automatically when target is reached"
            : "Threshold met — draw starting soon"}
        </p>
      </div>
    </div>
  );
}
