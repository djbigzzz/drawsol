import type { PublicKey } from "@solana/web3.js";
import type { TierSpec } from "./fairness";

export type DrawStatus = "open" | "drawing" | "settled" | "cancelled";

/**
 * pot: nightly, the grand prize is the pot (pot_bps of every paid ticket plus any unwon instant pool), with
 * instant wins. headline: weekly, a fixed escrowed prize, no instant wins, cancelled and refunded below
 * min_tickets. v2: a legacy DrawSol v2 draw (read-only history, from the v2 IDL).
 */
export type DrawKind = "pot" | "headline" | "v2";

/** Plain view of an on-chain DrawV3 account (u64 as bigint lamports). Legacy v2 draws are mapped onto it. */
export interface DrawView {
  address: PublicKey;
  id: number;
  kind: DrawKind;
  authority: PublicKey;
  status: DrawStatus;
  ticketPrice: bigint;
  /** paid tickets; free and credit tickets never count */
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
  /** headline: the escrowed prize; pot: 0; v2: the escrowed prize */
  prizeLamports: bigint;
  minTickets: number;
  floorMarginBps: number;
  potLamports: bigint;
  instantPoolLamports: bigint;
  houseLamports: bigint;
  houseWithdrawn: bigint;
  revenueLamports: bigint;
  refundedLamports: bigint;
  iwDenominator: number;
  iwTiers: TierSpec[];
  paidTickets: number;
  freeTickets: number;
  creditTickets: number;
  nextTicket: number;
  entryCount: number;
  rolledEntries: number;
  revealedEntries: number;
  drawVrfRequest: PublicKey;
  drawVrfSeed: Uint8Array;
  randomness: Uint8Array;
  winningTicket: number;
  winningEntry: PublicKey;
  winner: PublicKey;
  /** the prize actually paid at settlement (pot: pot + unwon instant pool) */
  prizePaidLamports: bigint;
  settledAt: number;
  prizePaid: boolean;
  termsHash: Uint8Array;
  /** v2 only: the instant-win SOL paid from its fixed reserve */
  legacyIwPaid?: bigint;
}

export interface EntryView {
  address: PublicKey;
  draw: PublicKey;
  owner: PublicKey;
  seq: number;
  firstTicket: number;
  /** paid + credit tickets (1 for a free entry) */
  count: number;
  paidCount: number;
  creditCount: number;
  isFree: boolean;
  paidLamports: bigint;
  createdAt: number;
  /** pot draws: the instant pool right after this purchase; SOL tiers pay a share of it */
  poolSnapshot: bigint;
  vrfRequest: PublicKey;
  vrfSeed: Uint8Array;
  /** has an ORAO roll (pot draws with tiers); headline entries never do */
  needsReveal: boolean;
  revealed: boolean;
  /** length = count; 0 = no win, k = tier index + 1 */
  tiers: number[];
  /** instant SOL actually paid to the owner */
  solPaid: bigint;
  /** free-ticket credits won */
  creditsWon: number;
  refunded: boolean;
}

export interface PlayerView {
  address: PublicKey;
  /** every kind */
  tickets: number;
  /** lamports paid for tickets */
  spent: bigint;
  /** instant SOL won */
  won: bigint;
  wonCredits: number;
  freeClaimed: boolean;
}

/** The wallet's global Profile (credits, play limits). null = never created (no limits, no credits). */
export interface ProfileView {
  address: PublicKey;
  credits: number;
  limitLamports: bigint;
  pendingLimit: bigint;
  pendingFrom: number;
  periodStart: number;
  periodSpent: bigint;
  excludedUntil: number;
}

export interface ConfigView {
  admin: PublicKey;
  /** null while the config account still has its v2 layout (before migrate_config) */
  keeper: PublicKey | null;
  nextDrawId: number;
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
  /** program or config account not found on chain, or no v3 draw yet */
  | { kind: "nodraw"; reason: "no-program" | "no-config" | "upgrading" | "no-draws" }
  | { kind: "ready" };
