"use client";

import { useDrawState } from "@/hooks/useDrawState";
import { useSolPrice } from "@/hooks/useSolPrice";
import { GRAND_PRIZE_SOL } from "@/lib/constants";

export default function ThresholdBar() {
  const { drawState, loading } = useDrawState();
  const { price } = useSolPrice();

  const collected = drawState
    ? drawState.usdcCollected.toNumber() / 1_000_000
    : 0;

  const threshold = drawState && drawState.thresholdUsdc.toNumber() > 0
    ? drawState.thresholdUsdc.toNumber() / 1_000_000
    : price
      ? price * GRAND_PRIZE_SOL * 1.5
      : 12_600;

  const progress = Math.min((collected / threshold) * 100, 100);
  const ticketsSold = drawState?.ticketsSold ?? 0;

  return (
    <section className="px-4 pb-8 max-w-2xl mx-auto">
      <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm text-text/60 font-body">Prize Pool Progress</span>
          <span className="text-sm font-mono text-primary">
            {ticketsSold.toLocaleString()} tickets sold
          </span>
        </div>

        {/* Progress bar */}
        <div className="relative h-4 bg-white/10 rounded-full overflow-hidden mb-3">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-1000 progress-glow"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between items-center">
          <span className="font-mono text-lg text-text">
            ${collected.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          <span className="text-sm text-text/40 font-body">
            Draw fires at{" "}
            <span className="text-primary font-mono">
              ${threshold.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </span>
          </span>
        </div>

        {loading && (
          <div className="mt-2 text-xs text-text/30 text-center">Loading...</div>
        )}
      </div>
    </section>
  );
}
