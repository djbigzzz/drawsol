"use client";

import type { ReactNode } from "react";
import { useDrawSol } from "@/hooks/context";
import { phaseOf, remaining, scheduleTotals } from "@/lib/derive";
import { sol, utcLabel } from "@/lib/format";
import type { DrawView } from "@/lib/types";
import { n, prizeFig } from "./fmt";

/**
 * The draw in four numbers, under the hero: tickets sold, the SOL in escrow (or paid, or refunded), instant
 * prizes still to be won and the draw time. Every figure is read from the Draw and Schedule accounts; there is
 * no count here that the chain doesn’t hold.
 */
export function StatsStrip({ d }: { d: DrawView }) {
  const { now } = useDrawSol();
  const ph = phaseOf(d, now);
  const { count, wonCount } = scheduleTotals(d);
  const [day, time] = utcLabel(ph === "settled" ? d.settledAt : d.drawAt).split(", ");
  const items: { ic: ReactNode; v: string; k: string }[] = [
    { ic: <IcTicket />, v: n(d.paidTickets), k: `tickets sold of ${n(d.ticketCap)}` },
    ph === "settled"
      ? { ic: <IcVault />, v: `${prizeFig(d.endPrizePaid)} SOL`, k: "end prize paid out" }
      : ph === "cancelled"
        ? { ic: <IcVault />, v: `${sol(d.refundedLamports, 2, 3)} SOL`, k: "refunded so far" }
        : { ic: <IcVault />, v: `${sol(d.endPrizeLamports, 2, 2)} SOL`, k: "escrowed for the end prize" },
    count > 0
      ? { ic: <IcGift />, v: n(count - wonCount), k: `of ${n(count)} instant prizes ${ph === "settled" || ph === "cancelled" ? "not won" : "left"}` }
      : { ic: <IcGift />, v: n(remaining(d)), k: "tickets still on sale" },
    { ic: <IcCalendar />, v: day, k: `${ph === "settled" ? "drawn" : "draws"} at ${time}` },
  ];
  return (
    <section className="stats-band" aria-label="This draw in numbers">
      <ul className="page stats">
        {items.map((it) => (
          <li key={it.k} className="stat">
            <span className="stat-ic" aria-hidden="true">
              {it.ic}
            </span>
            <b className="stat-v tab">{it.v}</b> <span className="stat-k">{it.k}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const S = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function IcTicket() {
  return (
    <svg {...S}>
      <path d="M4 7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5a2.5 2.5 0 0 0 0-5Z" />
      <path d="M14.5 6v12" strokeDasharray="2 2.5" />
    </svg>
  );
}

function IcVault() {
  return (
    <svg {...S}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2" />
    </svg>
  );
}

function IcGift() {
  return (
    <svg {...S}>
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9Zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9Z" />
    </svg>
  );
}

function IcCalendar() {
  return (
    <svg {...S}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}
