import type { PublicKey } from "@solana/web3.js";
import type { TierSpec } from "./fairness";

export type DrawStatus = "open" | "drawing" | "settled" | "cancelled";

/** Plain view of an on-chain Draw account (u64 as bigint lamports). */
export interface DrawView {
  address: PublicKey;
  id: number;
  authority: PublicKey;
  status: DrawStatus;
  ticketPrice: bigint;
  ticketCap: number;
  maxPerTx: number;
  maxPerWallet: number;
  freeCap: number;
  createdAt: number;
  closesAt: number;
  prizeLamports: bigint;
  iwReserveLamports: bigint;
  iwPaidLamports: bigint;
  iwDenominator: number;
  iwTiers: TierSpec[];
  proceedsLamports: bigint;
  refundedLamports: bigint;
  paidTickets: number;
  freeTickets: number;
  nextTicket: number;
  entryCount: number;
  paidEntries: number;
  revealedEntries: number;
  drawVrfRequest: PublicKey;
  drawVrfSeed: Uint8Array;
  randomness: Uint8Array;
  winningTicket: number;
  winningEntry: PublicKey;
  winner: PublicKey;
  settledAt: number;
  prizePaid: boolean;
  proceedsWithdrawn: boolean;
  reserveWithdrawn: boolean;
  termsHash: Uint8Array;
}

export interface EntryView {
  address: PublicKey;
  draw: PublicKey;
  owner: PublicKey;
  seq: number;
  firstTicket: number;
  count: number;
  isFree: boolean;
  paidLamports: bigint;
  createdAt: number;
  vrfRequest: PublicKey;
  vrfSeed: Uint8Array;
  revealed: boolean;
  /** length = count; 0 = no win, k = tier index + 1 */
  tiers: number[];
  instantPaid: bigint;
  refunded: boolean;
}

export interface PlayerView {
  address: PublicKey;
  tickets: number;
  spent: bigint;
  won: bigint;
  freeClaimed: boolean;
}

export interface ConfigView {
  admin: PublicKey;
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
  /** program or config account not found on chain */
  | { kind: "nodraw"; reason: "no-program" | "no-config" | "no-draws" }
  | { kind: "ready" };
