/**
 * Print kit geometry (DESIGN.md §4), ported 1:1 from app/src/design-assets/generate.mjs.
 * UI only: nothing here touches chain code or decides a result.
 */
import { sha256 } from "@noble/hashes/sha256";
import { u32le } from "./fairness";

const enc = new TextEncoder();

/* ------------------------------------------------------------------ *
 * Stamp print parameters from seed bytes (>= 7 bytes). Every stamp
 * instance gets its own speckle, edge wobble, pressure and angle.
 * ------------------------------------------------------------------ */
export interface StampPrint {
  seed: number;
  wobbleSeed: number;
  threshold: number;
  wobble: number;
  pressure: number;
  angle: number;
}

export function stampPrint(b: ArrayLike<number>, baseAngle: number): StampPrint {
  const at = (i: number) => b[i % Math.max(1, b.length)] ?? 0;
  return {
    seed: 1 + (((at(0) << 8) | at(1)) % 997),
    wobbleSeed: 1 + (at(2) % 97),
    threshold: +(4.0 + (at(3) / 255) * 0.5).toFixed(2),
    wobble: +(1.2 + (at(4) / 255) * 0.8).toFixed(2),
    pressure: +(0.82 + (at(5) / 255) * 0.16).toFixed(2),
    angle: +(baseAngle + ((at(6) / 255) * 6 - 3)).toFixed(1),
  };
}

/** Seed bytes for a WON stamp: bytes 8..15 of sha256(randomness || "ticket" || ticket_le_u32). */
export function ticketInk(randomness: Uint8Array, ticket: number): Uint8Array {
  const tag = enc.encode("ticket");
  const buf = new Uint8Array(randomness.length + tag.length + 4);
  buf.set(randomness, 0);
  buf.set(tag, randomness.length);
  buf.set(u32le(ticket), randomness.length + tag.length);
  return sha256(buf).slice(8, 16);
}

/** A window of `bytes` starting at `offset` (wraps), so two stamps from one source never share a print. */
export function inkAt(bytes: Uint8Array, offset: number): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) out[i] = bytes.length ? bytes[(offset + i) % bytes.length] : 0;
  return out;
}

/* ------------------------------------------------------------------ *
 * Halftone sun. Integer 45° lattice: dot centres sit on (4k+2, 4m+2) with
 * k+m even, so every dot rasterises identically at 1x and 2x (no moiré).
 * Centre on the bottom edge (the horizon). Render at 1:1 only.
 * Density is nearly flat and only softens in the outer rim, so the part
 * that shows above the figures (d ≈ .75–1) prints as a solid red object:
 * r = min(2.7, 1.7 + 1.05 × (1 − d⁸)) → 2.57 at d .8, 2.3 at .9, 1.7 at the rim.
 * ------------------------------------------------------------------ */
export function sunDots(width: number, { pitch = 4, rMax = 2.7, rRim = 1.7, swell = 1.05 } = {}): [number, number, number][] {
  const R = width / 2;
  const cx = width / 2;
  const cy = R;
  const dots: [number, number, number][] = [];
  for (let m = 0; m * pitch <= R; m++) {
    for (let k = 0; k * pitch <= width; k++) {
      if ((k + m) % 2) continue;
      const x = k * pitch + pitch / 2;
      const y = m * pitch + pitch / 2;
      if (y > cy) continue;
      const d = Math.hypot(x - cx, y - cy) / R;
      if (d > 1) continue;
      const r = Math.min(rMax, rRim + swell * (1 - d ** 8));
      dots.push([x, y, Math.round(r * 100) / 100]);
    }
  }
  return dots;
}

/* ------------------------------------------------------------------ *
 * Barcode sales meter. One bar per ticket number (or per 25 above 400 slots).
 * ------------------------------------------------------------------ */
export type BarFill = "ink" | "blue" | "red" | "hair";
export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: BarFill;
}

export interface BarcodeLayout {
  w: number;
  h: number;
  pitch: number;
  /** tickets per bar (1, or 25 for very large draws) */
  group: number;
  /** x of the bar for unit i (integer) */
  xAt: (i: number) => number;
  rects: BarRect[];
}

export function barcodeMarks({
  slots,
  taken,
  free = [],
  mine = [],
  drawn = -1,
  width,
  h = 40,
  rise = 8,
  spread = false,
}: {
  slots: number;
  taken: number;
  free?: number[];
  mine?: number[];
  drawn?: number;
  width: number;
  h?: number;
  rise?: number;
  /** distribute the leftover width as 1px extra gaps (integer x), so the meter ends at the body edge */
  spread?: boolean;
}): BarcodeLayout {
  // one bar per ticket; above 400 slots one bar = 25 tickets; on very narrow screens, the fewest tickets per bar that fit
  const group = slots > 400 ? 25 : slots * 2 - 1 > width ? Math.ceil((slots * 2) / Math.max(1, width)) : 1;
  const units = Math.ceil(slots / group);
  const pitch = units * 3 <= width ? 3 : 2;
  const bar = pitch - 1;
  const natural = units * pitch - 1;
  const span = spread ? Math.max(natural, Math.floor(width)) : natural;
  const xAt = (i: number) => (spread && units > 1 ? Math.floor((i * (span - bar)) / (units - 1)) : i * pitch);
  const H = h + rise;
  const F = new Set(free);
  const M = new Set(mine);
  const rects: BarRect[] = [];
  const unitTaken = Math.ceil(taken / group);
  for (let i = 0; i < units; i++) {
    const x = xAt(i);
    const lo = i * group;
    const hi = Math.min(slots, lo + group);
    if (lo >= taken) {
      const uh = Math.round(h * 0.38);
      rects.push({ x, y: H - uh, w: 1, h: uh, fill: "hair" });
      continue;
    }
    let isMine = false;
    let isFree = group === 1 && F.has(lo);
    for (let t = lo; t < hi && !isMine; t++) if (M.has(t)) isMine = true;
    const isDrawn = drawn >= lo && drawn < hi;
    if (isDrawn) isFree = false;
    const up = isDrawn || isMine;
    const top = up ? 0 : rise;
    const fill: BarFill = isDrawn ? "red" : isMine ? "blue" : "ink";
    if (isFree) {
      const len = H - top;
      const gap = 6;
      const a = Math.round((len - gap) / 2);
      rects.push({ x, y: top, w: bar, h: a, fill });
      rects.push({ x, y: top + a + gap, w: bar, h: len - a - gap, fill });
    } else rects.push({ x, y: top, w: bar, h: H - top, fill });
  }
  if (unitTaken < units) {
    const x0 = xAt(unitTaken);
    rects.push({ x: x0, y: H - 1, w: span - x0, h: 1, fill: "hair" });
  }
  return { w: span, h: H, pitch, group, xAt, rects };
}

/* ------------------------------------------------------------------ *
 * Receipt bars, proportional within the receipt: the largest win on this
 * receipt is `max` px tall and every other win scales to it, never under
 * `min` px, so a 0.01 next to a 0.05 is still a visible bar. A ticket that
 * won nothing is a short `tick` hanging BELOW the baseline (quiet), and so
 * is a ticket not revealed yet (`sealed`, lighter). The plot height is
 * fixed at `max`, so every receipt has the same shape and nothing moves
 * while the bars grow.
 * ------------------------------------------------------------------ */
export interface ReceiptBar {
  x: number;
  cx: number;
  y: number;
  w: number;
  h: number;
  win: boolean;
  sealed: boolean;
}

export function receiptBars(wins: number[], { pitch = 28, bar = 6, max = 48, min = 12, tick = 3, shown = wins.length } = {}) {
  const top = Math.max(0, ...wins);
  const hOf = (sol: number) => Math.max(min, Math.round((sol / top) * max));
  const base = max; // y of the 1px baseline; bars stand on it, ticks hang under it
  const bars: ReceiptBar[] = wins.map((sol, i) => {
    const x = i * pitch + (pitch - bar) / 2;
    const cx = i * pitch + pitch / 2;
    if (i < shown && sol > 0) {
      const hh = hOf(sol);
      return { x, cx, y: base - hh, w: bar, h: hh, win: true, sealed: false };
    }
    return { x: Math.round(cx - 0.5), cx, y: base + 1, w: 1, h: tick, win: false, sealed: i >= shown };
  });
  return { w: wins.length * pitch, h: base + 1 + tick, base, bars };
}
