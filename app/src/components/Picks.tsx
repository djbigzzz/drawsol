"use client";

import { useState } from "react";
import { useBuy } from "./BuyContext";
import { plural } from "./fmt";

export const PICKS = [1, 5, 10, 25];

/**
 * A ballpoint loop around the chosen quick pick: open, overshooting and crossing itself at the
 * top right, heavier where the pen pressed (1.5 → 2.2px), and turned a few degrees per pick so it
 * never reads as a border. Draws on only when you choose (not on load).
 */
export function PenLoop({ pick, inked }: { pick: number; inked: boolean }) {
  const turn = ((pick * 37) % 17) - 8; // −8…+8°, fixed per pick
  return (
    <svg className={`pen ${inked ? "anim" : ""}`} style={{ transform: `rotate(${turn}deg)` }} viewBox="0 0 60 40" preserveAspectRatio="none" aria-hidden="true">
      <path className="p1" d="M50 11C40 3 14 4 6 15C0 25 12 37 30 37C47 37 58 29 56 18C55 11 49 5 38 3" vectorEffect="non-scaling-stroke" />
      <path className="p2" d="M6 15C0 25 12 37 30 37C47 37 58 29 56 18" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * The quick picks, 1 · 5 · 10 · Max (N), for the confirm sheet below 1024px: the stub has its own row on
 * desktop, and the sticky bar has room only for the stepper, so phones get "Max" here (research P0-7).
 */
export function SheetPicks() {
  const { qty, setQty, maxQ } = useBuy();
  const [inked, setInked] = useState(false);
  if (maxQ <= 1) return null;
  const picks = PICKS.filter((p) => p < maxQ);
  const choose = (n: number) => {
    setInked(true);
    setQty(n);
  };
  return (
    <ul className="picks sheet-picks" aria-label="Quick picks">
      {picks.map((p) => (
        <li key={p}>
          <button type="button" aria-pressed={qty === p} onClick={() => choose(p)}>
            {p}
            {qty === p && <PenLoop key={`pen-${qty}`} pick={p} inked={inked} />}
          </button>
        </li>
      ))}
      <li>
        <button type="button" className="max" aria-pressed={qty === maxQ} onClick={() => choose(maxQ)} aria-label={`Max, ${maxQ} ${plural(maxQ, "ticket", "tickets")}`}>
          Max ({maxQ})
          {qty === maxQ && <PenLoop key={`pen-max-${qty}`} pick={maxQ + 3} inked={inked} />}
        </button>
      </li>
    </ul>
  );
}
