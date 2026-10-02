"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { sunDots } from "@/lib/print";

/**
 * The reveal total, printed with two plates: a vermilion plate shifted (1.5, 1) under the ink,
 * over a halftone sun that rises behind it and is cut flat by the horizon (the figure's baseline).
 * The sun is drawn 1:1 on an integer 45° lattice (no moiré), with near-touching dots at the core
 * and a printed floor at the rim, clipped hard to its half disc and masked 8px clear of every glyph.
 *
 * Placement: centred under the rendered "0.08 SOL" text box, then clamped so the whole disc stays
 * inside the main column (it never bleeds into the gutter or off a phone's edge). "You won" sits in
 * its own strip above the sun's top edge, on clean paper: it is never cut out of the dots.
 */
export function MoneyTotal({ amount, unit = "SOL", lead = "You won", mobile }: { amount: string; unit?: string; lead?: string; mobile: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const size = mobile ? 96 : 196;
  const leadSize = mobile ? 20 : 26;
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const [m, setM] = useState<{ all: number; room: number } | null>(null);

  useLayoutEffect(() => {
    let alive = true;
    const measure = () => {
      if (!alive || !textRef.current || !boxRef.current) return;
      const box = boxRef.current.getBoundingClientRect();
      // the main column's right edge (the reveal's content box), else the viewport less a gutter
      const col = boxRef.current.closest(".rv-main") ?? boxRef.current.parentElement;
      const right = col ? col.getBoundingClientRect().right : window.innerWidth - 16;
      setM({ all: textRef.current.getBBox().width, room: Math.max(0, Math.floor(right - box.left)) });
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      window.removeEventListener("resize", measure);
    };
  }, [amount, size]);

  // geometry. The lead strip on top, then the half disc of radius R standing on the horizon
  // (the figure's baseline), so H = strip + R + 3.
  const strip = leadSize + (mobile ? 8 : 14);
  // 224px sun on phones, up to 360px on wider screens (the slot is 224px tall)
  const Rmax = mobile ? 112 : 180;
  const dx = size * 0.1; // unit spacing: "0.01 SOL" never reads as one word
  const textW = m ? Math.ceil(m.all) : Math.round(size * 0.42 * (amount.length + 2));
  const room = m && m.room > 0 ? m.room : Math.max(textW, 2 * Rmax);
  const R = Math.max(40, Math.min(Rmax, Math.floor(room / 2)));
  const dots = useMemo(() => sunDots(R * 2), [R]);
  const mid = Math.round(textW / 2);
  const cx = Math.min(Math.max(mid, R), room - R);
  const base = strip + R;
  const H = base + 3;
  const W = Math.ceil(Math.min(room, Math.max(textW + 6, cx + R)));

  const textProps = {
    x: 0,
    y: base,
    fontSize: size,
    fontWeight: 900,
    style: { fontStretch: "62%", fontVariantNumeric: "proportional-nums lining-nums", letterSpacing: "-.01em" } as React.CSSProperties,
  };
  const runs = () => (
    <>
      <tspan>{amount}</tspan>
      <tspan fontSize={size * 0.5} dx={dx}>
        {unit}
      </tspan>
    </>
  );

  return (
    <span ref={boxRef} className="money-box">
      <svg className="money" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${lead} ${amount} ${unit}`}>
        <defs>
          <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <rect width={W} height={H} fill="#fff" />
            <text {...textProps} fill="#000" stroke="#000" strokeWidth="16" strokeLinejoin="round">
              {runs()}
            </text>
          </mask>
          {/* hard edge: the half disc above the horizon */}
          <clipPath id={`${uid}-c`}>
            <path d={`M${cx - R} ${base}A${R} ${R} 0 0 1 ${cx + R} ${base}Z`} />
          </clipPath>
        </defs>
        <g className="sun" mask={`url(#${uid}-m)`} style={{ mixBlendMode: "multiply" }}>
          <g clipPath={`url(#${uid}-c)`}>
            <g transform={`translate(${cx - R} ${strip})`} fill="#DE3F2B">
              {dots.map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r} />
              ))}
            </g>
          </g>
        </g>
        {/* the horizon: 1px ink on the baseline, under the figure only */}
        <rect x="0" y={base} width={W} height="1" fill="#1B1814" />
        <text x="0" y={strip - (mobile ? 7 : 12)} fontSize={leadSize} fill="#4F473C" style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>
          {lead}
        </text>
        {/* red plate, a hair off register */}
        <text {...textProps} transform="translate(1.5 1)" fill="#DE3F2B" style={{ ...textProps.style, mixBlendMode: "multiply" }} aria-hidden="true">
          {runs()}
        </text>
        <text ref={textRef} {...textProps} fill="#1B1814">
          {runs()}
        </text>
      </svg>
    </span>
  );
}
