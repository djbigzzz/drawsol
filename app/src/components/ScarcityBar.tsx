"use client";

import { useDrawState } from "@/hooks/useDrawState";

export default function ScarcityBar() {
  const { drawState } = useDrawState();
  const ticketsSold = drawState?.ticketsSold ?? 247;
  const maxTickets = 10000;
  const remaining = maxTickets - ticketsSold;

  return (
    <div className="max-w-[880px] mx-auto px-5 pt-6">
      <div className="flex items-center justify-center gap-4 py-3 px-5 bg-surface/80 border border-white/[0.05] rounded-[14px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-sol-green animate-pulse shrink-0" />
          <span className="text-sol-green text-[13px] sm:text-[14px] font-bold">
            {ticketsSold.toLocaleString()} tickets sold
          </span>
        </div>
        <div className="w-px h-4 bg-white/[0.08] hidden sm:block" />
        <span className="text-secondary text-[13px] sm:text-[14px] hidden sm:inline">
          {remaining.toLocaleString()} remaining
        </span>
        <div className="w-px h-4 bg-white/[0.08] hidden md:block" />
        <div className="hidden md:flex items-center gap-1.5">
          <div className="flex -space-x-1.5">
            {["#7C3AED", "#14F195", "#F5B731", "#EC4899", "#3B82F6"].map((c, i) => (
              <div
                key={i}
                className="w-5 h-5 rounded-full border-2 border-bg"
                style={{ backgroundColor: c + "50" }}
              />
            ))}
          </div>
          <span className="text-tertiary text-[12px] ml-1">23 active now</span>
        </div>
      </div>
    </div>
  );
}
