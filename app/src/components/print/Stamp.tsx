"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { stampPrint } from "@/lib/print";

export type StampKind = "locked" | "closed" | "drawn" | "paid" | "won" | "cancelled" | "refunded";

const BASE_ANGLE: Record<StampKind, number> = {
  locked: -8,
  closed: 6,
  drawn: 7,
  paid: -14,
  won: -12,
  cancelled: -6,
  refunded: -5,
};

const VIEW: Record<StampKind, [number, number]> = {
  locked: [240, 132],
  closed: [240, 132],
  drawn: [220, 112],
  paid: [120, 120],
  won: [80, 80],
  cancelled: [240, 132],
  refunded: [150, 52],
};

/**
 * A rubber stamp. One component, inline SVG from app/src/design-assets/stamp-*.svg.
 * Every instance prints its own ink: its filter id is unique and its speckle, edge wobble,
 * pressure and angle come from real on-chain bytes (`seed`) via stampPrint().
 */
export function Stamp({
  kind,
  seed,
  label,
  top,
  mid,
  bottom,
  baseAngle,
  className = "",
  style,
  padded = false,
}: {
  kind: StampKind;
  /** >= 7 bytes of real data (see DESIGN.md §4.3) */
  seed: Uint8Array;
  /** accessible name: "Stamped: prize locked in the vault" */
  label: string;
  top?: string;
  mid?: string;
  bottom?: string;
  baseAngle?: number;
  className?: string;
  style?: CSSProperties;
  /**
   * Draw inside a viewBox with a 5% ink margin and clip to it, so the print (its wobble and arc
   * legend) can never paint outside the stamp's own box. Used where the stamp sits in a tight cell.
   */
  padded?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const p = stampPrint(seed, baseAngle ?? BASE_ANGLE[kind]);
  const fid = `ink-${uid}`;
  const small = kind === "won" || kind === "refunded";
  const [w, h] = VIEW[kind];
  const pad = padded ? Math.round(w * 0.05) : 0;
  const R = "#DE3F2B";

  // The speckle is defined per rendered pixel, not per viewBox unit: a 48px stamp gets the same
  // grain size as a 200px one instead of a sub-pixel pink haze. Small prints are inked harder and
  // lose fewer specks, so the legend keeps at least ~85% of its strokes.
  const ref = useRef<HTMLSpanElement>(null);
  const [px, setPx] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setPx(Math.round(el.offsetWidth) || null);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = px ? px / (w + 2 * pad) : small ? 0.9 : 0.83;
  const freq = +Math.min(small ? 1.1 : 0.85, Math.max(0.3, scale * 1.0)).toFixed(3);
  const lift = px === null ? 0 : px <= 64 ? 0.5 : px <= 128 ? 0.25 : 0;
  const threshold = +(p.threshold + lift).toFixed(2);
  const pressure = px === null ? p.pressure : px <= 64 ? Math.max(p.pressure, 0.96) : px <= 128 ? Math.max(p.pressure, 0.93) : p.pressure;

  let body: JSX.Element;
  switch (kind) {
    case "locked":
      body = (
        <>
          <rect x="5" y="5" width="230" height="122" rx="14" strokeWidth="7" />
          <rect x="15" y="15" width="210" height="102" rx="7" strokeWidth="2" />
          <g fill={R} stroke="none" textAnchor="middle">
            <text x="120" y="40" fontSize="11.5" fontWeight="800" style={{ fontStretch: "118%", letterSpacing: "2.6px" }}>{top}</text>
            <text x="120" y="87" fontSize="45" fontWeight="900" style={{ fontStretch: "84%", letterSpacing: "2.5px" }}>{mid ?? "LOCKED"}</text>
            <text x="120" y="106" fontSize="11" fontWeight="800" style={{ fontStretch: "118%", letterSpacing: "2.6px" }}>{bottom ?? "IN THE VAULT"}</text>
          </g>
        </>
      );
      break;
    case "closed":
      body = (
        <>
          <rect x="5" y="5" width="230" height="122" rx="4" strokeWidth="6" />
          <path d="M16 50h208M16 98h208" strokeWidth="1.6" />
          <g fill={R} stroke="none" textAnchor="middle">
            <text x="120" y="38" fontSize="12" fontWeight="800" style={{ fontStretch: "118%", letterSpacing: "2.6px" }}>{top}</text>
            <text x="120" y="91" fontSize="42" fontWeight="900" style={{ fontStretch: "84%", letterSpacing: "3px" }}>{mid ?? "CLOSED"}</text>
            <text x="120" y="117" fontSize="11" fontWeight="800" style={{ fontStretch: "112%", letterSpacing: "2.2px" }}>{bottom}</text>
          </g>
        </>
      );
      break;
    case "drawn":
      body = (
        <>
          <rect x="5" y="5" width="210" height="102" rx="6" strokeWidth="5" />
          <path d="M14 66h192M14 38h192" strokeWidth="1.6" />
          <g fill={R} stroke="none" textAnchor="middle">
            <text x="110" y="32" fontSize="22" fontWeight="900" style={{ fontStretch: "125%", letterSpacing: "6px" }}>DRAWN</text>
            <text x="110" y="60" fontSize="22" fontWeight="800" style={{ fontStretch: "100%", letterSpacing: "4px" }}>{mid}</text>
            <text x="110" y="92" fontSize="13" fontWeight="800" style={{ fontStretch: "125%", letterSpacing: "3px" }}>{bottom}</text>
          </g>
        </>
      );
      break;
    case "paid":
      body = (
        <>
          <defs>
            <path id={`${uid}-at`} d="M 22 60 A 38 38 0 0 1 98 60" />
            <path id={`${uid}-ab`} d="M 12 60 A 48 48 0 0 0 108 60" />
          </defs>
          <circle cx="60" cy="60" r="55" strokeWidth="5" />
          <circle cx="60" cy="60" r="27" strokeWidth="1.5" />
          <g fill={R} stroke="none" fontWeight="800" fontSize="11.5" letterSpacing="2.4" style={{ fontStretch: "125%" }}>
            <text>
              <textPath href={`#${uid}-at`} startOffset="50%" textAnchor="middle">
                {top}
              </textPath>
            </text>
            <text>
              <textPath href={`#${uid}-ab`} startOffset="50%" textAnchor="middle">
                {bottom}
              </textPath>
            </text>
          </g>
          <text x="60" y="66" textAnchor="middle" fill={R} stroke="none" fontSize="17" fontWeight="900" style={{ fontStretch: "90%" }}>
            PAID
          </text>
        </>
      );
      break;
    case "won":
      body = (
        <>
          <circle cx="40" cy="40" r="35" strokeWidth="4.5" />
          <circle cx="40" cy="40" r="28" strokeWidth="1.4" />
          <text x="40" y="47.5" textAnchor="middle" fill={R} stroke="none" fontSize="20" fontWeight="900" style={{ fontStretch: "92%", letterSpacing: "1px" }}>
            WON
          </text>
        </>
      );
      break;
    case "cancelled":
      body = (
        <>
          <rect x="5" y="5" width="230" height="122" rx="10" strokeWidth="6" />
          <path d="M16 50h208M16 96h208" strokeWidth="1.6" />
          <g fill={R} stroke="none" textAnchor="middle">
            <text x="120" y="38" fontSize="12" fontWeight="800" style={{ fontStretch: "118%", letterSpacing: "2.6px" }}>{top}</text>
            <text x="120" y="87" fontSize="34" fontWeight="900" style={{ fontStretch: "84%", letterSpacing: "2.5px" }}>CANCELLED</text>
            <text x="120" y="116" fontSize="11" fontWeight="800" style={{ fontStretch: "118%", letterSpacing: "2.6px" }}>{bottom ?? "REFUNDS OPEN"}</text>
          </g>
        </>
      );
      break;
    case "refunded":
      body = (
        <>
          <rect x="3" y="3" width="144" height="46" rx="6" strokeWidth="4" />
          <rect x="9" y="9" width="132" height="34" rx="3" strokeWidth="1.2" />
          <text x="75" y="34" textAnchor="middle" fill={R} stroke="none" fontSize="19" fontWeight="900" style={{ fontStretch: "96%", letterSpacing: "2.4px" }}>
            REFUNDED
          </text>
        </>
      );
      break;
  }

  return (
    <span ref={ref} className={`stamp ${kind} ${className}`} style={{ ...style, ["--a" as string]: `${p.angle}deg` }} role="img" aria-label={label}>
      <svg
        viewBox={`${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`}
        aria-hidden="true"
        focusable="false"
        style={padded ? { overflow: "hidden" } : undefined}
      >
        <defs>
          <filter id={fid} x="-8%" y="-12%" width="116%" height="124%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={p.seed} result="n" />
            <feColorMatrix
              in="n"
              type="matrix"
              values={small ? `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -5 ${(threshold - 0.5).toFixed(2)}` : `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 ${threshold}`}
              result="speck"
            />
            <feComposite in="SourceGraphic" in2="speck" operator="in" result="s" />
            <feTurbulence type="fractalNoise" baseFrequency={small ? 0.05 : 0.035} numOctaves={small ? 1 : 2} seed={p.wobbleSeed} result="w" />
            <feDisplacementMap in="s" in2="w" scale={small ? +(p.wobble * 0.75).toFixed(2) : p.wobble} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g filter={`url(#${fid})`} fill="none" stroke={R} opacity={pressure}>
          {body}
        </g>
      </svg>
    </span>
  );
}
