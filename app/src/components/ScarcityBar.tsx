"use client";

import { useDrawState } from "@/hooks/useDrawState";

export default function ScarcityBar() {
  const { drawState } = useDrawState();
  const ticketsSold = drawState?.ticketsSold ?? 247;
  const maxTickets = 10000;
  const remaining = maxTickets - ticketsSold;

  return (
    <div className="max-w-[880px] mx-auto px-5 pt-8">
      <div className="flex items-center justify-center gap-3 py-3 px-5 bg-sol-green/[0.06] border border-sol-green/[0.1] rounded-full">
        <span className="w-2 h-2 rounded-full bg-sol-green animate-pulse shrink-0" />
        <span className="text-sol-green text-[13px] sm:text-[14px] font-semibold">
          {ticketsSold.toLocaleString()} tickets sold
        </span>
        <span className="text-tertiary/40 hidden sm:inline">|</span>
        <span className="text-secondary text-[13px] sm:text-[14px] hidden sm:inline">
          {remaining.toLocaleString()} remaining
        </span>
      </div>
    </div>
  );
}
