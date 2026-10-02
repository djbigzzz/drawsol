"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Glyph drum order. A tile flips forward through it from the old glyph to the new one. */
const DRUM = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.,:/-+#?·";
const MAX_STEPS = 10;
const STEP_MS = 120;

function path(from: string, to: string): string[] {
  const a = DRUM.indexOf(from);
  const b = DRUM.indexOf(to);
  if (a < 0 || b < 0) return [to];
  const steps: string[] = [];
  for (let i = (a + 1) % DRUM.length; ; i = (i + 1) % DRUM.length) {
    steps.push(DRUM[i]);
    if (i === b) break;
  }
  return steps.length > MAX_STEPS ? steps.slice(-MAX_STEPS) : steps;
}

function Tile({ ch, reduced, color }: { ch: string; reduced: boolean; color?: string }) {
  const [cur, setCur] = useState(ch);
  const [prev, setPrev] = useState(ch);
  const [k, setK] = useState(0);
  const curRef = useRef(ch);

  useEffect(() => {
    if (ch === curRef.current) return;
    if (reduced) {
      curRef.current = ch;
      setCur(ch);
      setPrev(ch);
      return;
    }
    const steps = path(curRef.current, ch);
    let i = 0;
    let settle: ReturnType<typeof setTimeout>;
    const t = setInterval(() => {
      const next = steps[i++];
      setPrev(curRef.current);
      curRef.current = next;
      setCur(next);
      setK((x) => x + 1);
      if (i >= steps.length) {
        clearInterval(t);
        settle = setTimeout(() => setPrev(next), STEP_MS);
      }
    }, STEP_MS);
    return () => {
      clearInterval(t);
      clearTimeout(settle);
      // jump to the target if interrupted
      curRef.current = ch;
      setCur(ch);
      setPrev(ch);
    };
  }, [ch, reduced]);

  const g = (c: string) => (c === " " ? " " : c);
  return (
    <span className="flap" style={color ? { color } : undefined}>
      <span className="flap-half top">
        <span>{g(cur)}</span>
      </span>
      <span className="flap-half bot">
        <span>{g(prev)}</span>
      </span>
      {k > 0 && prev !== cur && (
        <>
          <span key={`t${k}`} className="flap-half top leaf">
            <span>{g(prev)}</span>
          </span>
          <span key={`b${k}`} className="flap-half bot leaf">
            <span>{g(cur)}</span>
          </span>
        </>
      )}
    </span>
  );
}

export interface SplitFlapProps {
  /** Text to show. Characters in `separators` render as bare glyphs, not tiles. */
  value: string;
  /** font-size of the glyphs (tile height ≈ 1.16 × size) */
  size: number | string;
  font?: "display" | "mono";
  color?: string;
  /** characters rendered without a tile */
  separators?: string;
  label: string;
  className?: string;
  tileWidth?: string;
  gap?: number;
}

/**
 * Split-flap board. Each character sits in its own tile with a centre seam; when
 * the value changes, changed tiles flip through the drum to the new glyph.
 * Static on first render and under prefers-reduced-motion.
 */
export function SplitFlap({
  value,
  size,
  font = "display",
  color,
  separators = "",
  label,
  className = "",
  tileWidth,
  gap,
}: SplitFlapProps) {
  const reduced = useReducedMotion();
  const chars = value.toUpperCase().split("");
  const style: CSSProperties & Record<string, string | number> = {
    fontSize: typeof size === "number" ? `${size}px` : size,
    fontFamily: font === "display" ? '"Big Shoulders Display", Impact, sans-serif' : '"IBM Plex Mono", monospace',
    fontWeight: font === "display" ? 800 : 500,
    "--flip-ms": `${STEP_MS / 2}ms`,
  };
  if (tileWidth) style["--flap-w"] = tileWidth;
  else if (font === "mono") style["--flap-w"] = "0.86em";
  if (gap !== undefined) style["--flap-gap"] = `${gap}px`;
  return (
    <span className={`flaps ${className}`} style={style} role="img" aria-label={label}>
      {chars.map((c, i) =>
        separators.includes(c) ? (
          <span key={i} className="flap sep" aria-hidden style={color ? { color } : undefined}>
            {c}
          </span>
        ) : (
          <Tile key={i} ch={c} reduced={reduced} color={color} />
        )
      )}
    </span>
  );
}

/** Empty tiles for loading states — no numbers. */
export function FlapSkeleton({ count, size, tileWidth }: { count: number; size: number; tileWidth?: string }) {
  const style: Record<string, string> = { fontSize: `${size}px` };
  if (tileWidth) style["--flap-w"] = tileWidth;
  return (
    <span className="flaps skeleton" style={style} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="flap" />
      ))}
    </span>
  );
}
