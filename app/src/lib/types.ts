import type { PublicKey } from "@solana/web3.js";

export type DrawStatus = "draft" | "open" | "drawing" | "settled" | "cancelled";

/**
 * null: a v4 draw (SPEC-v4). "pot" / "headline": a DrawSol v3 draw still on chain (Nº 2 settled, Nº 3
 * cancelled), read through the v3 IDL for history only and mapped onto the v4 view.
 */
export type Legacy = null | "pot" | "headline";

/** One tier of the draw's instant-prize schedule, as the DrawV4 account holds it. */
export interface Tier {
  /** prize per winning number, lamports */
  amount: bigint;
  /** winning numbers in the schedule */
  count: number;
  /** winning numbers registered so far (== count once Open) */
  set: number;
  /** winning numbers handed out (and paid) so far */
  won: number;
}

/**
 * One tier of the published schedule with its winning ticket numbers, read from the Schedule account
 * (`u8[cap]`: 0 = no prize, t + 1 = tier t, bit 7 = won). Written before sales open; never changes.
 */
export interface InstantTier {
  /** the prize for one winning ticket */
  lamports: bigint;
  /** the published winning ticket numbers, ascending */
  numbers: number[];
  /** of `numbers`: those a reveal has already handed to a wallet (the won bit) */
  won: number[];
}

/**
 * Plain view of an on-chain DrawV4 account (u64 as bigint lamports) plus its Schedule. Legacy v3 draws are
 * mapped onto it (see `legacy`); the view is the only shape the rest of the app knows.
 */
export interface DrawView {
  address: PublicKey;
  id: number;
  legacy: Legacy;
  authority: PublicKey;
  status: DrawStatus;
  ticketPrice: bigint;
  /** ticket numbers are 0..ticketCap; every ticket, paid or free, takes one, so this caps all tickets */
  ticketCap: number;
  maxPerTx: number;
  /** every ticket kind */
  maxPerWallet: number;
  freeCap: number;
  createdAt: number;
  /** sales close (or at sell-out) */
  closesAt: number;
  /** the draw itself: ≥ closesAt */
  drawAt: number;
  /** only the keeper or the authority may request the draw during [drawAt, drawAt + grace) */
  publicGraceSecs: number;
  houseBps: number;
  potBps: number;
  instantBps: number;
  /** the fixed end prize, escrowed at open; paid in full once paidTickets ≥ minTickets at the draw */
  endPrizeLamports: bigint;
  minTickets: number;
  /** the tiers in use (count > 0), in schedule order */
  tiers: Tier[];
  /** Σ tiers.amount × count, escrowed at open */
  scheduleTotalLamports: bigint;
  scheduleSet: number;
  /** instant prizes paid so far */
  instantsPaid: bigint;
  /** every lamport paid for tickets */
  revenueLamports: bigint;
  houseLamports: bigint;
  houseWithdrawn: bigint;
  refundedLamports: bigint;
  paidTickets: number;
  freeTickets: number;
  /** tickets that have a number (revealed) */
  assigned: number;
  /** positions handed out: every ticket, paid or free, gets the next position at purchase */
  nextPos: number;
  entryCount: number;
  revealedEntries: number;
  drawVrfRequest: PublicKey;
  drawVrfSeed: Uint8Array;
  randomness: Uint8Array;
  winningPos: number;
  winningTicket: number;
  winningEntry: PublicKey;
  winner: PublicKey;
  /** what the winner actually received: the end prize, or the fallback pot */
  endPrizePaid: bigint;
  settledAt: number;
  prizePaid: boolean;
  escrowReturned: boolean;
  instantEscrowReturned: boolean;
  termsHash: Uint8Array;
  /** the published schedule (empty on legacy draws) */
  schedule: InstantTier[];
  /**
   * the draw always runs and never refunds (below minTickets the end prize is potBps of sales). false only
   * on a legacy v3 headline draw, which cancelled and refunded below its minimum.
   */
  guaranteed: boolean;
  /** ticket numbers are assigned at random by ORAO at reveal (v4); legacy draws numbered them sequentially */
  randomNumbers: boolean;
  /** legacy pot draws only: the instant SOL paid from the pool (DrawV3.instant_pool bookkeeping) */
  legacyInstantPool?: bigint;
}

/** Plain view of an EntryV4 account. Legacy v3 entries are mapped onto it (sequential tickets). */
export interface EntryView {
  address: PublicKey;
  draw: PublicKey;
  owner: PublicKey;
  seq: number;
  /** positions firstPos .. firstPos + count belong to this entry; the end-prize draw picks a position */
  firstPos: number;
  count: number;
  isFree: boolean;
  paidLamports: bigint;
  createdAt: number;
  /** ORAO request for this entry's ticket assignment */
  vrfRequest: PublicKey;
  vrfSeed: Uint8Array;
  /** has an ORAO roll to reveal (every v4 entry; legacy headline entries never did) */
  needsReveal: boolean;
  revealed: boolean;
  /** instant prizes paid to the owner at reveal */
  instantPaid: bigint;
  refunded: boolean;
  /** the ticket numbers, len == count once revealed (empty before); legacy: the sequential range */
  tickets: number[];
  /** per ticket: 0 = no prize, t + 1 = tier t (len == count once revealed) */
  prizes: number[];
  /** legacy v3 pot entries only: free-ticket credits won */
  legacyCreditsWon?: number;
}

export interface PlayerView {
  address: PublicKey;
  /** every kind */
  tickets: number;
  /** lamports paid for tickets */
  spent: bigint;
  /** instant SOL won */
  won: bigint;
  freeClaimed: boolean;
}

/** The wallet's global Profile (play limits). null = never created (no limits). */
export interface ProfileView {
  address: PublicKey;
  limitLamports: bigint;
  pendingLimit: bigint;
  pendingFrom: number;
  periodStart: number;
  periodSpent: bigint;
  excludedUntil: number;
}

export interface ConfigView {
  admin: PublicKey;
  keeper: PublicKey;
  nextDrawId: number;
}

/** The Pool account of a draw: the ticket numbers not yet handed out are `numbers[..remaining]`. */
export interface PoolView {
  remaining: number;
  numbers: number[];
}

/** Fulfilled (or pending) ORAO RandomnessV2 request. */
export interface RandomnessView {
  address: PublicKey;
  fulfilled: boolean;
  randomness: Uint8Array | null;
}

export type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  /** program or config account not found on chain, or no v4 draw yet */
  | { kind: "nodraw"; reason: "no-program" | "no-config" | "no-draws" }
  | { kind: "ready" };
