"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { receiptBars } from "@/lib/print";

/**
 * Tear-off receipt: one bar per ticket, proportional within this receipt (its largest win is 48px,
 * any win at least 12px), so the winners are the loud marks. A ticket that won nothing is a 3px ink-3
 * tick hanging under the baseline; a ticket still sealed is the same tick, lighter. Bars grow as their
 * tickets are revealed. Amounts above winners, ticket numbers below.
 *
 * The slip has a fixed width (300px beside the actions, the full column on phones); the pitch spreads
 * the tickets across it, up to 48px each.
 */
export function ReceiptBars({ wins, shown, first, label }: { wins: number[]; shown: number; first: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inner, setInner] = useState(268);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setInner(Math.max(80, Math.floor(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = Math.max(1, wins.length);
  const pitch = Math.max(6, Math.min(48, Math.floor(inner / n)));
  const AMT = 18; // room for the amount over the tallest bar
  const R = receiptBars(wins, { pitch, bar: pitch >= 17 ? 6 : 4, shown });
  const H = R.h;
  const showNums = (i: number) => (pitch >= 24 ? true : i === 0 || i === n - 1 || (pitch >= 14 && i % 2 === 0));
  return (
    <div ref={ref} className="rbars" style={{ height: AMT + H + 20 }}>
      <svg width={R.w} height={H} viewBox={`0 0 ${R.w} ${H}`} shapeRendering="crispEdges" role="img" aria-label={label} style={{ position: "absolute", left: 0, top: AMT }}>
        {R.bars.map((b, i) => (
          <rect key={i} className={b.win ? "rb win" : "rb"} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.win ? "#DE3F2B" : b.sealed ? "rgba(27,24,20,.32)" : "#625949"} />
        ))}
        <rect x="0" y={R.base} width={R.w} height="1" fill="#1B1814" />
      </svg>
      {R.bars.map((b, i) =>
        b.win ? (
          <span key={`a${i}`} className="amt t-key appear" style={{ left: b.cx, top: AMT + b.y - 17 }} aria-hidden="true">
            {wins[i].toFixed(2)}
          </span>
        ) : null
      )}
      {R.bars.map((b, i) =>
        showNums(i) ? (
          <span key={`n${i}`} className="tn t-key" style={{ left: b.cx, top: AMT + H + 3 }} aria-hidden="true">
            {first + i}
          </span>
        ) : null
      )}
    </div>
  );
}
