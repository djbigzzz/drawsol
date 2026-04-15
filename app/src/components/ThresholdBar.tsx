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

  const threshold =
    drawState && drawState.thresholdUsdc.toNumber() > 0
      ? drawState.thresholdUsdc.toNumber() / 1_000_000
      : price
      ? price * GRAND_PRIZE_SOL * 1.5
      : 12_600;

  const progress = Math.min((collected / threshold) * 100, 100);
  const ticketsSold = drawState?.ticketsSold ?? 0;

  return (
    <section className="px-4 pb-6 max-w-2xl mx-auto">
      <div className="glass rounded-2xl p-6 space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-muted/50 mb-1 font-medium uppercase tracking-wider">Tickets Sold</p>
            <p className="font-mono text-xl font-bold text-text">{ticketsSold.toLocaleString()}</p>
          </div>
          <div className="text-center border-x border-white/[0.04]">
            <p className="text-xs text-muted/50 mb-1 font-medium uppercase tracking-wider">Collected</p>
            <p className="font-mono text-xl font-bold gradient-text">
              ${collected.toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted/50 mb-1 font-medium uppercase tracking-wider">Target</p>
            <p className="font-mono text-xl font-bold text-muted/70">
              ${threshold.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="relative h-3 bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full progress-bar transition-all duration-1000 ease-out"
              style={{ width: `${Math.max(progress, 1.5)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted/40">{progress.toFixed(1)}% to threshold</span>
            <span className="text-muted/40 font-mono">Draw fires automatically</span>
          </div>
        </div>

        {/* Countdown */}
        <div className="pt-3 border-t border-white/[0.04] text-center">
          <p className="text-xs text-muted/40 mb-1">Status</p>
          <p className="font-mono text-sm font-semibold text-emerald-400">
            Accepting entries — waiting for threshold
          </p>
        </div>
      </div>
    </section>
  );
}
