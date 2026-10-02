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
import type { RevealSession } from "@/hooks/context";
import { drawPda, entryPda, playerPda } from "@/lib/chain";

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
    termsHash: sha256(enc.encode("fixture terms")),
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

export function buildWorld(id: number, now: number, status: DrawStatus, sell = 1, alsoMine: string[] = []): FxWorld {
  const d = baseDraw(id, now, status);
  const entries: EntryView[] = [];
  const entryRandomness = new Map<string, Uint8Array>();
  let next = 0;
  const script = SCRIPT.slice(0, Math.max(0, Math.round(SCRIPT.length * sell)));
  script.forEach(([who, count, free, revealed, minsAgo], seq) => {
    const owner = who === "me" || alsoMine.includes(who) ? ME : fxKey(`player-${who}`);
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
  | "reveal-5";

/** Every scenario the fixture build understands (anything else falls back to "open"). */
export const SCENARIOS: Scenario[] = [
  "open", "open-guest", "open-low", "open-cap", "empty", "due", "drawing", "drawing-wait", "settled",
  "cancelled", "nodraw", "loading", "error", "confirm", "reveal", "reveal-done", "reveal-5",
];

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
  entryRandomness: Map<string, Uint8Array>;
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
  };
  if (s === "loading" || s === "error" || s === "nodraw") return { ...fx, load: s, wallet: null };

  let w: FxWorld;
  if (s === "empty") w = buildWorld(3, now, "open", 0);
  // wallet at its limit: three more of the scripted purchases are this wallet's, so it really holds 50
  else if (s === "open-cap") w = buildWorld(3, now, "open", 1, ["b", "c", "h"]);
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

  if (s === "open-guest") {
    fx.wallet = null;
    fx.mine = [];
    fx.player = null;
  }
  if (s === "open-low") fx.wallet = { address: ME, balance: sol(0.0123) };

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
  if (s === "reveal-5") {
    // the sealed entry (#0097–#0101), opened with "Reveal 5 tickets"
    const e = w.mine.find((m) => !m.isFree && !m.revealed)!;
    fx.session = revealSessionFor(e, w.draw, w.entryRandomness.get(e.address.toBase58())!, String(e.seq));
  }
  return fx;
}
