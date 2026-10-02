/** UI-only formatting helpers (rounding for display; lib/format.ts truncates). */
import { localLabel, sol } from "@/lib/format";

const LAMPORTS = BigInt(1_000_000_000);

/** lamports → SOL rounded half-up to `dp` decimals, e.g. 2_276_160 → "0.0023" (dp 4). */
export function solRound(l: bigint, dp: number, min = 0): string {
  const unit = BigInt(10) ** BigInt(9 - dp);
  const r = ((l + unit / BigInt(2)) / unit) * unit;
  return sol(r, min, dp);
}

/** "2 d 5 h 31 min" style split, kept as numbers. */
export function durationParts(secs: number) {
  const s = Math.max(0, Math.floor(secs));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** "Sun 4 Oct, 06:13" in the viewer's zone, or null when the viewer is on UTC. */
export function localComma(unix: number): string | null {
  if (typeof window === "undefined") return null;
  if (new Date(unix * 1000).getTimezoneOffset() === 0) return null;
  return localLabel(unix).replace(/^(\w+ \d+ \w+) /, "$1, ");
}

/** "20 SEP", or with the weekday "THU 1 OCT" (UTC) */
export function stampDay(unix: number, weekday = false) {
  const d = new Date(unix * 1000);
  const MO = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return `${weekday ? `${WD[d.getUTCDay()]} ` : ""}${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

/** "20 September" */
export function longDay(unix: number) {
  const d = new Date(unix * 1000);
  const MO = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

/** Ranges of consecutive ticket numbers: [31..40, 59, 97..101] */
export function ranges(nums: number[]): [number, number][] {
  const s = Array.from(new Set(nums)).sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const n of s) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

/** "a, b and c" */
export function andList(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Thin-space grouped digits: 1 234 567 */
export function groupDigits(s: string) {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
