/**
 * FIXTURE DATA — screenshots only. This module is reachable only when the app is
 * built with NEXT_PUBLIC_FIXTURES=1; the production bundle never includes it.
 * Results are still computed with fairness.ts from (fixture) randomness, so the
 * screenshots exercise the real result code paths.
 */
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { utils } from "@coral-xyz/anchor";
import { rollEntry, winningTicket } from "@/lib/fairness";
import type { DrawStatus, DrawView, EntryView, PlayerView, RandomnessView } from "@/lib/types";
import type { Actions, RevealSession } from "@/hooks/context";
import { drawPda, entryPda, playerPda } from "@/lib/chain";
import { QUESTION_TERMS_HASHES } from "@/lib/config";

const enc = new TextEncoder();
const LAMPORTS = BigInt(1_000_000_000);
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

export const ME = fxKey("me");
const OPERATOR = fxKey("operator");

const TIERS = [
  { amount: sol(0.2), odds: 10 },
  { amount: sol(0.05), odds: 40 },
  { amount: sol(0.01), odds: 150 },
  { amount: BigInt(0), odds: 0 },
];

function baseDraw(id: number, now: number, status: DrawStatus): DrawView {
  return {
    address: drawPda(id),
    id,
    authority: OPERATOR,
    status,
    ticketPrice: sol(0.01),
    ticketCap: 150,
    maxPerTx: 25,
    maxPerWallet: 50,
    freeCap: 15,
    createdAt: now - 3 * 86400 - 4 * 3600,
    closesAt: now + 2 * 86400 + 5 * 3600 + 31 * 60 + 12,
    prizeLamports: sol(1),
    iwReserveLamports: sol(2),
    iwPaidLamports: BigInt(0),
    iwDenominator: 1000,
    iwTiers: TIERS,
    proceedsLamports: BigInt(0),
    refundedLamports: BigInt(0),
    paidTickets: 0,
    freeTickets: 0,
    nextTicket: 0,
    entryCount: 0,
    paidEntries: 0,
    revealedEntries: 0,
    drawVrfRequest: PublicKey.default,
    drawVrfSeed: new Uint8Array(32),
    randomness: new Uint8Array(64),
    winningTicket: 0,
    winningEntry: PublicKey.default,
    winner: PublicKey.default,
    settledAt: 0,
    prizePaid: false,
    proceedsWithdrawn: false,
    reserveWithdrawn: false,
    // Draw 1's real published terms hash (they mention the since-removed question), so the note shows
    termsHash: Uint8Array.from(QUESTION_TERMS_HASHES[1].match(/../g)!.map((x) => parseInt(x, 16))),
  };
}

/** [owner label, count, free?, revealed?, minutes ago] */
const SCRIPT: [string, number, boolean, boolean, number][] = [
  ["a", 5, false, true, 3900],
  ["b", 1, false, true, 3600],
  ["c", 25, false, true, 3100],
  ["me", 10, false, true, 2900],
  ["d", 1, true, true, 2500],
  ["e", 3, false, true, 1900],
  ["f", 12, false, true, 1500],
  ["g", 2, false, true, 980],
  ["me", 1, true, true, 640],
  ["h", 8, false, true, 410],
  ["i", 25, false, true, 180],
  ["j", 4, false, false, 42],
  ["me", 5, false, false, 6],
];

export interface FxWorld {
  draw: DrawView;
  entries: EntryView[];
  mine: EntryView[];
  player: PlayerView;
  entryRandomness: Map<string, Uint8Array>;
}

export function buildWorld(id: number, now: number, status: DrawStatus, sell = 1, alsoMine: string[] = [], freeNotMine = false): FxWorld {
  const d = baseDraw(id, now, status);
  const entries: EntryView[] = [];
  const entryRandomness = new Map<string, Uint8Array>();
  let next = 0;
  const script = SCRIPT.slice(0, Math.max(0, Math.round(SCRIPT.length * sell)));
  script.forEach(([who, count, free, revealed, minsAgo], seq) => {
    // freeNotMine: this wallet's scripted free entry belongs to another wallet, so this one can still claim
    const owner = who === "me" && free && freeNotMine ? fxKey("player-k") : who === "me" || alsoMine.includes(who) ? ME : fxKey(`player-${who}`);
    const address = entryPda(d.address, seq);
    const rand = fxRand(`entry-${id}-${seq}`);
    entryRandomness.set(address.toBase58(), rand);
    const tiers = free || !revealed ? new Array(count).fill(0) : rollEntry(rand, next, count, d.iwDenominator, d.iwTiers);
    const instantPaid = tiers.reduce((n, t) => n + (t > 0 ? d.iwTiers[t - 1].amount : BigInt(0)), BigInt(0));
    entries.push({
      address,
      draw: d.address,
      owner,
      seq,
      firstTicket: next,
      count,
      isFree: free,
      paidLamports: free ? BigInt(0) : d.ticketPrice * BigInt(count),
      createdAt: now - minsAgo * 60,
      vrfRequest: free ? PublicKey.default : fxKey(`vrf-${id}-${seq}`),
      vrfSeed: new Uint8Array(32),
      revealed: free || revealed,
      tiers,
      instantPaid,
      refunded: false,
    });
    next += count;
  });
  for (const e of entries) {
    if (e.isFree) d.freeTickets += e.count;
    else {
      d.paidTickets += e.count;
      d.paidEntries += 1;
      d.proceedsLamports += e.paidLamports;
      if (e.revealed) d.revealedEntries += 1;
      d.iwPaidLamports += e.instantPaid;
    }
  }
  d.nextTicket = next;
  d.entryCount = entries.length;
  const mine = entries.filter((e) => e.owner.equals(ME));
  const player: PlayerView = {
    address: playerPda(d.address, ME),
    tickets: mine.reduce((n, e) => n + e.count, 0),
    spent: mine.reduce((n, e) => n + e.paidLamports, BigInt(0)),
    won: mine.reduce((n, e) => n + e.instantPaid, BigInt(0)),
    freeClaimed: mine.some((e) => e.isFree),
  };
  return { draw: d, entries: entries.sort((a, b) => b.seq - a.seq), mine: mine.sort((a, b) => b.seq - a.seq), player, entryRandomness };
}

/**
 * The program never sells a ticket after the close: once a scenario has moved closesAt into the
 * past, slide the whole purchase history (and the draw's opening) back so the newest entry lands
 * a minute before the close. `mine` holds the same objects as `entries`, so both move together.
 */
export function fitBeforeClose(w: FxWorld) {
  if (!w.entries.length) return w;
  const latest = Math.max(...w.entries.map((e) => e.createdAt));
  const shift = latest - (w.draw.closesAt - 60);
  if (shift > 0) {
    for (const e of w.entries) e.createdAt -= shift;
    w.draw.createdAt -= shift;
  }
  return w;
}

export function settle(w: FxWorld, now: number, label: string) {
  const d = w.draw;
  const r = fxRand(label);
  d.status = "settled";
  d.closesAt = now - 2 * 86400;
  d.drawVrfRequest = fxKey(`drawvrf-${label}`);
  d.randomness = r;
  d.winningTicket = winningTicket(r, d.nextTicket);
  const hit = w.entries.find((e) => e.firstTicket <= d.winningTicket && d.winningTicket < e.firstTicket + e.count)!;
  d.winningEntry = hit.address;
  d.winner = hit.owner;
  d.settledAt = now - 2 * 86400 + 95;
  d.prizePaid = true;
  for (const e of w.entries) {
    if (!e.revealed) {
      e.revealed = true;
      const rand = w.entryRandomness.get(e.address.toBase58())!;
      e.tiers = rollEntry(rand, e.firstTicket, e.count, d.iwDenominator, d.iwTiers);
      e.instantPaid = e.tiers.reduce((n, t) => n + (t > 0 ? d.iwTiers[t - 1].amount : BigInt(0)), BigInt(0));
    }
  }
  return w;
}

export type Scenario =
  | "open"
  | "open-guest"
  | "open-low"
  | "open-cap"
  | "open-max"
  | "open-free"
  | "open-free-claimed"
  | "open-free-out"
  | "open-free-guest"
  | "confirm-free"
  | "open-lowish"
  | "open-low-pending"
  | "open-low-failed"
  | "open-low-done"
  | "empty"
  | "due"
  | "drawing"
  | "drawing-wait"
  | "settled"
  | "cancelled"
  | "nodraw"
  | "loading"
  | "error"
  | "confirm"
  | "reveal"
  | "reveal-done"
  | "reveal-5"
  | "reveal-buying"
  | "reveal-wait"
  | "reveal-approve"
  | "reveal-failed"
  | "reveal-nowin"
  | "open-free-pending"
  | "open-free-failed"
  | "confirm-free-claimed"
  | "confirm-max"
  | "stale"
  | "winners-empty"
  | "settle-error"
  | "draw-settled"
  | "draw-open"
  | "draw-empty"
  | "draw-missing";

/** Every scenario the fixture build understands (anything else falls back to "open"). */
export const SCENARIOS: Scenario[] = [
  "open", "open-guest", "open-low", "open-cap", "open-max", "open-free", "open-free-claimed", "open-free-out", "open-free-guest",
  "confirm-free", "open-lowish", "open-low-pending", "open-low-failed", "open-low-done", "empty", "due", "drawing", "drawing-wait", "settled",
  "cancelled", "nodraw", "loading", "error", "confirm", "reveal", "reveal-done", "reveal-5",
  "reveal-buying", "reveal-wait", "reveal-approve", "reveal-failed", "reveal-nowin",
  "open-free-pending", "open-free-failed", "confirm-free-claimed", "confirm-max", "stale", "winners-empty", "settle-error",
  "draw-settled", "draw-open", "draw-empty", "draw-missing",
];

/** The first other wallet whose revealed, paid entry won nothing (computed by fairness.ts, not chosen). */
function noWinLabel(now: number): string | null {
  const w = buildWorld(3, now, "open");
  const e = w.entries
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .find((x) => !x.owner.equals(ME) && !x.isFree && x.revealed && x.count >= 2 && x.instantPaid === BigInt(0));
  return e ? SCRIPT[e.seq][0] : null;
}

/** A revealed session for one entry, with tiers recomputed by fairness.ts from its randomness. */
export function revealSessionFor(e: EntryView, d: DrawView, rand: Uint8Array, label: string): RevealSession {
  const tiers = rollEntry(rand, e.firstTicket, e.count, d.iwDenominator, d.iwTiers);
  const instantPaid = tiers.reduce((n, t) => n + (t > 0 ? d.iwTiers[t - 1].amount : BigInt(0)), BigInt(0));
  return {
    entry: e.address,
    firstTicket: e.firstTicket,
    count: e.count,
    stage: "revealed",
    vrfRequest: e.vrfRequest,
    vrfMs: 1800,
    revealTx: fxSig(`reveal-${label}`),
    tiers,
    instantPaid,
    tierAmounts: d.iwTiers.map((t) => t.amount),
    randomness: rand,
  };
}

export interface FxState {
  load: "ready" | "loading" | "error" | "nodraw";
  draws: DrawView[];
  current: DrawView | null;
  vault: bigint | null;
  entries: EntryView[];
  mine: EntryView[];
  player: PlayerView | null;
  wallet: { address: PublicKey; balance: bigint | null } | null;
  drawRandomness: RandomnessView | null;
  session: RevealSession | null;
  settleTx: Map<string, string>;
  /** settle-error: the settlement search itself fails (an RPC error), as opposed to finding nothing */
  settleTxFails?: boolean;
  entryRandomness: Map<string, Uint8Array>;
  /** every draw's Entry accounts, keyed by draw address (the per-draw page) */
  entriesByDraw: Map<string, EntryView[]>;
  /** every Entry account of every draw (winners feed) */
  allEntries: EntryView[];
  /** stale: unix time of the last good read while polls fail */
  staleSince?: number;
  nextDrawId: number;
  /** in-flight, failed or finished actions to start from (airdrop states) */
  phase?: Actions["phase"];
  errors?: Actions["errors"];
  lastSig?: Actions["lastSig"];
}

export function scenario(s: Scenario, now: number): FxState {
  const past2 = fitBeforeClose(settle(buildWorld(2, now - 9 * 86400, "open"), now - 9 * 86400, "draw-2"));
  const past1 = buildWorld(1, now - 20 * 86400, "cancelled", 0);
  past1.draw.closesAt = now - 18 * 86400;
  const settleTx = new Map([[past2.draw.address.toBase58(), fxSig("settle-2")]]);

  const vaultOf = (d: DrawView) =>
    d.prizeLamports * BigInt(d.prizePaid ? 0 : 1) + d.iwReserveLamports - d.iwPaidLamports + d.proceedsLamports - d.refundedLamports;

  const fx: FxState = {
    load: "ready",
    draws: [],
    current: null,
    vault: null,
    entries: [],
    mine: [],
    player: null,
    wallet: { address: ME, balance: sol(4.2137) },
    drawRandomness: null,
    session: null,
    settleTx,
    entryRandomness: new Map(),
    entriesByDraw: new Map(),
    allEntries: [],
    nextDrawId: 4,
  };
  if (s === "loading" || s === "error" || s === "nodraw") return { ...fx, load: s, wallet: null };

  let w: FxWorld;
  // a purchase that won nothing: one of the scripted no-win entries is this wallet's
  const nowin = s === "reveal-nowin" ? noWinLabel(now) : null;
  if (s === "empty" || s === "winners-empty") w = buildWorld(3, now, "open", 0);
  else if (nowin) w = buildWorld(3, now, "open", 1, [nowin]);
  // wallet at its limit: three more of the scripted purchases are this wallet's, so it really holds 50
  else if (s === "open-cap") w = buildWorld(3, now, "open", 1, ["b", "c", "h"]);
  // the free-entry tab, claimable: this wallet's scripted free entry (#0059) belongs to someone else
  else if (
    s === "open-free" ||
    s === "open-free-out" ||
    s === "confirm-free" ||
    s === "open-free-guest" ||
    s === "open-lowish" ||
    s === "open-free-pending" ||
    s === "open-free-failed"
  )
    w = buildWorld(3, now, "open", 1, [], true);
  else w = buildWorld(3, now, "open");

  if (s === "due") {
    w.draw.closesAt = now - 40 * 60;
  }
  if (s === "drawing" || s === "drawing-wait") {
    w.draw.status = "drawing";
    w.draw.closesAt = now - 12 * 60;
    w.draw.drawVrfRequest = fxKey("drawvrf-3");
    fx.drawRandomness = {
      address: w.draw.drawVrfRequest,
      fulfilled: s === "drawing",
      randomness: s === "drawing" ? fxRand("draw-3-final") : null,
    };
  }
  if (s === "settled") {
    settle(w, now, "draw-3-final");
    w.draw.settledAt = now - 3 * 3600;
    w.draw.closesAt = now - 3 * 3600 - 300;
    settleTx.set(w.draw.address.toBase58(), fxSig("settle-3"));
  }
  if (s === "cancelled") {
    w.draw.status = "cancelled";
    w.draw.closesAt = now - 3 * 86400;
    // three entries already refunded
    let n = 0;
    for (const e of w.entries) {
      if (!e.isFree && !e.owner.equals(ME) && n < 3) {
        e.refunded = true;
        w.draw.refundedLamports += e.paidLamports;
        n++;
      }
    }
  }

  // no purchase after the close (due, drawing, settled, cancelled)
  fitBeforeClose(w);

  // keep the Player account consistent with entries revealed during settlement
  w.player.won = w.mine.reduce((n, e) => n + e.instantPaid, BigInt(0));
  fx.current = w.draw;
  fx.entries = w.entries;
  fx.mine = w.mine;
  fx.player = w.player;
  fx.vault = vaultOf(w.draw);
  fx.draws = [w.draw, past2.draw, past1.draw];
  fx.entryRandomness = w.entryRandomness;
  fx.entriesByDraw = new Map([
    [w.draw.address.toBase58(), w.entries],
    [past2.draw.address.toBase58(), past2.entries],
    [past1.draw.address.toBase58(), past1.entries],
  ]);
  // no winners anywhere yet: only the empty open draw and the cancelled one with no tickets
  if (s === "winners-empty") {
    fx.draws = [w.draw, past1.draw];
    fx.entriesByDraw.delete(past2.draw.address.toBase58());
  }
  fx.allEntries = Array.from(fx.entriesByDraw.values())
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt);
  if (s === "settle-error") fx.settleTxFails = true;
  // the last good read was four minutes ago; two polls since have failed
  if (s === "stale") fx.staleSince = now - 4 * 60;
  // a free claim in flight, and one the wallet declined
  if (s === "open-free-pending") fx.phase = { free: "confirming" };
  if (s === "open-free-failed") fx.errors = { free: { code: "Rejected", message: "You declined in your wallet. Nothing was sent." } };

  // free entries all claimed: the draw's cap is the two already taken (#0041 and #0059), none by this wallet
  if (s === "open-free-out") w.draw.freeCap = w.draw.freeTickets;
  if (s === "open-guest" || s === "open-free-guest") {
    fx.wallet = null;
    fx.mine = [];
    fx.player = null;
  }
  // low balance: below one ticket plus fees (open-low*), or enough for a ticket but under 0.05 SOL (open-lowish)
  if (s === "open-low" || s === "open-low-pending" || s === "open-low-failed") fx.wallet = { address: ME, balance: sol(0.0123) };
  if (s === "open-lowish") fx.wallet = { address: ME, balance: sol(0.031) };
  if (s === "open-low-pending") fx.phase = { airdrop: "confirming" };
  if (s === "open-low-failed")
    fx.errors = {
      airdrop: { code: "RateLimited", message: "The devnet faucet is turning away requests from this connection for now (429 Too Many Requests). No SOL was sent." },
    };
  // the faucet's 0.5 SOL has landed: 0.0123 + 0.5
  if (s === "open-low-done") {
    fx.wallet = { address: ME, balance: sol(0.5123) };
    fx.phase = { airdrop: "done" };
    fx.lastSig = { airdrop: fxSig("airdrop") };
  }

  if (s === "reveal" || s === "reveal-done") {
    // the wallet's 10-ticket entry, revealed on-chain; the still frame pauses mid-way (or at the end)
    const e = w.mine.find((m) => !m.isFree && m.count === 10)!;
    const rand = w.entryRandomness.get(e.address.toBase58())!;
    fx.session = {
      entry: e.address,
      firstTicket: e.firstTicket,
      count: e.count,
      stage: "revealed",
      buyTx: fxSig("buy"),
      vrfRequest: e.vrfRequest,
      vrfMs: 1840,
      revealTx: fxSig("reveal"),
      tiers: e.tiers,
      instantPaid: e.instantPaid,
      tierAmounts: w.draw.iwTiers.map((t) => t.amount),
      randomness: rand,
      initialShown: s === "reveal" ? 6 : 10,
    };
  }
  // the stages before any result is known, on a fresh purchase of 10 (#0031–#0040): covers on, no tiers
  if (s === "reveal-buying" || s === "reveal-wait" || s === "reveal-approve") {
    const e = w.mine.find((m) => !m.isFree && m.count === 10)!;
    const stage = s === "reveal-buying" ? "confirming" : s === "reveal-wait" ? "vrf" : "revealing";
    fx.session = {
      entry: e.address,
      firstTicket: e.firstTicket,
      count: e.count,
      stage,
      buyTx: stage === "confirming" ? undefined : fxSig("buy"),
      vrfRequest: stage === "confirming" ? undefined : e.vrfRequest,
      vrfMs: stage === "revealing" ? 1840 : undefined,
      randomness: stage === "revealing" ? w.entryRandomness.get(e.address.toBase58()) : undefined,
      tierAmounts: w.draw.iwTiers.map((t) => t.amount),
    };
  }
  // "Reveal 5 tickets" on the sealed entry, declined in the wallet: covers stay on, "Try the reveal again"
  if (s === "reveal-failed") {
    const e = w.mine.find((m) => !m.isFree && !m.revealed)!;
    fx.session = {
      entry: e.address,
      firstTicket: e.firstTicket,
      count: e.count,
      stage: "failed",
      vrfRequest: e.vrfRequest,
      vrfMs: 1800,
      randomness: w.entryRandomness.get(e.address.toBase58()),
      tierAmounts: w.draw.iwTiers.map((t) => t.amount),
      error: { code: "Rejected", message: "You declined in your wallet. Nothing was sent." },
    };
  }
  // a fresh purchase whose results (fairness.ts, from its fixture randomness) are all "no win", at the end
  if (s === "reveal-nowin" && nowin) {
    const e = w.mine.find((m) => !m.isFree && m.revealed && m.instantPaid === BigInt(0) && m.count >= 2)!;
    fx.session = { ...revealSessionFor(e, w.draw, w.entryRandomness.get(e.address.toBase58())!, String(e.seq)), buyTx: fxSig("buy-nowin"), initialShown: e.count };
  }
  if (s === "reveal-5") {
    // the sealed entry (#0097–#0101), opened with "Reveal 5 tickets"
    const e = w.mine.find((m) => !m.isFree && !m.revealed)!;
    fx.session = revealSessionFor(e, w.draw, w.entryRandomness.get(e.address.toBase58())!, String(e.seq));
  }
  return fx;
}
