/**
 * FIXTURE DATA — screenshots only. This module is reachable only when the app is built with
 * NEXT_PUBLIC_FIXTURES=1; the production bundle never includes it.
 *
 * The money follows the v3 program's arithmetic (SPEC-v3 §2.3–2.4): every paid ticket is split house / pot /
 * instant pool by the draw's bps, an entry's pool snapshot is the pool right after its purchase, a SOL tier
 * pays a share of that snapshot (capped by the pool), a credits tier adds free tickets, and the winning ticket
 * comes from fairness.ts. Results are computed with fairness.ts from (fixture) randomness, so the shots
 * exercise the real result code paths.
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { utils } from "@coral-xyz/anchor";
import { rollEntry, TIER_CREDITS, TIER_FIXED, TIER_SOL_SHARE, winningTicket, type TierSpec } from "@/lib/fairness";
import { tierCredits, tierSol } from "@/lib/derive";
import type { DrawKind, DrawStatus, DrawView, EntryView, PlayerView, ProfileView, RandomnessView } from "@/lib/types";
import type { Actions, RevealSession } from "@/hooks/context";
import { drawPda, entryPda, legacyDrawPda, legacyEntryPda, playerPda, profilePda } from "@/lib/pdas";

const enc = new TextEncoder();
const LAMPORTS = BigInt(1_000_000_000);
const Z = BigInt(0);
const B = (n: number) => BigInt(n);
const sol = (x: number) => (BigInt(Math.round(x * 1e6)) * LAMPORTS) / BigInt(1e6);

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
 * The fixture clock: Sat 3 Oct 2026, 16:28:48 UTC. Tonight's pot draw closes and draws at 22:00 UTC
 * (5 h 31 min left); this week's headline draw is Sun 4 Oct, 20:00 UTC.
 */
export const FIXED_NOW = Math.floor(Date.UTC(2026, 9, 3, 16, 28, 48) / 1000);
const TONIGHT = Math.floor(Date.UTC(2026, 9, 3, 22, 0, 0) / 1000);
const SUNDAY = Math.floor(Date.UTC(2026, 9, 4, 20, 0, 0) / 1000);
const DAY = 86400;

/** SPEC-v3 §3: the devnet nightly pot draw's instant tiers (/1000). */
const POT_TIERS: TierSpec[] = [
  { odds: 15, kind: TIER_SOL_SHARE, value: 2000 },
  { odds: 60, kind: TIER_SOL_SHARE, value: 400 },
  { odds: 150, kind: TIER_CREDITS, value: 1 },
  { odds: 0, kind: 0, value: 0 },
];
const NO_TIERS: TierSpec[] = Array.from({ length: 4 }, () => ({ odds: 0, kind: 0, value: 0 }));

function baseDraw(id: number, kind: DrawKind, drawAt: number): DrawView {
  const pot = kind === "pot";
  return {
    address: drawPda(id),
    id,
    kind,
    authority: OPERATOR,
    status: "open",
    ticketPrice: sol(0.01),
    ticketCap: pot ? 300 : 230,
    maxPerTx: 25,
    maxPerWallet: 50,
    freeCap: 15,
    createdAt: pot ? drawAt - 22 * 3600 : drawAt - 7 * DAY,
    closesAt: drawAt,
    drawAt,
    publicGraceSecs: 30 * 60,
    houseBps: 5500,
    potBps: pot ? 3500 : 0,
    instantBps: pot ? 1000 : 0,
    prizeLamports: pot ? Z : sol(1),
    minTickets: pot ? 0 : 120,
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
  };
}

/** [owner, paid, credits, free?, revealed?, minutes before the newest purchase] */
type Row = [string, number, number, boolean, boolean, number];

const POT_SCRIPT: Row[] = [
  ["a", 25, 0, false, true, 1290],
  ["b", 10, 0, false, true, 1180],
  ["c", 25, 0, false, true, 1010],
  ["me", 10, 0, false, true, 940],
  ["d", 0, 0, true, true, 900],
  ["e", 5, 0, false, true, 830],
  ["f", 20, 0, false, true, 700],
  ["g", 2, 0, false, true, 610],
  ["me", 0, 0, true, true, 560],
  ["h", 15, 0, false, true, 480],
  ["i", 25, 0, false, true, 390],
  ["j", 8, 0, false, true, 300],
  ["k", 2, 1, false, true, 240],
  ["l", 12, 0, false, true, 200],
  ["m", 21, 4, false, true, 150],
  ["n", 1, 0, false, true, 90],
  ["me", 1, 2, false, true, 60],
  ["o", 4, 0, false, false, 9],
  ["me", 5, 0, false, false, 2],
];

const HEADLINE_SCRIPT: Row[] = [
  ["p", 10, 0, false, false, 9000],
  ["q", 25, 0, false, false, 7400],
  ["me", 5, 0, false, false, 6100],
  ["r", 2, 0, false, false, 5000],
  ["s", 0, 0, true, false, 4300],
  ["t", 12, 0, false, false, 3000],
  ["me", 0, 0, true, false, 2100],
  ["u", 20, 0, false, false, 900],
];

export interface FxWorld {
  draw: DrawView;
  entries: EntryView[];
  entryRandomness: Map<string, Uint8Array>;
}

const owner = (who: string) => (who === "me" ? ME : fxKey(`player-${who}`));

/** The program's split of one payment (SPEC-v3 §2.3): house and instant by bps, the pot takes the remainder. */
function buyInto(d: DrawView, cost: bigint) {
  d.revenueLamports += cost;
  if (d.kind !== "pot") return;
  const house = (cost * B(d.houseBps)) / B(10_000);
  const instant = (cost * B(d.instantBps)) / B(10_000);
  d.houseLamports += house;
  d.instantPoolLamports += instant;
  d.potLamports += cost - house - instant;
}

/** reveal_entry: tiers from the randomness, SOL owed from the snapshot (capped by the pool), credits. */
function revealInto(d: DrawView, e: EntryView, rand: Uint8Array) {
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

/** `newest`: unix time of the last purchase; `scale` (0–1) keeps that share of the script (an earlier evening). */
export function buildWorld(
  id: number,
  kind: "pot" | "headline",
  drawAt: number,
  newest: number,
  opts: { scale?: number; status?: DrawStatus; extra?: Row[] } = {}
): FxWorld {
  const d = baseDraw(id, kind, drawAt);
  d.status = opts.status ?? "open";
  const base = kind === "pot" ? POT_SCRIPT : HEADLINE_SCRIPT;
  const script = [...base.slice(0, Math.round(base.length * (opts.scale ?? 1))), ...(opts.extra ?? [])];
  const entries: EntryView[] = [];
  const entryRandomness = new Map<string, Uint8Array>();
  const rolls = d.kind === "pot" && d.iwDenominator > 0;
  script.forEach(([who, paid, credits, free, revealed, minsAgo], seq) => {
    const address = entryPda(d.address, seq);
    const rand = fxRand(`entry-${id}-${seq}`);
    entryRandomness.set(address.toBase58(), rand);
    const count = free ? 1 : paid + credits;
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
      creditCount: free ? 0 : credits,
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
    };
    d.nextTicket += count;
    d.entryCount += 1;
    if (free) d.freeTickets += 1;
    else {
      d.paidTickets += paid;
      d.creditTickets += credits;
    }
    if (rolls) {
      d.rolledEntries += 1;
      if (revealed) revealInto(d, e, rand);
    }
    entries.push(e);
  });
  return { draw: d, entries: entries.sort((a, b) => b.seq - a.seq), entryRandomness };
}

/** Reveal whatever is still sealed (the keeper reveals everything before it requests the draw). */
function revealAll(w: FxWorld) {
  for (const e of w.entries.slice().sort((a, b) => a.seq - b.seq))
    if (e.needsReveal && !e.revealed) revealInto(w.draw, e, w.entryRandomness.get(e.address.toBase58())!);
}

/** request_draw → ORAO → settle_draw, with the winner from fairness.ts. */
function settleWorld(w: FxWorld, label: string, settledAt: number) {
  const d = w.draw;
  revealAll(w);
  const r = fxRand(label);
  d.status = "settled";
  d.drawVrfRequest = fxKey(`drawvrf-${label}`);
  d.randomness = r;
  d.winningTicket = winningTicket(r, d.nextTicket);
  const hit = w.entries.find((e) => e.firstTicket <= d.winningTicket && d.winningTicket < e.firstTicket + e.count)!;
  d.winningEntry = hit.address;
  d.winner = hit.owner;
  d.prizePaidLamports = d.kind === "pot" ? d.potLamports + d.instantPoolLamports : d.prizeLamports;
  if (d.kind === "pot") d.instantPoolLamports = Z;
  else d.houseLamports = d.revenueLamports;
  d.settledAt = settledAt;
  d.prizePaid = true;
  return w;
}

/** request_draw on a headline draw below its minimum: cancelled, the escrow straight back, refunds open. */
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

/** The legacy v2 Draw Nº 0 (settled), as the read-only history shows it. */
function legacyDraw(now: number): { draw: DrawView; entries: EntryView[] } {
  const address = legacyDrawPda(0);
  const tiers: TierSpec[] = [
    { odds: 10, kind: TIER_FIXED, value: 0, amount: sol(0.2) },
    { odds: 40, kind: TIER_FIXED, value: 0, amount: sol(0.05) },
    { odds: 150, kind: TIER_FIXED, value: 0, amount: sol(0.01) },
    { odds: 0, kind: 0, value: 0, amount: Z },
  ];
  const counts: [string, number, boolean][] = [["v1", 5, false], ["v2", 10, false], ["me", 3, false], ["v3", 1, true]];
  const entries: EntryView[] = [];
  let next = 0;
  let paid = 0;
  let iwPaid = Z;
  const closesAt = now - 13 * DAY;
  counts.forEach(([who, count, free], seq) => {
    const rand = fxRand(`legacy-0-${seq}`);
    const t = free ? [0] : rollEntry(rand, next, count, 1000, tiers);
    const won = t.reduce((n, k) => n + (k ? tiers[k - 1].amount! : Z), Z);
    iwPaid += won;
    entries.push({
      address: legacyEntryPda(address, seq),
      draw: address,
      owner: owner(who),
      seq,
      firstTicket: next,
      count,
      paidCount: free ? 0 : count,
      creditCount: 0,
      isFree: free,
      paidLamports: free ? Z : sol(0.01) * B(count),
      createdAt: closesAt - (4 - seq) * 3600,
      poolSnapshot: Z,
      vrfRequest: free ? PublicKey.default : fxKey(`legacy-vrf-${seq}`),
      vrfSeed: new Uint8Array(32),
      needsReveal: !free,
      revealed: true,
      tiers: t,
      solPaid: won,
      creditsWon: 0,
      refunded: false,
    });
    next += count;
    if (!free) paid += count;
  });
  const r = fxRand("legacy-0-draw");
  const w = winningTicket(r, next);
  const hit = entries.find((e) => e.firstTicket <= w && w < e.firstTicket + e.count)!;
  const draw: DrawView = {
    ...baseDraw(0, "headline", closesAt),
    address,
    kind: "v2",
    status: "settled",
    ticketCap: 150,
    createdAt: closesAt - 6 * DAY,
    publicGraceSecs: 0,
    houseBps: 0,
    minTickets: 0,
    floorMarginBps: 0,
    iwDenominator: 1000,
    iwTiers: tiers,
    paidTickets: paid,
    freeTickets: 1,
    nextTicket: next,
    entryCount: entries.length,
    rolledEntries: 3,
    revealedEntries: 3,
    revenueLamports: sol(0.01) * B(paid),
    drawVrfRequest: fxKey("legacy-0-drawvrf"),
    randomness: r,
    winningTicket: w,
    winningEntry: hit.address,
    winner: hit.owner,
    prizePaidLamports: sol(1),
    settledAt: closesAt + 600,
    prizePaid: true,
    legacyIwPaid: iwPaid,
  };
  return { draw, entries: entries.sort((a, b) => b.seq - a.seq) };
}

export type Scenario =
  | "open"
  | "open-guest"
  | "open-free"
  | "open-low"
  | "credits"
  | "limit"
  | "excluded"
  | "limits-pending"
  | "confirm"
  | "confirm-credits"
  | "pot-empty"
  | "pot-closed"
  | "pot-due"
  | "pot-public"
  | "pot-drawing"
  | "pot-settled"
  | "headline"
  | "headline-free"
  | "headline-cancelled"
  | "headline-settled"
  | "reveal"
  | "reveal-done"
  | "reveal-free"
  | "stale"
  | "nodraw"
  | "nodraw-legacy"
  | "loading"
  | "error"
  | "live-countdown"
  | "live-due"
  | "live-public"
  | "live-drawing"
  | "live-rolling"
  | "live-paid";

export const SCENARIOS: Scenario[] = [
  "open", "open-guest", "open-free", "open-low", "credits", "limit", "excluded", "limits-pending", "confirm", "confirm-credits",
  "pot-empty", "pot-closed", "pot-due", "pot-public", "pot-drawing", "pot-settled",
  "headline", "headline-free", "headline-cancelled", "headline-settled",
  "reveal", "reveal-done", "reveal-free", "stale", "nodraw", "nodraw-legacy", "loading", "error",
  "live-countdown", "live-due", "live-public", "live-drawing", "live-rolling", "live-paid",
];

export interface FxState {
  load: "ready" | "loading" | "error" | "nodraw";
  draws: DrawView[];
  legacyDraws: DrawView[];
  /** the draw the page opens on (null: the catalogue's default) */
  selected: number | null;
  worlds: Map<string, FxWorld>;
  wallet: { address: PublicKey; balance: bigint | null } | null;
  profile: ProfileView | null;
  /** ORAO request of each drawing draw, by draw address */
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
  /** /live fixtures only: hold the barcode roll at this point (0–1) for a still frame */
  liveRollAt?: number;
}

/** A revealed session for one entry, with tiers recomputed by fairness.ts from its randomness. */
export function revealSessionFor(e: EntryView, d: DrawView, rand: Uint8Array, label: string): RevealSession {
  return {
    entry: e.address,
    firstTicket: e.firstTicket,
    count: e.count,
    stage: "revealed",
    vrfRequest: e.vrfRequest,
    vrfMs: 1800,
    revealTx: fxSig(`reveal-${label}`),
    tiers: rollEntry(rand, e.firstTicket, e.count, d.iwDenominator, d.iwTiers),
    solPaid: e.revealed ? e.solPaid : undefined,
    creditsWon: e.revealed ? e.creditsWon : undefined,
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
    tickets: mine.reduce((n, e) => n + e.count, 0),
    spent: mine.reduce((n, e) => n + e.paidLamports, Z),
    won: mine.reduce((n, e) => n + e.solPaid, Z),
    wonCredits: mine.reduce((n, e) => n + e.creditsWon, 0),
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
    nextDrawId: 11,
  };
  if (s === "loading" || s === "error" || s === "nodraw") return { ...fx, load: s, wallet: null };

  // ---- the catalogue: tonight's pot Nº 9, Sunday's headline Nº 8, Sunday night's pot Nº 10 (just opened),
  // ---- and the history: last night's pot Nº 7 (settled), last Sunday's headline Nº 6 (cancelled, undersold)
  const potScale = s === "pot-empty" ? 0 : 1;
  const pot = buildWorld(9, "pot", TONIGHT, now - 60, { scale: potScale });
  const head = buildWorld(8, "headline", SUNDAY, now - 25 * 60);
  const next = buildWorld(10, "pot", TONIGHT + DAY, now - 40, { scale: 0 });
  next.draw.createdAt = now - 40 * 60;
  const last = settleWorld(fitBeforeClose(moveDraw(buildWorld(7, "pot", TONIGHT - DAY, TONIGHT - DAY - 120), TONIGHT - DAY)), "draw-7", TONIGHT - DAY + 94);
  const lastHead = cancelUndersold(fitBeforeClose(moveDraw(buildWorld(6, "headline", SUNDAY - 7 * DAY, SUNDAY - 7 * DAY - 300, { scale: 0.75 }), SUNDAY - 7 * DAY)), (e) => e.seq % 2 === 0);
  fx.settleTx.set(last.draw.address.toBase58(), fxSig("settle-7"));
  const legacy = legacyDraw(now);
  fx.legacyDraws = [legacy.draw];
  fx.settleTx.set(legacy.draw.address.toBase58(), fxSig("settle-legacy-0"));

  // ---- pot Nº 9, tonight
  if (s === "pot-closed") {
    // sold out at 21:10, the draw still waits for 22:00
    pot.draw.paidTickets = pot.draw.ticketCap;
  }
  if (s === "pot-due" || s === "live-due") moveDraw(pot, now - 12 * 60);
  if (s === "pot-public" || s === "live-public") moveDraw(pot, now - 47 * 60);
  if (s === "live-countdown") moveDraw(pot, now + 4 * 60 + 12);
  if (s === "pot-drawing" || s === "live-drawing" || s === "live-rolling") {
    moveDraw(pot, now - 3 * 60);
    revealAll(pot);
    pot.draw.status = "drawing";
    pot.draw.drawVrfRequest = fxKey("drawvrf-9");
    const fulfilled = s !== "live-drawing";
    fx.drawRandomness.set(pot.draw.address.toBase58(), {
      address: pot.draw.drawVrfRequest,
      fulfilled,
      randomness: fulfilled ? fxRand("draw-9-final") : null,
    });
    if (s === "live-rolling") fx.liveRollAt = 0.72;
  }
  if (s === "pot-settled" || s === "live-paid") {
    moveDraw(pot, now - (s === "live-paid" ? 6 : 95) * 60);
    settleWorld(pot, "draw-9-final", pot.draw.drawAt + 118);
    fx.settleTx.set(pot.draw.address.toBase58(), fxSig("settle-9"));
  }
  fitBeforeClose(pot);

  // ---- headline Nº 8, Sunday
  if (s === "headline-cancelled") {
    moveDraw(head, now - 2 * 3600);
    fitBeforeClose(head);
    cancelUndersold(head, (e) => !e.owner.equals(ME) && e.seq % 3 === 0);
  }
  if (s === "headline-settled") {
    // a week that sold past its minimum: four more buyers came in on the last day
    const extra: Row[] = [0, 1, 2, 3].map((i) => [`x${i}`, 25, 0, false, false, 120 - i * 30]);
    const big = buildWorld(8, "headline", SUNDAY, now - 25 * 60, { extra });
    moveDraw(big, now - 3 * 3600);
    fitBeforeClose(big);
    settleWorld(big, "draw-8-final", big.draw.drawAt + 140);
    head.draw = big.draw;
    head.entries = big.entries;
    fx.settleTx.set(big.draw.address.toBase58(), fxSig("settle-8"));
  }

  const worlds = [pot, head, next, last, lastHead];
  for (const w of worlds) {
    fx.worlds.set(w.draw.address.toBase58(), w);
    fx.entriesByDraw.set(w.draw.address.toBase58(), w.entries);
    w.entryRandomness.forEach((v, k) => fx.entryRandomness.set(k, v));
  }
  fx.entriesByDraw.set(legacy.draw.address.toBase58(), legacy.entries);
  fx.draws = worlds.map((w) => w.draw).sort((a, b) => b.id - a.id);
  fx.allEntries = worlds.flatMap((w) => w.entries).sort((a, b) => b.createdAt - a.createdAt);

  // ---- the wallet's Profile: credits it won less the credits it spent, and its play limits
  const all = worlds.flatMap((w) => w.entries).filter((e) => e.owner.equals(ME));
  const spent = all.filter((e) => e.createdAt > now - 20 * DAY).reduce((n, e) => n + e.paidLamports, Z);
  fx.profile = {
    address: profilePda(ME),
    // the credits this wallet won here went on earlier purchases; the credit scenarios hand it three
    credits: 0,
    limitLamports: Z,
    pendingLimit: Z,
    pendingFrom: 0,
    periodStart: now - 20 * DAY,
    periodSpent: spent,
    excludedUntil: 0,
  };
  if (s === "credits" || s === "confirm-credits") fx.profile.credits = 3;
  if (s === "limit") fx.profile.limitLamports = spent;
  if (s === "limits-pending") {
    fx.profile.limitLamports = sol(0.5);
    fx.profile.pendingLimit = sol(2);
    fx.profile.pendingFrom = now + 61 * 3600;
  }
  if (s === "excluded") fx.profile.excludedUntil = now + 6 * DAY + 7 * 3600;

  // ---- which draw the page opens on
  if (s.startsWith("headline")) fx.selected = 8;
  // the settled pot draw itself (the home page would otherwise move on to the next one, Nº 10)
  if (s === "pot-settled") fx.selected = 9;

  if (s === "nodraw-legacy") {
    // the program has been upgraded but no v3 draw is open yet: the legacy draw is still on chain
    return { ...fx, load: "nodraw", draws: [], worlds: new Map(), allEntries: [], entriesByDraw: new Map([[legacy.draw.address.toBase58(), legacy.entries]]) };
  }

  if (s === "open-guest") {
    fx.wallet = null;
    fx.profile = null;
  }
  if (s === "open-low") fx.wallet = { address: ME, balance: sol(0.0123) };
  if (s === "stale") fx.staleSince = now - 4 * 60;

  // ---- the reveal: this wallet's 10-ticket purchase (mid-way, then at the end), and its free entry
  if (s === "reveal" || s === "reveal-done") {
    const e = pot.entries.find((m) => m.owner.equals(ME) && m.paidCount === 10)!;
    fx.session = {
      ...revealSessionFor(e, pot.draw, pot.entryRandomness.get(e.address.toBase58())!, "buy"),
      buyTx: fxSig("buy"),
      vrfMs: 1840,
      initialShown: s === "reveal" ? 6 : 10,
    };
  }
  if (s === "reveal-free") {
    const e = pot.entries.find((m) => m.owner.equals(ME) && m.isFree)!;
    fx.session = { ...revealSessionFor(e, pot.draw, pot.entryRandomness.get(e.address.toBase58())!, "free"), buyTx: fxSig("free"), initialShown: 1 };
  }
  return fx;
}
