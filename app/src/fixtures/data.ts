/**
 * FIXTURE DATA — screenshots only. This module is reachable only when the app is built with
 * NEXT_PUBLIC_FIXTURES=1; the production bundle never includes it.
 *
 * The featured draw is the v4 "Win $500 cash + 69 instant prizes" draw (№ 7) in the shape the chain holds it:
 * 2,000 tickets at 0.00838 SOL, a guaranteed draw whose end prize is the 4.1922 SOL escrow once 1,430 paid
 * tickets have sold and 35% of sales below that, the real published schedule of 69 winning numbers at the real
 * tier amounts (0.2095 / 0.0838 / 0.0419 / 0.01676 / 0.00838 SOL), and ticket numbers handed out at random at
 * reveal. Instant results are matched the way the program does: an entry's numbers against the schedule. The
 * history (№ 2 pot settled, № 3 headline cancelled) mirrors the v3 draws still on devnet, mapped onto the v4 view.
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { utils } from "@coral-xyz/anchor";
import { rollTicket, winningPosition } from "@/lib/fairness";
import { entryAtPosition, tierOfNumber } from "@/lib/derive";
import type { DrawStatus, DrawView, EntryView, InstantTier, Legacy, PlayerView, ProfileView, RandomnessView, Tier } from "@/lib/types";
import type { Actions, RevealSession } from "@/hooks/context";
import { drawPda, entryPda, legacyDrawPda, legacyEntryPda, playerPda, profilePda } from "@/lib/pdas";

const enc = new TextEncoder();
const Z = BigInt(0);
const B = (n: number) => BigInt(n);
const sol = (x: number) => BigInt(Math.round(x * 1e9));

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

/**
 * The fixture SOL price: close to the $119.27 draw № 7 was sized at, and the quote at which its on-chain tier
 * amounts (scaled by 0.999734 to fit the instant budget) read as their nominal $25 / $10 / $5 / $2 / $1.
 */
export const SOL_USD = 119.33;

/** The fixture clock: Fri 9 Oct 2026, 05:30 UTC. Draw № 7 draws Sun 11 Oct, 20:00 UTC (2 d 14 h 30 min). */
export const FIXED_NOW = Math.floor(Date.UTC(2026, 9, 9, 5, 30, 0) / 1000);
const SUNDAY = Math.floor(Date.UTC(2026, 9, 11, 20, 0, 0) / 1000);
const DAY = 86400;

// ---- draw № 7 as on chain (scripts/terms/draw-7.md): price, end prize, tiers, winning numbers
const PRICE = BigInt(8_380_000);
const PRIZE = BigInt(4_192_169_028);
const CAP = 2000;
const TIERS: Tier[] = [
  { amount: BigInt(209_500_000), count: 2, set: 2, won: 0 },
  { amount: BigInt(83_800_000), count: 4, set: 4, won: 0 },
  { amount: BigInt(41_899_999), count: 8, set: 8, won: 0 },
  { amount: BigInt(16_759_999), count: 15, set: 15, won: 0 },
  { amount: BigInt(8_379_999), count: 40, set: 40, won: 0 },
];
const NUMBERS: number[][] = [
  [1228, 1516],
  [202, 253, 358, 566],
  [158, 399, 404, 533, 548, 1261, 1387, 1607],
  [41, 229, 254, 426, 759, 888, 1082, 1103, 1318, 1321, 1431, 1546, 1707, 1851, 1993],
  [76, 119, 133, 205, 243, 246, 324, 327, 388, 437, 472, 482, 590, 641, 654, 734, 798, 834, 878, 983, 1098, 1185, 1282, 1319, 1341, 1425, 1428, 1499, 1580, 1584, 1622, 1700, 1742, 1784, 1841, 1908, 1916, 1967, 1992, 1998],
];
const SCHEDULE_TOTAL = TIERS.reduce((s, t) => s + t.amount * B(t.count), Z);

/** A deterministic shuffle of 0…n−1 (sha256-driven), so numbers are random but every build shoots the same. */
function shuffled(n: number, label: string): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
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

const schedule = (): InstantTier[] => TIERS.map((t, i) => ({ lamports: t.amount, numbers: NUMBERS[i].slice(), won: [] }));

type Flavour = "v4" | "pot" | "headline";

function baseDraw(id: number, flavour: Flavour, drawAt: number): DrawView {
  const v4 = flavour === "v4";
  const legacy: Legacy = v4 ? null : flavour;
  return {
    address: v4 ? drawPda(id) : legacyDrawPda(id),
    id,
    legacy,
    authority: OPERATOR,
    status: "open",
    ticketPrice: v4 ? PRICE : sol(0.01),
    ticketCap: v4 ? CAP : flavour === "pot" ? 300 : 230,
    maxPerTx: v4 ? 1000 : 25,
    maxPerWallet: v4 ? 2000 : 50,
    freeCap: v4 ? 20 : 15,
    createdAt: flavour === "pot" ? drawAt - 22 * 3600 : drawAt - 7 * DAY,
    closesAt: drawAt,
    drawAt,
    publicGraceSecs: 30 * 60,
    houseBps: 5500,
    potBps: v4 || flavour === "pot" ? 3500 : 0,
    instantBps: v4 || flavour === "pot" ? 1000 : 0,
    endPrizeLamports: v4 ? PRIZE : flavour === "pot" ? Z : sol(1),
    minTickets: v4 ? 1430 : flavour === "pot" ? 0 : 120,
    tiers: v4 ? TIERS.map((t) => ({ ...t })) : [],
    scheduleTotalLamports: v4 ? SCHEDULE_TOTAL : Z,
    scheduleSet: v4 ? 69 : 0,
    instantsPaid: Z,
    revenueLamports: Z,
    houseLamports: Z,
    houseWithdrawn: Z,
    refundedLamports: Z,
    paidTickets: 0,
    freeTickets: 0,
    assigned: 0,
    nextPos: 0,
    entryCount: 0,
    revealedEntries: 0,
    drawVrfRequest: PublicKey.default,
    drawVrfSeed: new Uint8Array(32),
    randomness: new Uint8Array(64),
    winningPos: 0,
    winningTicket: 0,
    winningEntry: PublicKey.default,
    winner: PublicKey.default,
    endPrizePaid: Z,
    settledAt: 0,
    prizePaid: false,
    escrowReturned: false,
    instantEscrowReturned: false,
    termsHash: hash32(`draw-${id}`),
    schedule: v4 ? schedule() : [],
    guaranteed: v4 || flavour === "pot",
    randomNumbers: v4,
    legacyInstantPool: flavour === "pot" ? Z : undefined,
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

const HEADLINE_SCRIPT: Row[] = [
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
  /** v4: the unused ticket numbers (the Pool account), in the order ORAO would hand them out */
  pool: number[];
}

const owner = (who: string) => (who === "me" ? ME : fxKey(`player-${who}`));

/** reveal_entry on a v4 draw: ORAO hands out the next numbers of the pool; matches against the schedule are paid. */
function revealV4(w: FxWorld, e: EntryView, forced?: number[]) {
  const d = w.draw;
  const nums = forced ? forced.slice() : [];
  if (forced) w.pool = w.pool.filter((x) => !forced.includes(x)); // a forced number must not be handed out twice
  while (nums.length < e.count) nums.push(w.pool.shift()!);
  e.tickets = nums;
  e.revealed = true;
  e.prizes = nums.map((t) => {
    const hit = tierOfNumber(d, t);
    return hit ? hit.index + 1 : 0;
  });
  let owed = Z;
  e.prizes.forEach((k, i) => {
    if (!k) return;
    const t = d.tiers[k - 1];
    owed += t.amount;
    t.won += 1;
    d.schedule[k - 1].won.push(nums[i]);
  });
  e.instantPaid = owed;
  d.instantsPaid += owed;
  d.assigned += e.count;
  d.revealedEntries += 1;
}

/** The legacy pot tiers, for the history fixtures: 1.5% / 6% / 15% of tickets won 0.02 SOL / 0.004 SOL / a free ticket. */
const LEGACY_ODDS = [{ odds: 15 }, { odds: 60 }, { odds: 150 }];
const LEGACY_SOL = [sol(0.02), sol(0.004), Z];

/** reveal_entry on a legacy pot draw: tiers from the randomness over its sequential tickets. */
function revealLegacyPot(d: DrawView, e: EntryView, rand: Uint8Array) {
  e.prizes = e.tickets.map((t) => rollTicket(rand, t, 1000, LEGACY_ODDS));
  e.instantPaid = e.prizes.reduce((s, k) => s + (k ? LEGACY_SOL[k - 1] : Z), Z);
  e.legacyCreditsWon = e.prizes.filter((k) => k === 3).length;
  e.revealed = true;
  d.instantsPaid += e.instantPaid;
  d.revealedEntries += 1;
}

/** `newest`: unix time of the last purchase. */
export function buildWorld(id: number, flavour: Flavour, drawAt: number, newest: number, opts: { scale?: number; status?: DrawStatus; extra?: Row[]; script?: Row[]; fill?: number } = {}): FxWorld {
  const d = baseDraw(id, flavour, drawAt);
  d.status = opts.status ?? "open";
  const base = opts.script ?? (flavour === "pot" ? POT_SCRIPT : flavour === "v4" ? v4Script() : HEADLINE_SCRIPT);
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
  const rolls = flavour !== "headline";
  const w: FxWorld = { draw: d, entries, entryRandomness, pool: flavour === "v4" ? shuffled(d.ticketCap, `numbers-${id}`) : [] };
  // this wallet's 10-ticket purchase holds one 0.01676 SOL ($2) winning number: the first of that tier
  const forcedFor = (who: string, paid: number) => (flavour === "v4" && who === "me" && paid === 10 ? [d.schedule[3].numbers[0]] : undefined);
  script.forEach(([who, paid, free, revealed, minsAgo], seq) => {
    const address = flavour === "v4" ? entryPda(d.address, seq) : legacyEntryPda(d.address, seq);
    const rand = fxRand(`entry-${id}-${seq}`);
    entryRandomness.set(address.toBase58(), rand);
    const count = free ? 1 : paid;
    const cost = d.ticketPrice * B(paid);
    d.revenueLamports += cost;
    const e: EntryView = {
      address,
      draw: d.address,
      owner: owner(who),
      seq,
      firstPos: d.nextPos,
      count,
      isFree: free,
      paidLamports: cost,
      createdAt: newest - minsAgo * 60,
      vrfRequest: rolls ? fxKey(`vrf-${id}-${seq}`) : PublicKey.default,
      vrfSeed: new Uint8Array(32),
      needsReveal: rolls,
      revealed: false,
      instantPaid: Z,
      refunded: false,
      // legacy draws numbered tickets sequentially at purchase; v4 numbers arrive at reveal
      tickets: flavour === "v4" ? [] : Array.from({ length: count }, (_, i) => d.nextPos + i),
      prizes: [],
    };
    d.nextPos += count;
    d.entryCount += 1;
    if (free) d.freeTickets += 1;
    else d.paidTickets += paid;
    if (flavour !== "v4") d.assigned = d.nextPos;
    if (rolls && revealed) {
      if (flavour === "v4") revealV4(w, e, forcedFor(who, paid));
      else revealLegacyPot(d, e, rand);
    }
    entries.push(e);
  });
  if (flavour === "pot") {
    // a v3 pot draw's end prize was its pot plus the unwon instant pool
    const instantPool = (d.revenueLamports * B(d.instantBps)) / B(10_000) - d.instantsPaid;
    d.legacyInstantPool = instantPool;
    d.endPrizeLamports = (d.revenueLamports * B(d.potBps)) / B(10_000) + instantPool;
    d.houseLamports = (d.revenueLamports * B(d.houseBps)) / B(10_000);
  }
  entries.sort((a, b) => b.seq - a.seq);
  return w;
}

/** Reveal whatever is still sealed (the keeper reveals everything before it requests the draw). */
function revealAll(w: FxWorld) {
  for (const e of w.entries.slice().sort((a, b) => a.seq - b.seq))
    if (e.needsReveal && !e.revealed) {
      if (w.draw.randomNumbers) revealV4(w, e);
      else revealLegacyPot(w.draw, e, w.entryRandomness.get(e.address.toBase58())!);
    }
}

/** request_draw → ORAO → settle_draw, with the winning position from fairness.ts over every position in the draw. */
function settleWorld(w: FxWorld, label: string, settledAt: number) {
  const d = w.draw;
  revealAll(w);
  const r = fxRand(label);
  d.status = "settled";
  d.drawVrfRequest = fxKey(`drawvrf-${label}`);
  d.randomness = r;
  d.winningPos = winningPosition(r, d.nextPos);
  const hit = entryAtPosition(w.entries, d.winningPos)!;
  d.winningTicket = hit.tickets[d.winningPos - hit.firstPos];
  d.winningEntry = hit.address;
  d.winner = hit.owner;
  if (d.legacy === "pot") {
    d.endPrizePaid = d.endPrizeLamports;
    d.legacyInstantPool = Z;
  } else if (d.legacy === "headline") {
    d.endPrizePaid = d.endPrizeLamports;
    d.houseLamports = d.revenueLamports;
  } else {
    const fallback = d.paidTickets < d.minTickets;
    d.endPrizePaid = fallback ? (d.revenueLamports * B(d.potBps)) / B(10_000) : d.endPrizeLamports;
    d.houseLamports = d.revenueLamports - (fallback ? d.endPrizePaid : Z);
    d.escrowReturned = fallback;
    d.instantEscrowReturned = true;
  }
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

/** cancel_draw on a v4 draw whose randomness never arrived: refunds net of instant prizes already paid. */
function cancelTimeout(w: FxWorld, label: string, refundedBy: (e: EntryView) => boolean) {
  const d = w.draw;
  revealAll(w);
  d.status = "cancelled";
  d.drawVrfRequest = fxKey(`drawvrf-${label}`);
  for (const e of w.entries) {
    if (e.isFree || !refundedBy(e)) continue;
    const back = e.paidLamports > e.instantPaid ? e.paidLamports - e.instantPaid : Z;
    if (back === Z) continue;
    e.refunded = true;
    d.refundedLamports += back;
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
  "free", "free-claimed",
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
export function revealSessionFor(e: EntryView, rand: Uint8Array, label: string): RevealSession {
  return {
    entry: e.address,
    firstPos: e.firstPos,
    count: e.count,
    stage: "revealed",
    vrfRequest: e.vrfRequest,
    vrfMs: 1800,
    revealTx: fxSig(`reveal-${label}`),
    tickets: e.tickets,
    prizes: e.prizes,
    instantPaid: e.instantPaid,
    free: e.isFree,
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
    won: mine.reduce((k, e) => k + e.instantPaid, Z),
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
    settleTx: new Map(),
    entryRandomness: new Map(),
    entriesByDraw: new Map(),
    allEntries: [],
    nextDrawId: 8,
  };
  if (s === "loading" || s === "error" || s === "nodraw") return { ...fx, load: s, wallet: null };

  // ---- history, as on devnet: № 2 v3 pot (settled), № 3 v3 headline (cancelled, undersold); № 7 the featured v4 draw
  const last = settleWorld(fitBeforeClose(moveDraw(buildWorld(2, "pot", now - 6 * DAY, now - 6 * DAY - 120), now - 6 * DAY)), "draw-2", now - 6 * DAY + 94);
  fx.settleTx.set(last.draw.address.toBase58(), fxSig("settle-2"));
  const lastHead = cancelUndersold(fitBeforeClose(moveDraw(buildWorld(3, "headline", now - 6 * DAY + 400, now - 6 * DAY + 100, { scale: 0.75 }), now - 6 * DAY + 400)), (e) => e.seq % 2 === 0);
  const head = buildWorld(7, "v4", SUNDAY, now - 60);

  // ---- states of № 7
  const replace = (big: FxWorld) => {
    head.draw = big.draw;
    head.entries = big.entries;
    head.pool = big.pool;
    head.entryRandomness = big.entryRandomness;
  };
  if (s === "open-locked") {
    // past the minimum: the escrow is the end prize
    const extra: Row[] = Array.from({ length: 9 }, (_, i) => [`x${i}`, 100, false, true, 60 - i * 5] as Row);
    replace(buildWorld(7, "v4", SUNDAY, now - 60, { extra }));
  }
  if (s === "sold-out") replace(buildWorld(7, "v4", SUNDAY, now - 60, { fill: 1993 }));
  if (s === "due" || s === "live-due") moveDraw(head, now - 12 * 60);
  if (s === "due-public") moveDraw(head, now - 47 * 60);
  if (s === "live-countdown") moveDraw(head, now + 4 * 60 + 12);
  if (s === "drawing" || s === "drawing-wait" || s === "live-drawing" || s === "live-rolling") {
    moveDraw(head, now - 3 * 60);
    revealAll(head);
    head.draw.status = "drawing";
    head.draw.drawVrfRequest = fxKey("drawvrf-7");
    const fulfilled = s !== "drawing-wait" && s !== "live-drawing";
    fx.drawRandomness.set(head.draw.address.toBase58(), { address: head.draw.drawVrfRequest, fulfilled, randomness: fulfilled ? fxRand("draw-7-final") : null });
    if (s === "live-rolling") fx.liveRollAt = 0.72;
  }
  if (s === "settled" || s === "live-paid") {
    // sold past the minimum on the last day: the escrowed $500 is the end prize
    const extra: Row[] = Array.from({ length: 9 }, (_, i) => [`x${i}`, 100, false, true, 60 - i * 5] as Row);
    const big = buildWorld(7, "v4", SUNDAY, now - 60, { extra });
    moveDraw(big, now - (s === "live-paid" ? 6 : 95) * 60);
    fitBeforeClose(big);
    settleWorld(big, "draw-7-final", big.draw.drawAt + 118);
    replace(big);
    fx.settleTx.set(big.draw.address.toBase58(), fxSig("settle-7"));
  }
  if (s === "settled-pot") {
    // stayed below 1,430: the end prize is 35% of sales
    moveDraw(head, now - 95 * 60);
    fitBeforeClose(head);
    settleWorld(head, "draw-7-final", head.draw.drawAt + 118);
    fx.settleTx.set(head.draw.address.toBase58(), fxSig("settle-7"));
  }
  if (s === "cancelled") {
    // the randomness never arrived within 48 h of the draw time: cancelled, refunds (net of instant wins) open
    moveDraw(head, now - 50 * 3600);
    fitBeforeClose(head);
    cancelTimeout(head, "draw-7-stuck", (e) => e.seq % 3 === 0);
  }
  fitBeforeClose(head);

  const worlds = [head, last, lastHead];
  for (const w of worlds) {
    fx.worlds.set(w.draw.address.toBase58(), w);
    fx.entriesByDraw.set(w.draw.address.toBase58(), w.entries);
    w.entryRandomness.forEach((v, k) => fx.entryRandomness.set(k, v));
  }
  fx.draws = [head.draw];
  fx.legacyDraws = [last.draw, lastHead.draw].sort((a, b) => b.id - a.id);
  fx.allEntries = worlds.flatMap((w) => w.entries).sort((a, b) => b.createdAt - a.createdAt);

  // ---- the wallet's Profile: its play limits
  const all = worlds.flatMap((w) => w.entries).filter((e) => e.owner.equals(ME));
  const spent = all.filter((e) => e.createdAt > now - 20 * DAY).reduce((k, e) => k + e.paidLamports, Z);
  fx.profile = { address: profilePda(ME), limitLamports: Z, pendingLimit: Z, pendingFrom: 0, periodStart: now - 20 * DAY, periodSpent: spent, excludedUntil: 0 };

  if (s === "draw-settled") fx.selected = 2;
  if (s === "draw-cancelled") fx.selected = 3;

  if (s === "open-guest") {
    fx.wallet = null;
    fx.profile = null;
  }
  if (s === "open-low") fx.wallet = { address: ME, balance: sol(0.0123) };
  if (s === "stale") fx.staleSince = now - 4 * 60;

  // ---- the reveal: this wallet's sealed 5-ticket purchase, just paid for
  const sealed = head.entries.find((m) => m.owner.equals(ME) && !m.isFree && m.count === 5 && !m.revealed);
  if (sealed && (s === "reveal" || s === "reveal-done" || s === "reveal-nowin" || s === "reveal-wait" || s === "reveal-failed")) {
    const rand = head.entryRandomness.get(sealed.address.toBase58())!;
    if (s === "reveal-wait") {
      fx.session = { entry: sealed.address, firstPos: sealed.firstPos, count: sealed.count, stage: "vrf", vrfRequest: sealed.vrfRequest, vrfStartedAt: Date.now(), buyTx: fxSig("buy") };
    } else if (s === "reveal-failed") {
      fx.session = {
        entry: sealed.address,
        firstPos: sealed.firstPos,
        count: sealed.count,
        stage: "failed",
        vrfRequest: sealed.vrfRequest,
        buyTx: fxSig("buy"),
        error: { message: "ORAO hasn’t delivered randomness yet. Your tickets are safe; reveal them later from Your tickets." },
      };
    } else {
      // reveal: one 0.0838 SOL ($10) win among the five; reveal-nowin: none
      revealV4(head, sealed, s === "reveal-nowin" ? undefined : [head.draw.schedule[1].numbers[3]]);
      fx.session = { ...revealSessionFor(sealed, rand, "buy"), buyTx: fxSig("buy"), vrfMs: 1840, initialShown: s === "reveal" ? 3 : 5 };
    }
  }
  if (s === "free-claimed") {
    // nothing to do: this wallet's free entry is in the script
  } else if (s === "free") {
    // not yet claimed: drop this wallet's free entry from the world (its number goes back to the pool)
    const idx = head.entries.findIndex((e) => e.owner.equals(ME) && e.isFree);
    if (idx >= 0) {
      const gone = head.entries[idx];
      head.entries.splice(idx, 1);
      head.draw.freeTickets -= 1;
      head.draw.nextPos -= 1;
      head.draw.entryCount -= 1;
      if (gone.revealed) {
        head.draw.assigned -= 1;
        head.draw.revealedEntries -= 1;
        head.pool.push(...gone.tickets);
      }
    }
  }
  return fx;
}
