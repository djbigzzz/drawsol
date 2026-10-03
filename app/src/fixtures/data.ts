/**
 * FIXTURE DATA — screenshots only. This module is reachable only when the app is built with
 * NEXT_PUBLIC_FIXTURES=1; the production bundle never includes it.
 *
 * The featured draw is the v4 "Win $500 cash + instant prizes" draw (№ 6): 2,000 tickets at ≈$1, a guaranteed
 * draw whose end prize is the escrow once 1,430 have sold and 35% of sales below that, a published schedule of
 * 69 instant prizes with pre-assigned winning ticket numbers, and ticket numbers handed out at random at
 * reveal. Instant results are matched the way the program would: an entry's numbers against the schedule.
 * The history (№ 2 pot settled, № 3 headline cancelled) and the v3 headline № 5 mirror devnet.
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { utils } from "@coral-xyz/anchor";
import { rollEntry, TIER_CREDITS, TIER_SOL_SHARE, winningTicket, type TierSpec } from "@/lib/fairness";
import { scheduleWinsOf, tierCredits, tierSol, ticketNumbersOf } from "@/lib/derive";
import type { DrawKind, DrawStatus, DrawView, EntryView, InstantTier, PlayerView, ProfileView, RandomnessView } from "@/lib/types";
import type { Actions, Done, RevealSession } from "@/hooks/context";
import { drawPda, entryPda, playerPda, profilePda } from "@/lib/pdas";

const enc = new TextEncoder();
const LAMPORTS = BigInt(1_000_000_000);
const Z = BigInt(0);
const B = (n: number) => BigInt(n);
const sol = (x: number) => (BigInt(Math.round(x * 1e9)) * LAMPORTS) / BigInt(1e9);

export const fxKey = (label: string) => new PublicKey(sha256(enc.encode(`fixture:${label}`)));
export const fxRand = (label: string) => {
  const a = sha256(enc.encode(`fixture-rand-a:${label}`));
  const b = sha256(enc.encode(`fixture-rand-b:${label}`));
  const out = new Uint8Array(64);
  out.set(a, 0);
  out.set(b, 32);
  return out;
};
export const fxSig = (label: string) => {
  const out = new Uint8Array(64);
  out.set(sha256(enc.encode(`fixture-sig-a:${label}`)), 0);
  out.set(sha256(enc.encode(`fixture-sig-b:${label}`)), 32);
  return utils.bytes.bs58.encode(out);
};
const hash32 = (label: string) => sha256(enc.encode(`fixture-terms:${label}`));

export const ME = fxKey("me");
const OPERATOR = fxKey("operator");

/** The fixture SOL price: 4.1911 SOL is $500 and 0.00838 SOL is $1.00 at this quote. */
export const SOL_USD = 119.3;

/** The fixture clock: Fri 9 Oct 2026, 05:30 UTC. Draw № 6 draws Sun 11 Oct, 20:00 UTC (2 d 14 h 30 min). */
export const FIXED_NOW = Math.floor(Date.UTC(2026, 9, 9, 5, 30, 0) / 1000);
const SUNDAY = Math.floor(Date.UTC(2026, 9, 11, 20, 0, 0) / 1000);
const DAY = 86400;

const PRICE = sol(0.00838);
const PRIZE = sol(4.1911);
/** $25×2, $10×4, $5×8, $2×15, $1×40 at the fixture quote: 69 prizes, ≈$200 */
const SCHEDULE_USD: [number, number][] = [
  [25, 2],
  [10, 4],
  [5, 8],
  [2, 15],
  [1, 40],
];

/** A deterministic shuffle of 1…n (sha256-driven), so numbers are random but every build shoots the same. */
function shuffled(n: number, label: string): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  let seed = sha256(enc.encode(`fixture-shuffle:${label}`));
  let k = 0;
  const next = () => {
    if (k >= 28) {
      seed = sha256(seed);
      k = 0;
    }
    const v = (seed[k] << 24) | (seed[k + 1] << 16) | (seed[k + 2] << 8) | seed[k + 3];
    k += 4;
    return (v >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The published schedule: 69 winning numbers drawn from 1…2000 before sales open. */
function schedule(cap: number): InstantTier[] {
  const pool = shuffled(cap, "schedule");
  let at = 0;
  return SCHEDULE_USD.map(([usd, count]) => ({
    lamports: sol(Math.round((usd / SOL_USD) * 1e6) / 1e6),
    numbers: pool.slice(at, (at += count)).sort((a, b) => a - b),
  }));
}

const POT_TIERS: TierSpec[] = [
  { odds: 15, kind: TIER_SOL_SHARE, value: 2000 },
  { odds: 60, kind: TIER_SOL_SHARE, value: 400 },
  { odds: 150, kind: TIER_CREDITS, value: 1 },
  { odds: 0, kind: 0, value: 0 },
];
const NO_TIERS: TierSpec[] = Array.from({ length: 4 }, () => ({ odds: 0, kind: 0, value: 0 }));

type Flavour = "pot" | "v3" | "v4";

function baseDraw(id: number, flavour: Flavour, drawAt: number): DrawView {
  const pot = flavour === "pot";
  const v4 = flavour === "v4";
  const kind: DrawKind = pot ? "pot" : "headline";
  return {
    address: drawPda(id),
    id,
    kind,
    authority: OPERATOR,
    status: "open",
    ticketPrice: v4 ? PRICE : sol(0.01),
    ticketCap: pot ? 300 : v4 ? 2000 : 230,
    maxPerTx: v4 ? 1000 : 25,
    maxPerWallet: v4 ? 2000 : 50,
    freeCap: v4 ? 50 : 15,
    createdAt: pot ? drawAt - 22 * 3600 : drawAt - 7 * DAY,
    closesAt: drawAt,
    drawAt,
    publicGraceSecs: 30 * 60,
    houseBps: pot ? 5500 : v4 ? 6500 : 5500,
    potBps: pot || v4 ? 3500 : 0,
    instantBps: pot ? 1000 : 0,
    prizeLamports: pot ? Z : v4 ? PRIZE : sol(1),
    minTickets: pot ? 0 : v4 ? 1430 : 120,
    floorMarginBps: pot ? 0 : 2000,
    potLamports: Z,
    instantPoolLamports: Z,
    houseLamports: Z,
    houseWithdrawn: Z,
    revenueLamports: Z,
    refundedLamports: Z,
    iwDenominator: pot ? 1000 : 0,
    iwTiers: pot ? POT_TIERS : NO_TIERS,
    paidTickets: 0,
    freeTickets: 0,
    creditTickets: 0,
    nextTicket: 0,
    entryCount: 0,
    rolledEntries: 0,
    revealedEntries: 0,
    drawVrfRequest: PublicKey.default,
    drawVrfSeed: new Uint8Array(32),
    randomness: new Uint8Array(64),
    winningTicket: 0,
    winningEntry: PublicKey.default,
    winner: PublicKey.default,
    prizePaidLamports: Z,
    settledAt: 0,
    prizePaid: false,
    termsHash: hash32(`draw-${id}`),
    guaranteed: v4,
    schedule: v4 ? schedule(2000) : [],
    randomNumbers: v4,
  };
}

/** [owner, paid, free?, revealed?, minutes before the newest purchase] */
type Row = [string, number, boolean, boolean, number];

const POT_SCRIPT: Row[] = [
  ["a", 25, false, true, 1290],
  ["b", 10, false, true, 1180],
  ["c", 25, false, true, 1010],
  ["me", 10, false, true, 940],
  ["d", 0, true, true, 900],
  ["e", 5, false, true, 830],
  ["f", 20, false, true, 700],
  ["g", 2, false, true, 610],
  ["h", 15, false, true, 480],
  ["i", 25, false, true, 390],
  ["j", 8, false, true, 300],
  ["k", 2, false, true, 240],
];

const V3_SCRIPT: Row[] = [
  ["p", 10, false, false, 9000],
  ["q", 25, false, false, 7400],
  ["me", 5, false, false, 6100],
  ["r", 2, false, false, 5000],
  ["s", 0, true, false, 4300],
  ["t", 12, false, false, 3000],
  ["me", 0, true, false, 2100],
  ["u", 20, false, false, 900],
];

/** 606 paid tickets over three days from 44 wallets, plus 7 free entries; the last two purchases are still sealed. */
function v4Script(): Row[] {
  const sizes = [25, 10, 50, 5, 20, 100, 5, 2, 10, 15, 25, 1, 50, 10, 5, 20, 30, 10, 5, 3, 40, 10, 2, 8, 15, 5, 25, 10, 4, 6, 1, 12, 5, 10, 2, 7, 3, 1];
  const rows: Row[] = [];
  let mins = 4100;
  sizes.forEach((q, i) => {
    rows.push([`w${i}`, q, false, true, mins]);
    mins -= 70 + ((i * 37) % 60);
    if (i % 6 === 2) {
      rows.push([`f${i}`, 0, true, true, mins]);
      mins -= 25;
    }
  });
  // this wallet: a 10-ticket purchase two days ago, a free entry, and a 5-ticket purchase just now (sealed)
  rows.splice(9, 0, ["me", 10, false, true, 3100]);
  rows.splice(20, 0, ["me", 0, true, true, 1800]);
  rows.push(["v", 4, false, false, 9]);
  rows.push(["me", 5, false, false, 2]);
  return rows;
}

export interface FxWorld {
  draw: DrawView;
  entries: EntryView[];
  entryRandomness: Map<string, Uint8Array>;
  /** v4: the unused ticket numbers, in the order ORAO would hand them out */
  pool: number[];
}

const owner = (who: string) => (who === "me" ? ME : fxKey(`player-${who}`));

/** The program's split of one payment: pot draws by bps; headline draws keep revenue whole. */
function buyInto(d: DrawView, cost: bigint) {
  d.revenueLamports += cost;
  if (d.kind !== "pot") return;
  const house = (cost * B(d.houseBps)) / B(10_000);
  const instant = (cost * B(d.instantBps)) / B(10_000);
  d.houseLamports += house;
  d.instantPoolLamports += instant;
  d.potLamports += cost - house - instant;
}

/** reveal_entry on a pot draw: tiers from the randomness, SOL owed from the snapshot (capped by the pool). */
function revealPot(d: DrawView, e: EntryView, rand: Uint8Array) {
  e.tiers = rollEntry(rand, e.firstTicket, e.count, d.iwDenominator, d.iwTiers);
  let owed = Z;
  let credits = 0;
  for (const k of e.tiers) {
    if (!k) continue;
    owed += tierSol(d.iwTiers[k - 1], e.poolSnapshot);
    credits += tierCredits(d.iwTiers[k - 1]);
  }
  e.solPaid = owed < d.instantPoolLamports ? owed : d.instantPoolLamports;
  e.creditsWon = credits;
  e.revealed = true;
  d.instantPoolLamports -= e.solPaid;
  d.revealedEntries += 1;
}

/** reveal_entry on a v4 draw: ORAO hands out the next numbers of the pool; matches against the schedule are paid. */
function revealV4(w: FxWorld, e: EntryView, forced?: number[]) {
  const d = w.draw;
  const nums = forced ? forced.slice() : [];
  while (nums.length < e.count) nums.push(w.pool.shift()!);
  // a forced number must not be handed out twice
  if (forced) w.pool = w.pool.filter((x) => !forced.includes(x));
  e.numbers = nums;
  e.revealed = true;
  const wins = scheduleWinsOf(e, d);
  e.tiers = nums.map((t) => {
    const hit = wins.find((x) => x.ticket === t);
    return hit ? hit.tier + 1 : 0;
  });
  e.solPaid = wins.reduce((s, x) => s + x.lamports, Z);
  d.revealedEntries += 1;
}

/** `newest`: unix time of the last purchase. */
export function buildWorld(id: number, flavour: Flavour, drawAt: number, newest: number, opts: { scale?: number; status?: DrawStatus; extra?: Row[]; script?: Row[]; fill?: number } = {}): FxWorld {
  const d = baseDraw(id, flavour, drawAt);
  d.status = opts.status ?? "open";
  const base = opts.script ?? (flavour === "pot" ? POT_SCRIPT : flavour === "v4" ? v4Script() : V3_SCRIPT);
  const script = [...base.slice(0, Math.round(base.length * (opts.scale ?? 1))), ...(opts.extra ?? [])];
  if (opts.fill !== undefined) {
    // more buyers on the last day, up to exactly `fill` paid tickets (sealed purchases stay sealed, at the end)
    const sealed = script.filter((r) => !r[3] && !r[2]);
    const open = script.filter((r) => r[3] || r[2]);
    let left = opts.fill - script.reduce((k, r) => k + (r[2] ? 0 : r[1]), 0);
    const more: Row[] = [];
    for (let i = 0; left > 0; i++) {
      const q = Math.min(left, [100, 25, 50, 10, 75][i % 5]);
      more.push([`x${i}`, q, false, true, 55 - (i % 10) * 5]);
      left -= q;
    }
    script.length = 0;
    script.push(...open, ...more, ...sealed);
  }
  const entries: EntryView[] = [];
  const entryRandomness = new Map<string, Uint8Array>();
  const rolls = (d.kind === "pot" && d.iwDenominator > 0) || d.schedule.length > 0;
  const w: FxWorld = { draw: d, entries, entryRandomness, pool: flavour === "v4" ? shuffled(d.ticketCap, `numbers-${id}`) : [] };
  // this wallet's 10-ticket purchase holds one $2 winning number: the first $2 number of the schedule
  const forcedFor = (who: string, paid: number) => (flavour === "v4" && who === "me" && paid === 10 ? [d.schedule[3].numbers[0]] : undefined);
  script.forEach(([who, paid, free, revealed, minsAgo], seq) => {
    const address = entryPda(d.address, seq);
    const rand = fxRand(`entry-${id}-${seq}`);
    entryRandomness.set(address.toBase58(), rand);
    const count = free ? 1 : paid;
    const cost = d.ticketPrice * B(paid);
    buyInto(d, cost);
    const e: EntryView = {
      address,
      draw: d.address,
      owner: owner(who),
      seq,
      firstTicket: d.nextTicket,
      count,
      paidCount: free ? 0 : paid,
      creditCount: 0,
      isFree: free,
      paidLamports: cost,
      createdAt: newest - minsAgo * 60,
      poolSnapshot: d.instantPoolLamports,
      vrfRequest: rolls ? fxKey(`vrf-${id}-${seq}`) : PublicKey.default,
      vrfSeed: new Uint8Array(32),
      needsReveal: rolls,
      revealed: false,
      tiers: new Array(count).fill(0),
      solPaid: Z,
      creditsWon: 0,
      refunded: false,
      numbers: [],
    };
    d.nextTicket += count;
    d.entryCount += 1;
    if (free) d.freeTickets += 1;
    else d.paidTickets += paid;
    if (rolls) {
      d.rolledEntries += 1;
      if (revealed) {
        if (flavour === "v4") revealV4(w, e, forcedFor(who, paid));
        else revealPot(d, e, rand);
      }
    }
    entries.push(e);
  });
  entries.sort((a, b) => b.seq - a.seq);
  return w;
}

/** Reveal whatever is still sealed (the keeper reveals everything before it requests the draw). */
function revealAll(w: FxWorld) {
  for (const e of w.entries.slice().sort((a, b) => a.seq - b.seq))
    if (e.needsReveal && !e.revealed) {
      if (w.draw.schedule.length) revealV4(w, e);
      else revealPot(w.draw, e, w.entryRandomness.get(e.address.toBase58())!);
    }
}

/** request_draw → ORAO → settle_draw, with the winner from fairness.ts over every ticket in the draw. */
function settleWorld(w: FxWorld, label: string, settledAt: number) {
  const d = w.draw;
  revealAll(w);
  const r = fxRand(label);
  d.status = "settled";
  d.drawVrfRequest = fxKey(`drawvrf-${label}`);
  d.randomness = r;
  const ordered = w.entries.slice().sort((a, b) => a.seq - b.seq);
  if (d.randomNumbers) {
    // the roll picks the i-th ticket handed out; its number is the winning number
    const all = ordered.flatMap((e) => ticketNumbersOf(e).map((t) => [t, e] as const));
    const i = winningTicket(r, all.length);
    d.winningTicket = all[i][0];
    d.winningEntry = all[i][1].address;
    d.winner = all[i][1].owner;
  } else {
    d.winningTicket = winningTicket(r, d.nextTicket);
    const hit = ordered.find((e) => e.firstTicket <= d.winningTicket && d.winningTicket < e.firstTicket + e.count)!;
    d.winningEntry = hit.address;
    d.winner = hit.owner;
  }
  d.prizePaidLamports = d.kind === "pot" ? d.potLamports + d.instantPoolLamports : d.guaranteed && d.paidTickets < d.minTickets ? (d.revenueLamports * B(d.potBps)) / B(10_000) : d.prizeLamports;
  if (d.kind === "pot") d.instantPoolLamports = Z;
  else d.houseLamports = d.revenueLamports;
  d.settledAt = settledAt;
  d.prizePaid = true;
  return w;
}

/** request_draw on a v3 headline draw below its minimum: cancelled, the escrow straight back, refunds open. */
function cancelUndersold(w: FxWorld, refundedBy: (e: EntryView) => boolean) {
  const d = w.draw;
  d.status = "cancelled";
  d.prizePaid = true;
  for (const e of w.entries) {
    if (e.isFree || !refundedBy(e)) continue;
    e.refunded = true;
    d.refundedLamports += e.paidLamports;
  }
  return w;
}

/** A purchase is never shown after the close: slide every purchase (and the opening) back to fit. */
function fitBeforeClose(w: FxWorld) {
  if (!w.entries.length) return w;
  const latest = Math.max(...w.entries.map((e) => e.createdAt));
  const shift = latest - (w.draw.closesAt - 60);
  if (shift > 0) {
    for (const e of w.entries) e.createdAt -= shift;
    w.draw.createdAt -= shift;
  }
  return w;
}

function moveDraw(w: FxWorld, drawAt: number) {
  const d = w.draw;
  const span = d.drawAt - d.createdAt;
  const shift = d.drawAt - drawAt;
  d.drawAt = drawAt;
  d.closesAt = drawAt;
  d.createdAt = drawAt - span;
  for (const e of w.entries) e.createdAt -= shift;
  return w;
}

export type Scenario =
  | "open"
  | "open-guest"
  | "open-low"
  | "open-max"
  | "open-locked"
  | "confirm"
  | "reveal-wait"
  | "reveal"
  | "reveal-done"
  | "reveal-nowin"
  | "reveal-failed"
  | "free"
  | "free-claimed"
  | "success"
  | "v3"
  | "sold-out"
  | "due"
  | "due-public"
  | "drawing"
  | "drawing-wait"
  | "settled"
  | "settled-pot"
  | "cancelled"
  | "stale"
  | "nodraw"
  | "loading"
  | "error"
  | "draw-settled"
  | "draw-cancelled"
  | "draw-open"
  | "live-countdown"
  | "live-due"
  | "live-drawing"
  | "live-rolling"
  | "live-paid";

export const SCENARIOS: Scenario[] = [
  "open", "open-guest", "open-low", "open-max", "open-locked", "confirm",
  "reveal-wait", "reveal", "reveal-done", "reveal-nowin", "reveal-failed",
  "free", "free-claimed", "success", "v3",
  "sold-out", "due", "due-public", "drawing", "drawing-wait", "settled", "settled-pot", "cancelled",
  "stale", "nodraw", "loading", "error",
  "draw-settled", "draw-cancelled", "draw-open",
  "live-countdown", "live-due", "live-drawing", "live-rolling", "live-paid",
];

export interface FxState {
  load: "ready" | "loading" | "error" | "nodraw";
  draws: DrawView[];
  legacyDraws: DrawView[];
  /** the draw the page opens on (null: the featured draw) */
  selected: number | null;
  worlds: Map<string, FxWorld>;
  wallet: { address: PublicKey; balance: bigint | null } | null;
  profile: ProfileView | null;
  drawRandomness: Map<string, RandomnessView>;
  session: RevealSession | null;
  done: Done | null;
  settleTx: Map<string, string>;
  entryRandomness: Map<string, Uint8Array>;
  entriesByDraw: Map<string, EntryView[]>;
  allEntries: EntryView[];
  staleSince?: number;
  nextDrawId: number;
  phase?: Actions["phase"];
  errors?: Actions["errors"];
  lastSig?: Actions["lastSig"];
  /** /live fixtures only: hold the roll at this point (0–1) for a still frame */
  liveRollAt?: number;
}

/** A revealed session for one entry, with its numbers and wins as the entry holds them. */
export function revealSessionFor(e: EntryView, d: DrawView, rand: Uint8Array, label: string): RevealSession {
  return {
    entry: e.address,
    firstTicket: e.firstTicket,
    count: e.count,
    stage: "revealed",
    vrfRequest: e.vrfRequest,
    vrfMs: 1800,
    revealTx: fxSig(`reveal-${label}`),
    tiers: e.tiers,
    numbers: e.numbers,
    solPaid: e.solPaid,
    creditsWon: e.creditsWon,
    poolSnapshot: e.poolSnapshot,
    free: e.isFree,
    tierSpecs: d.iwTiers,
    randomness: rand,
  };
}

export function playerOf(w: FxWorld, wallet: PublicKey): PlayerView | null {
  const mine = w.entries.filter((e) => e.owner.equals(wallet));
  if (!mine.length) return null;
  return {
    address: playerPda(w.draw.address, wallet),
    tickets: mine.reduce((k, e) => k + e.count, 0),
    spent: mine.reduce((k, e) => k + e.paidLamports, Z),
    won: mine.reduce((k, e) => k + e.solPaid, Z),
    wonCredits: mine.reduce((k, e) => k + e.creditsWon, 0),
    freeClaimed: mine.some((e) => e.isFree),
  };
}

export function scenario(s: Scenario, now: number): FxState {
  const fx: FxState = {
    load: "ready",
    draws: [],
    legacyDraws: [],
    selected: null,
    worlds: new Map(),
    wallet: { address: ME, balance: sol(4.2137) },
    profile: null,
    drawRandomness: new Map(),
    session: null,
    done: null,
    settleTx: new Map(),
    entryRandomness: new Map(),
    entriesByDraw: new Map(),
    allEntries: [],
    nextDrawId: 7,
  };
  if (s === "loading" || s === "error" || s === "nodraw") return { ...fx, load: s, wallet: null };

  // ---- history: № 2 pot (settled), № 3 headline v3 (cancelled, undersold); № 4 pot open (never featured);
  // ---- № 5 headline v3 open (older than № 6, so never featured while № 6 exists); № 6 the featured v4 draw
  const last = settleWorld(fitBeforeClose(moveDraw(buildWorld(2, "pot", now - 6 * DAY, now - 6 * DAY - 120), now - 6 * DAY)), "draw-2", now - 6 * DAY + 94);
  fx.settleTx.set(last.draw.address.toBase58(), fxSig("settle-2"));
  const lastHead = cancelUndersold(fitBeforeClose(moveDraw(buildWorld(3, "v3", now - 6 * DAY + 400, now - 6 * DAY + 100, { scale: 0.75 }), now - 6 * DAY + 400)), (e) => e.seq % 2 === 0);
  const pot = buildWorld(4, "pot", SUNDAY - 8 * DAY + 2 * 3600, SUNDAY - 8 * DAY, { scale: 0, status: "cancelled" });
  pot.draw.prizePaid = true;
  const v3 = cancelUndersold(fitBeforeClose(buildWorld(5, "v3", SUNDAY - 7 * DAY, SUNDAY - 7 * DAY - 300, { scale: 0.6 })), (e) => e.seq % 2 === 0);
  const v3flavour = s === "success" || s === "v3";
  const head = buildWorld(6, v3flavour ? "v3" : "v4", SUNDAY, now - 60, v3flavour ? { script: [...v4Script().slice(0, 12), ["me", 5, false, false, 2] as Row].map((r) => [r[0], Math.min(r[1], 25), r[2], false, r[4]] as Row) } : {});
  if (v3flavour) {
    head.draw.ticketCap = 1150;
    head.draw.minTickets = 560;
    head.draw.ticketPrice = PRICE;
    head.draw.prizeLamports = PRIZE;
  }

  // ---- states of № 6
  if (s === "open-locked") {
    // past the minimum: the escrow is the end prize
    const extra: Row[] = Array.from({ length: 9 }, (_, i) => [`x${i}`, 100, false, true, 60 - i * 5] as Row);
    const big = buildWorld(6, "v4", SUNDAY, now - 60, { extra });
    head.draw = big.draw;
    head.entries = big.entries;
    head.pool = big.pool;
    head.entryRandomness = big.entryRandomness;
  }
  if (s === "sold-out") {
    const big = buildWorld(6, "v4", SUNDAY, now - 60, { fill: 2000 });
    head.draw = big.draw;
    head.entries = big.entries;
    head.pool = big.pool;
    head.entryRandomness = big.entryRandomness;
  }
  if (s === "due" || s === "live-due") moveDraw(head, now - 12 * 60);
  if (s === "due-public") moveDraw(head, now - 47 * 60);
  if (s === "live-countdown") moveDraw(head, now + 4 * 60 + 12);
  if (s === "drawing" || s === "drawing-wait" || s === "live-drawing" || s === "live-rolling") {
    moveDraw(head, now - 3 * 60);
    revealAll(head);
    head.draw.status = "drawing";
    head.draw.drawVrfRequest = fxKey("drawvrf-6");
    const fulfilled = s !== "drawing-wait" && s !== "live-drawing";
    fx.drawRandomness.set(head.draw.address.toBase58(), { address: head.draw.drawVrfRequest, fulfilled, randomness: fulfilled ? fxRand("draw-6-final") : null });
    if (s === "live-rolling") fx.liveRollAt = 0.72;
  }
  if (s === "settled" || s === "live-paid") {
    // sold past the minimum on the last day: the escrowed $500 is the end prize
    const extra: Row[] = Array.from({ length: 9 }, (_, i) => [`x${i}`, 100, false, true, 60 - i * 5] as Row);
    const big = buildWorld(6, "v4", SUNDAY, now - 60, { extra });
    moveDraw(big, now - (s === "live-paid" ? 6 : 95) * 60);
    fitBeforeClose(big);
    settleWorld(big, "draw-6-final", big.draw.drawAt + 118);
    head.draw = big.draw;
    head.entries = big.entries;
    fx.settleTx.set(big.draw.address.toBase58(), fxSig("settle-6"));
  }
  if (s === "settled-pot") {
    // stayed below 1,430: the end prize is 35% of sales
    moveDraw(head, now - 95 * 60);
    fitBeforeClose(head);
    settleWorld(head, "draw-6-final", head.draw.drawAt + 118);
    fx.settleTx.set(head.draw.address.toBase58(), fxSig("settle-6"));
  }
  fitBeforeClose(head);

  // "cancelled": without № 6, the newest headline draw is № 5, cancelled at its draw time below the minimum
  const worlds = s === "cancelled" ? [pot, v3, last, lastHead] : [head, pot, v3, last, lastHead];
  for (const w of worlds) {
    fx.worlds.set(w.draw.address.toBase58(), w);
    fx.entriesByDraw.set(w.draw.address.toBase58(), w.entries);
    w.entryRandomness.forEach((v, k) => fx.entryRandomness.set(k, v));
  }
  fx.draws = worlds.map((w) => w.draw).sort((a, b) => b.id - a.id);
  fx.allEntries = worlds.flatMap((w) => w.entries).sort((a, b) => b.createdAt - a.createdAt);

  // ---- the wallet's Profile: its play limits
  const all = worlds.flatMap((w) => w.entries).filter((e) => e.owner.equals(ME));
  const spent = all.filter((e) => e.createdAt > now - 20 * DAY).reduce((k, e) => k + e.paidLamports, Z);
  fx.profile = { address: profilePda(ME), credits: 0, limitLamports: Z, pendingLimit: Z, pendingFrom: 0, periodStart: now - 20 * DAY, periodSpent: spent, excludedUntil: 0 };

  if (s === "draw-settled") fx.selected = 2;
  if (s === "draw-cancelled") fx.selected = 3;

  if (s === "open-guest") {
    fx.wallet = null;
    fx.profile = null;
  }
  if (s === "open-low") fx.wallet = { address: ME, balance: sol(0.0123) };
  if (s === "stale") fx.staleSince = now - 4 * 60;

  // ---- the reveal: this wallet's sealed 5-ticket purchase, just paid for
  const sealed = head.entries.find((m) => m.owner.equals(ME) && m.paidCount === 5 && !m.revealed);
  if (sealed && (s === "reveal" || s === "reveal-done" || s === "reveal-nowin" || s === "reveal-wait" || s === "reveal-failed")) {
    const rand = head.entryRandomness.get(sealed.address.toBase58())!;
    if (s === "reveal-wait") {
      fx.session = { entry: sealed.address, firstTicket: sealed.firstTicket, count: sealed.count, stage: "vrf", vrfRequest: sealed.vrfRequest, vrfStartedAt: Date.now(), buyTx: fxSig("buy"), tierSpecs: head.draw.iwTiers };
    } else if (s === "reveal-failed") {
      fx.session = {
        entry: sealed.address,
        firstTicket: sealed.firstTicket,
        count: sealed.count,
        stage: "failed",
        vrfRequest: sealed.vrfRequest,
        buyTx: fxSig("buy"),
        tierSpecs: head.draw.iwTiers,
        error: { message: "ORAO hasn’t delivered randomness yet. Your tickets are safe; reveal them later from Your tickets." },
      };
    } else {
      // reveal: one $10 win among the five; reveal-nowin: none
      revealV4(head, sealed, s === "reveal-nowin" ? undefined : [head.draw.schedule[1].numbers[3]]);
      fx.session = { ...revealSessionFor(sealed, head.draw, rand, "buy"), buyTx: fxSig("buy"), vrfMs: 1840, initialShown: s === "reveal" ? 3 : 5 };
    }
  }
  if (s === "success") {
    const mine = head.entries.find((m) => m.owner.equals(ME) && m.paidCount === 5)!;
    fx.done = { kind: "buy", sig: fxSig("buy"), entry: mine, firstTicket: mine.firstTicket, count: mine.count };
  }
  if (s === "free-claimed") {
    // nothing to do: this wallet's free entry is in the script
  } else if (s === "free") {
    // not yet claimed: drop this wallet's free entry from the world
    const idx = head.entries.findIndex((e) => e.owner.equals(ME) && e.isFree);
    if (idx >= 0) {
      head.entries.splice(idx, 1);
      head.draw.freeTickets -= 1;
      head.draw.nextTicket -= 1;
      head.draw.entryCount -= 1;
    }
  }
  return fx;
}
