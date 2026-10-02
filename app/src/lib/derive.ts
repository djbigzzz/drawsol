import { CANCEL_GRACE_SECS } from "./config";
import { sol } from "./format";
import type { DrawView, EntryView, PlayerView } from "./types";

export type Phase = "selling" | "due" | "drawing" | "settled" | "cancelled";

/** What the board should show, from status + clock (the program enforces the same rules). */
export function phaseOf(d: DrawView, now: number): Phase {
  if (d.status === "settled") return "settled";
  if (d.status === "cancelled") return "cancelled";
  if (d.status === "drawing") return "drawing";
  return now >= d.closesAt || d.paidTickets >= d.ticketCap ? "due" : "selling";
}

export const remaining = (d: DrawView) => Math.max(0, d.ticketCap - d.paidTickets);

/** Sum of instant-win odds over the denominator, e.g. 200/1000. */
export const instantNumer = (d: DrawView) => d.iwTiers.reduce((n, t) => n + t.odds, 0);

export const activeTiers = (d: DrawView) =>
  d.iwTiers.map((t, i) => ({ ...t, index: i })).filter((t) => t.odds > 0 && t.amount > BigInt(0));

/** Upper bound on tickets in the grand draw: every paid ticket + every free one. */
export const maxEntries = (d: DrawView) => d.ticketCap + d.freeCap;

export function walletAllowance(d: DrawView, player: PlayerView | null) {
  const held = player?.tickets ?? 0;
  const wallet = Math.max(0, d.maxPerWallet - held);
  return {
    held,
    wallet,
    max: Math.max(0, Math.min(d.maxPerTx, remaining(d), wallet)),
  };
}

export const canCancel = (d: DrawView, now: number) =>
  d.status === "drawing" && now > d.closesAt + CANCEL_GRACE_SECS;

export function tierAmount(d: { iwTiers: { amount: bigint }[] } | { tierAmounts: bigint[] }, tier: number): bigint {
  if (tier <= 0) return BigInt(0);
  const amts = "tierAmounts" in d ? d.tierAmounts : d.iwTiers.map((t) => t.amount);
  return amts[tier - 1] ?? BigInt(0);
}

export function entryWins(e: EntryView) {
  return e.tiers.filter((t) => t > 0).length;
}

/** "1.00" for small prizes, "100" for whole large ones. */
export function prizeText(l: bigint) {
  const s = sol(l, 2, 2);
  const [w, f] = s.split(".");
  return w.length >= 3 && f === "00" ? w : s;
}

export const isDefaultKey = (k: { toBase58(): string }) => k.toBase58() === "11111111111111111111111111111111";
