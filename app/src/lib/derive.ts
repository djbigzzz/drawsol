import { CANCEL_GRACE_SECS, PERIOD_SECS } from "./config";
import { sol } from "./format";
import type { DrawView, EntryView, PlayerView, ProfileView } from "./types";

const ZERO = BigInt(0);
const BPS = BigInt(10_000);

/**
 * selling: tickets on sale. closed: sales are over (deadline or sell-out) and the draw waits for draw_at.
 * due: draw_at has passed and the draw can be requested (by the keeper or authority until the public grace
 * window ends, then by anyone). The program enforces the same rules (SPEC-v4 §3).
 */
export type Phase = "selling" | "closed" | "due" | "drawing" | "settled" | "cancelled";

/** Every ticket takes a number, so sell-out is next_pos == cap (SPEC-v4 §6). */
export const soldOut = (d: DrawView) => d.nextPos >= d.ticketCap;

export function phaseOf(d: DrawView, now: number): Phase {
  if (d.status === "settled") return "settled";
  if (d.status === "cancelled") return "cancelled";
  if (d.status === "drawing") return "drawing";
  if (now < d.closesAt && !soldOut(d)) return "selling";
  return now >= d.drawAt ? "due" : "closed";
}

/** Ticket numbers still unsold (paid and free tickets both take one). */
export const remaining = (d: DrawView) => Math.max(0, d.ticketCap - d.nextPos);

/** From this time anyone may request the draw; before it only the keeper or the operator may. */
export const publicFrom = (d: DrawView) => d.drawAt + d.publicGraceSecs;
export const anyoneCanRun = (d: DrawView, now: number) => now >= publicFrom(d);

/** request_draw cancels instead: nothing sold (or a legacy v3 headline draw below its minimum). */
export const cancelsAtRequest = (d: DrawView) => d.nextPos === 0 || (d.legacy === "headline" && d.paidTickets < d.minTickets);

export const canCancel = (d: DrawView, now: number) => d.status === "drawing" && now > d.drawAt + CANCEL_GRACE_SECS;

/** Draws that roll every ticket through ORAO at reveal: every v4 draw (the roll assigns the numbers) and legacy pot draws. */
export const drawRolls = (d: DrawView) => d.legacy !== "headline";

/** Why a cancelled draw was cancelled, from what the account holds. */
export function cancelReason(d: DrawView): "no-tickets" | "undersold" | "timeout" {
  if (d.nextPos === 0) return "no-tickets";
  if (d.legacy === "headline" && d.paidTickets < d.minTickets && isDefaultKey(d.drawVrfRequest)) return "undersold";
  return "timeout";
}

/** The escrowed end prize is paid once min_tickets paid tickets have sold; below that the end prize is pot_bps of sales. */
export const endPrizeLocked = (d: DrawView) => d.paidTickets >= d.minTickets;

/** The fallback pot a draw would pay right now if it stayed below its minimum: pot_bps of ticket sales. */
export const salesPot = (d: DrawView) => (d.revenueLamports * BigInt(d.potBps)) / BPS;

/** What the end prize is right now: what was paid once settled; the escrow once locked; else the pot of sales so far. */
export function endPrize(d: DrawView): bigint {
  if (d.status === "settled" && d.endPrizePaid > ZERO) return d.endPrizePaid;
  if (!d.guaranteed) return d.endPrizeLamports;
  return endPrizeLocked(d) ? d.endPrizeLamports : salesPot(d);
}

/** The end prize as the page headlines it (same as endPrize; kept for the older name). */
export const grandPrize = endPrize;

/** The ticket numbers an entry holds: the ones ORAO assigned at reveal (empty until then); legacy: its sequential range. */
export const ticketNumbersOf = (e: EntryView): number[] => e.tickets;

/** Does this entry hold the winning position of a settled draw? (positions, so it works before and after reveal) */
export const holdsWinner = (d: DrawView, e: EntryView) => d.status === "settled" && e.firstPos <= d.winningPos && d.winningPos < e.firstPos + e.count;

/** The entry that holds a position, if it is in the list. */
export const entryAtPosition = (entries: EntryView[], pos: number) => entries.find((e) => e.firstPos <= pos && pos < e.firstPos + e.count) ?? null;

/** The schedule tier a ticket number is in, if any. */
export function tierOfNumber(d: DrawView, ticket: number): { index: number; lamports: bigint } | null {
  for (let i = 0; i < d.schedule.length; i++) if (d.schedule[i].numbers.includes(ticket)) return { index: i, lamports: d.schedule[i].lamports };
  return null;
}

export interface NumberWin {
  ticket: number;
  lamports: bigint;
  tier: number;
}

/** A revealed entry's instant wins, from its on-chain prizes (tier + 1 per ticket) against the draw's tiers. */
export function scheduleWinsOf(e: EntryView, d: DrawView): NumberWin[] {
  if (!e.revealed) return [];
  const out: NumberWin[] = [];
  e.prizes.forEach((k, i) => {
    if (k <= 0) return;
    const t = d.tiers[k - 1];
    if (!t) return;
    out.push({ ticket: e.tickets[i], lamports: t.amount, tier: k - 1 });
  });
  return out;
}

/**
 * Every winning number of the schedule that has been handed out: the wallet's entry when it is in the list,
 * else null (the Schedule account's won bit says it is gone, the entry wasn't read).
 */
export function wonNumbers(d: DrawView, entries: EntryView[]): Map<number, EntryView | null> {
  const m = new Map<number, EntryView | null>();
  if (!d.schedule.length) return m;
  for (const t of d.schedule) for (const n of t.won) m.set(n, null);
  for (const e of entries) for (const w of scheduleWinsOf(e, d)) m.set(w.ticket, e);
  return m;
}

/** The instant prizes of the schedule: how many, their total, and how many (and how much) have been won. */
export function scheduleTotals(d: DrawView) {
  let count = 0;
  let total = ZERO;
  let wonCount = 0;
  let wonTotal = ZERO;
  for (const t of d.schedule) {
    count += t.numbers.length;
    total += t.lamports * BigInt(t.numbers.length);
    wonCount += t.won.length;
    wonTotal += t.lamports * BigInt(t.won.length);
  }
  return { count, total, wonCount, wonTotal };
}

/** "55% house · 35% pot · 10% instant wins" from the draw's own bps. */
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

/** Legacy headline draws: the house share at a given number of paid tickets, 1 − prize / revenue. null with no revenue. */
export function headlineHouseBps(d: DrawView, tickets: number): number | null {
  const revenue = d.ticketPrice * BigInt(tickets);
  if (revenue === ZERO) return null;
  return Number(((revenue - d.endPrizeLamports) * BPS) / revenue);
}

/** How many of an entry's tickets won an instant prize. */
export function entryWins(e: EntryView) {
  return e.prizes.filter((t) => t > 0).length;
}

/** An entry that won anything. */
export const entryWon = (e: EntryView) => e.revealed && (e.instantPaid > ZERO || (e.legacyCreditsWon ?? 0) > 0);

// ---------- wallet ----------

/**
 * What this wallet can enter in one purchase: the per-purchase cap, its room under the per-wallet cap
 * (every ticket kind counts) and the ticket numbers left. Sold out stops every kind.
 */
export function walletAllowance(d: DrawView, player: PlayerView | null) {
  const held = player?.tickets ?? 0;
  const wallet = Math.max(0, d.maxPerWallet - held);
  const left = remaining(d);
  return {
    held,
    wallet,
    max: left === 0 ? 0 : Math.max(0, Math.min(d.maxPerTx, wallet, left)),
  };
}

/** The wallet's play limits as they stand now (a pending raise that has come due counts as applied). */
export interface Limits {
  /** 0 = no limit */
  limit: bigint;
  pending: { lamports: bigint; from: number } | null;
  /** spent in the current 30-day period */
  spent: bigint;
  /** when the current period ends; null when no period is running */
  periodEnd: number | null;
  /** room left under the limit; null with no limit */
  headroom: bigint | null;
  excludedUntil: number;
  excluded: boolean;
}

export function limitsOf(pr: ProfileView | null, now: number): Limits {
  if (!pr) return { limit: ZERO, pending: null, spent: ZERO, periodEnd: null, headroom: null, excludedUntil: 0, excluded: false };
  let limit = pr.limitLamports;
  let pending = pr.pendingFrom !== 0 ? { lamports: pr.pendingLimit, from: pr.pendingFrom } : null;
  if (pending && now >= pending.from) {
    limit = pending.lamports;
    pending = null;
  }
  const fresh = pr.periodStart === 0 || now >= pr.periodStart + PERIOD_SECS;
  const spent = fresh ? ZERO : pr.periodSpent;
  return {
    limit,
    pending,
    spent,
    periodEnd: fresh ? null : pr.periodStart + PERIOD_SECS,
    headroom: limit === ZERO ? null : limit > spent ? limit - spent : ZERO,
    excludedUntil: pr.excludedUntil,
    excluded: now < pr.excludedUntil,
  };
}

/** "1.00" for small prizes, "100" for whole large ones. */
export function prizeText(l: bigint) {
  const s = sol(l, 2, 2);
  const [w, f] = s.split(".");
  return w.length >= 3 && f === "00" ? w : s;
}

export const isDefaultKey = (k: { toBase58(): string }) => k.toBase58() === "11111111111111111111111111111111";

// ---------- the featured draw ----------

/**
 * The one draw the site sells: the newest v4 draw still open (by id, since ids only go up), else the newest
 * v4 draw of any status (its result stays on the page until the next one opens). Legacy v3 draws never feature.
 */
export function featuredDraw(draws: DrawView[]): DrawView | null {
  const v4 = draws.filter((d) => d.legacy === null).sort((a, b) => b.id - a.id);
  return v4.find((d) => d.status === "open") ?? v4[0] ?? null;
}

/** What /live shows without a number: the featured draw. */
export function liveDraw(draws: DrawView[]): DrawView | null {
  return featuredDraw(draws);
}
