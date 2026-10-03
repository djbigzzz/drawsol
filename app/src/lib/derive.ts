import { CANCEL_GRACE_SECS, PERIOD_SECS } from "./config";
import { TIER_CREDITS, TIER_FIXED, TIER_SOL_SHARE, type TierSpec } from "./fairness";
import { sol } from "./format";
import type { DrawView, EntryView, PlayerView, ProfileView } from "./types";

const ZERO = BigInt(0);
const BPS = BigInt(10_000);

/**
 * selling: tickets on sale. closed: sales are over (deadline or sell-out) and the draw waits for draw_at.
 * due: draw_at has passed and the draw can be requested (by the keeper or authority until the public grace
 * window ends, then by anyone). The program enforces the same rules (SPEC-v3 §2.8).
 */
export type Phase = "selling" | "closed" | "due" | "drawing" | "settled" | "cancelled";

export const soldOut = (d: DrawView) => d.paidTickets >= d.ticketCap;

export function phaseOf(d: DrawView, now: number): Phase {
  if (d.status === "settled") return "settled";
  if (d.status === "cancelled") return "cancelled";
  if (d.status === "drawing") return "drawing";
  if (now < d.closesAt && !soldOut(d)) return "selling";
  return now >= d.drawAt ? "due" : "closed";
}

/** Paid tickets still on sale (the cap counts paid tickets only). */
export const remaining = (d: DrawView) => Math.max(0, d.ticketCap - d.paidTickets);

/** From this time anyone may request the draw; before it only the keeper or the operator may. */
export const publicFrom = (d: DrawView) => d.drawAt + d.publicGraceSecs;
export const anyoneCanRun = (d: DrawView, now: number) => now >= publicFrom(d);

/** request_draw cancels instead: nothing sold, or a headline draw below its minimum (full refunds). */
export const cancelsAtRequest = (d: DrawView) => d.nextTicket === 0 || (d.kind === "headline" && !d.guaranteed && d.paidTickets < d.minTickets);

export const canCancel = (d: DrawView, now: number) => d.status === "drawing" && now > d.drawAt + CANCEL_GRACE_SECS;

/** Why a cancelled draw was cancelled, from what the account holds. */
export function cancelReason(d: DrawView): "no-tickets" | "undersold" | "timeout" {
  if (d.nextTicket === 0) return "no-tickets";
  if (d.kind === "headline" && !d.guaranteed && d.paidTickets < d.minTickets && isDefaultKey(d.drawVrfRequest)) return "undersold";
  return "timeout";
}

/**
 * The grand prize: what was paid once settled; a headline (or v2) draw's escrow; a pot draw's pot plus its
 * unwon instant pool (what settle_draw would pay right now).
 */
export function grandPrize(d: DrawView): bigint {
  if (d.status === "settled" && d.prizePaidLamports > ZERO) return d.prizePaidLamports;
  if (d.kind === "pot") return d.potLamports + d.instantPoolLamports;
  if (d.guaranteed) return endPrize(d);
  return d.prizeLamports;
}

// ---------- v4: guaranteed draw, published schedule, random numbers ----------

/** v4: the escrowed end prize is paid once min_tickets have sold; below that the end prize is pot_bps of sales. */
export const endPrizeLocked = (d: DrawView) => d.paidTickets >= d.minTickets;

/** The pot a guaranteed draw would pay right now if it stayed below its minimum: pot_bps of ticket sales. */
export const salesPot = (d: DrawView) => (d.revenueLamports * BigInt(d.potBps)) / BPS;

/** v4: what the end prize is right now (the escrow once locked, else the pot of sales so far). */
export function endPrize(d: DrawView): bigint {
  if (d.status === "settled" && d.prizePaidLamports > ZERO) return d.prizePaidLamports;
  return endPrizeLocked(d) ? d.prizeLamports : salesPot(d);
}

/** The ticket numbers an entry holds: the ones ORAO assigned at reveal, else the sequential range. */
export function ticketNumbersOf(e: EntryView): number[] {
  if (e.numbers.length) return e.numbers;
  return Array.from({ length: e.count }, (_, i) => e.firstTicket + i);
}

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

/** v4: a revealed entry's instant wins, from its assigned numbers against the published schedule. */
export function scheduleWinsOf(e: EntryView, d: DrawView): NumberWin[] {
  if (!e.revealed || !d.schedule.length) return [];
  const out: NumberWin[] = [];
  for (const t of ticketNumbersOf(e)) {
    const hit = tierOfNumber(d, t);
    if (hit) out.push({ ticket: t, lamports: hit.lamports, tier: hit.index });
  }
  return out;
}

/** Every winning number of the schedule that has been handed out, with the wallet that holds it. */
export function wonNumbers(d: DrawView, entries: EntryView[]): Map<number, EntryView> {
  const m = new Map<number, EntryView>();
  if (!d.schedule.length) return m;
  for (const e of entries) {
    if (!e.revealed) continue;
    for (const t of ticketNumbersOf(e)) if (tierOfNumber(d, t)) m.set(t, e);
  }
  return m;
}

/** The instant prizes of the schedule: how many, and their total. */
export function scheduleTotals(d: DrawView) {
  let count = 0;
  let total = ZERO;
  for (const t of d.schedule) {
    count += t.numbers.length;
    total += t.lamports * BigInt(t.numbers.length);
  }
  return { count, total };
}

/** "55% house · 35% pot · 10% instant wins" from the draw's own bps. */
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;

/** The headline house share at a given number of paid tickets: 1 − prize / revenue. null with no revenue. */
export function headlineHouseBps(d: DrawView, tickets: number): number | null {
  const revenue = d.ticketPrice * BigInt(tickets);
  if (revenue === ZERO) return null;
  return Number(((revenue - d.prizeLamports) * BPS) / revenue);
}

// ---------- instant wins ----------

export const activeTiers = (d: DrawView) =>
  d.iwTiers.map((t, i) => ({ ...t, index: i })).filter((t) => t.odds > 0 && t.kind !== 0);

/** Sum of instant-win odds over the denominator, e.g. 225/1000. */
export const instantNumer = (d: DrawView) => activeTiers(d).reduce((n, t) => n + t.odds, 0);
export const solNumer = (d: DrawView) => activeTiers(d).filter((t) => t.kind !== TIER_CREDITS).reduce((n, t) => n + t.odds, 0);

/** SOL owed for one winning ticket of this tier, before the pool cap (sol_share: a share of the snapshot). */
export function tierSol(t: TierSpec, poolSnapshot: bigint): bigint {
  if (t.kind === TIER_SOL_SHARE) return (poolSnapshot * BigInt(t.value)) / BPS;
  if (t.kind === TIER_FIXED) return t.amount ?? ZERO;
  return ZERO;
}
export const tierCredits = (t: TierSpec) => (t.kind === TIER_CREDITS ? t.value : 0);

/** "20% of the pool", "1 free ticket", "0.20 SOL" (v2) */
export function tierLabel(t: TierSpec): string {
  if (t.kind === TIER_SOL_SHARE) return `${pct(t.value)} of the pool`;
  if (t.kind === TIER_CREDITS) return t.value === 1 ? "1 free ticket" : `${t.value} free tickets`;
  if (t.kind === TIER_FIXED) return `${sol(t.amount ?? ZERO, 2, 4)} SOL`;
  return "—";
}

export interface TicketWin {
  ticket: number;
  /** tier index + 1 */
  tier: number;
  /** SOL owed for this ticket before the pool cap */
  sol: bigint;
  credits: number;
}

/** Every winning ticket of a revealed entry, from its on-chain tiers and pool snapshot. */
export function entryWinList(e: EntryView, d: DrawView): TicketWin[] {
  if (!e.revealed) return [];
  const out: TicketWin[] = [];
  e.tiers.forEach((k, i) => {
    if (k <= 0) return;
    const t = d.iwTiers[k - 1];
    if (!t) return;
    out.push({ ticket: e.firstTicket + i, tier: k, sol: tierSol(t, e.poolSnapshot), credits: tierCredits(t) });
  });
  return out;
}

export function entryWins(e: EntryView) {
  return e.tiers.filter((t) => t > 0).length;
}

/** An entry that won anything (SOL or free tickets). */
export const entryWon = (e: EntryView) => e.revealed && (e.solPaid > ZERO || e.creditsWon > 0);

// ---------- wallet ----------

/** Upper bound on tickets in the grand draw: every paid ticket + every free one (credit tickets come on top). */
export const maxEntries = (d: DrawView) => d.ticketCap + d.freeCap;

/**
 * What this wallet can enter in one purchase: the per-purchase cap, its room under the per-wallet cap
 * (every ticket kind counts) and the paid tickets left plus the credits it may use. Sold out stops every kind.
 */
export function walletAllowance(d: DrawView, player: PlayerView | null, credits = 0) {
  const held = player?.tickets ?? 0;
  const wallet = Math.max(0, d.maxPerWallet - held);
  const left = remaining(d);
  return {
    held,
    wallet,
    max: left === 0 ? 0 : Math.max(0, Math.min(d.maxPerTx, wallet, left + credits)),
  };
}

/** The wallet's play limits as they stand now (a pending raise that has come due counts as applied). */
export interface Limits {
  credits: number;
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
  if (!pr) return { credits: 0, limit: ZERO, pending: null, spent: ZERO, periodEnd: null, headroom: null, excludedUntil: 0, excluded: false };
  let limit = pr.limitLamports;
  let pending = pr.pendingFrom !== 0 ? { lamports: pr.pendingLimit, from: pr.pendingFrom } : null;
  if (pending && now >= pending.from) {
    limit = pending.lamports;
    pending = null;
  }
  const fresh = pr.periodStart === 0 || now >= pr.periodStart + PERIOD_SECS;
  const spent = fresh ? ZERO : pr.periodSpent;
  return {
    credits: pr.credits,
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
 * The one draw the site sells: the newest headline draw still open (by id, since ids only go up), else the
 * newest headline draw of any status (its result or refunds stay on the page until the next one opens).
 * Pot draws and legacy v2 draws never feature.
 */
export function featuredDraw(draws: DrawView[]): DrawView | null {
  const headline = draws.filter((d) => d.kind === "headline").sort((a, b) => b.id - a.id);
  return headline.find((d) => d.status === "open") ?? headline[0] ?? null;
}

/**
 * What /live shows without a number: the featured draw while it is unfinished or settled in the last
 * 30 minutes (its result stays on screen for the stream), else the featured draw anyway.
 */
export function liveDraw(draws: DrawView[]): DrawView | null {
  return featuredDraw(draws);
}
