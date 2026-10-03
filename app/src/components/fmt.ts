/** UI-only formatting helpers (rounding for display; lib/format.ts truncates). */
import { localLabel, sol } from "@/lib/format";

const LAMPORTS = 1_000_000_000;

/** lamports → SOL rounded half-up to `dp` decimals, e.g. 2_276_160 → "0.0023" (dp 4). */
export function solRound(l: bigint, dp: number, min = 0): string {
  const unit = BigInt(10) ** BigInt(9 - dp);
  const r = ((l + unit / BigInt(2)) / unit) * unit;
  return sol(r, min, dp);
}

/**
 * lamports at a live SOL price → "$5.00" / "$0.99" / "$1,250". null when there is no price: the caller then
 * shows SOL only. Whole dollars from $100 up drop the cents.
 */
export function usd(l: bigint, price: number | null): string | null {
  if (price === null) return null;
  const v = (Number(l) / LAMPORTS) * price;
  if (!Number.isFinite(v)) return null;
  if (v >= 100) return `$${Math.round(v).toLocaleString("en-US")}`;
  return `$${v.toFixed(2)}`;
}

/** "2 d 5 h 31 min" style split, kept as numbers. */
export function durationParts(secs: number) {
  const s = Math.max(0, Math.floor(secs));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** "2d 14h left", "3h 05m left", "4m 12s left" */
export function leftText(secs: number) {
  const t = durationParts(secs);
  if (t.d > 0) return `${t.d}d ${t.h}h left`;
  if (t.h > 0) return `${t.h}h ${String(t.m).padStart(2, "0")}m left`;
  return `${t.m}m ${String(t.s).padStart(2, "0")}s left`;
}

/** "Sun 4 Oct, 06:13" in the viewer's zone, or null when the viewer is on UTC. */
export function localComma(unix: number): string | null {
  if (typeof window === "undefined") return null;
  if (new Date(unix * 1000).getTimezoneOffset() === 0) return null;
  return localLabel(unix).replace(/^(\w+ \d+ \w+) /, "$1, ");
}

/** "Sun 11 Oct, 20:00 UTC" without the year; the date part alone with `dateOnly` */
export function longDay(unix: number) {
  const d = new Date(unix * 1000);
  const MO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Thin-space grouped digits: 1 234 567 */
export function groupDigits(s: string) {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** 1250 → "1,250" */
export const n = (x: number) => x.toLocaleString("en-US");

export const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);

/** "22:37" in UTC, for "read at" marks */
export function utcHhmm(unix: number) {
  const d = new Date(unix * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "pot draw", "headline draw"; a legacy v2 draw was a "grand draw" */
export const kindName = (k: "pot" | "headline" | "v2") => (k === "pot" ? "pot draw" : k === "headline" ? "headline draw" : "grand draw");
/** "Draw № 6" */
export const drawName = (d: { id: number }) => `Draw № ${d.id}`;

/** "1 SOL" figures stay whole; a pot shows two decimals ("0.68"), never a misleading round number. */
export const prizeFig = (l: bigint) => sol(l, 0, l < BigInt(1_000_000_000) ? 4 : 2);
