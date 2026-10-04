"use client";

import { createContext, useContext } from "react";
import type { PublicKey } from "@solana/web3.js";
import type {
  ConfigView,
  DrawView,
  EntryView,
  LoadState,
  PlayerView,
  ProfileView,
  RandomnessView,
} from "@/lib/types";
import type { HumanError } from "@/lib/errors";
import type { TxPhase } from "@/lib/tx";

export interface WalletView {
  address: PublicKey;
  /** lamports; null while loading */
  balance: bigint | null;
}

export interface Costs {
  oraoFee: bigint | null;
  /** rent of a one-ticket EntryV4 account; the account grows 5 bytes per further ticket */
  entryRentBase: bigint | null;
  entryRentPerTicket: bigint | null;
  playerRent: bigint | null;
  /** the wallet's Profile account (play limits), created on its first entry */
  profileRent: bigint | null;
}

/** Rent of an EntryV4 account holding `count` tickets, from the two figures read; null until both are known. */
export function entryRentFor(c: Costs, count: number): bigint | null {
  if (c.entryRentBase === null || c.entryRentPerTicket === null) return null;
  return c.entryRentBase + c.entryRentPerTicket * BigInt(Math.max(0, count - 1));
}

export interface DrawSolData {
  load: LoadState;
  config: ConfigView | null;
  /** every v4 draw, newest id first */
  draws: DrawView[];
  /** the v3 draws still on chain (read-only history; closed one by one, then empty) */
  legacyDraws: DrawView[];
  /** the draw this page shows: chosen with select() (/live: ?n=), else the featured draw */
  current: DrawView | null;
  /** show another draw (/live: ?n=). null returns to the featured draw. */
  select: (id: number | null) => void;
  /** SOL in USD from a live quote; null when no quote is available (USD figures are then not shown) */
  solUsd: number | null;
  vaultLamports: bigint | null;
  /** ticket numbers still in the current draw's Pool account; null until read (legacy draws have no pool) */
  poolRemaining: number | null;
  entries: EntryView[];
  entriesState: "loading" | "error" | "ready";
  wallet: WalletView | null;
  player: PlayerView | null;
  /** the wallet's global Profile: play limits (null = never created) */
  profile: ProfileView | null;
  profileState: "loading" | "error" | "ready";
  myEntries: EntryView[];
  /** read state of `player` + `myEntries` for the connected wallet; show no wallet counts unless "ready" */
  myState: "loading" | "error" | "ready";
  /** ORAO request for the current draw (Drawing only) */
  drawRandomness: RandomnessView | null;
  costs: Costs;
  /** unix seconds, ticks every second */
  now: number;
  refresh: () => void;
  /**
   * Set while polls of the current draw keep failing after a good read: the unix time of the last good
   * read. The page keeps what it read, marked stale; it never invents a newer number.
   */
  staleSince: number | null;
  /** seconds until the next poll while stale (backing off 15 → 30 → 60 s) */
  retryIn: number | null;
  /** every Entry account of the program, all draws (winners feed and counters) */
  allEntries: EntryView[];
  allEntriesState: "loading" | "error" | "ready";
  /** every Entry account of one draw (the per-draw page; legacy v3 draws read through the v3 IDL) */
  fetchDrawEntries: (draw: DrawView) => Promise<EntryView[]>;
  /**
   * finds the settle_draw transaction of a settled draw (signature); null when the RPC has no such
   * transaction indexed. Throws when the search itself fails, so the UI can say so instead.
   */
  findSettleTx: (draw: DrawView) => Promise<string | null>;
  /** reads an ORAO request account's randomness (for recompute) */
  readOrao: (address: PublicKey) => Promise<Uint8Array | null>;
  /** fixture builds only: hold the /live barcode roll at this point (0–1) for a still frame */
  stillRoll?: number;
}

export const DataContext = createContext<DrawSolData | null>(null);

export function useDrawSol(): DrawSolData {
  const v = useContext(DataContext);
  if (!v) throw new Error("useDrawSol outside provider");
  return v;
}

export type RevealStage = "confirming" | "vrf" | "revealing" | "revealed" | "failed";

export interface RevealSession {
  entry: PublicKey;
  firstPos: number;
  count: number;
  stage: RevealStage;
  buyTx?: string;
  vrfRequest?: PublicKey;
  vrfStartedAt?: number;
  vrfMs?: number;
  revealTx?: string;
  /** the ticket numbers ORAO assigned, read from Entry.tickets after the reveal tx; never invented */
  tickets?: number[];
  /** per ticket: 0 = no prize, t + 1 = tier t, read from Entry.prizes */
  prizes?: number[];
  /** instant SOL paid, read from Entry.instant_paid */
  instantPaid?: bigint;
  /** a free entry (one ticket) rather than a purchase */
  free?: boolean;
  error?: HumanError;
  /** the entry's fulfilled ORAO randomness (64 bytes) */
  randomness?: Uint8Array;
  /** fixtures only: how many stubs are already turned */
  initialShown?: number;
}

export type ActionKey =
  | "buy"
  | "free"
  | "airdrop"
  | "run"
  | "settle"
  | "cancel"
  | "limit"
  | "exclude"
  | `refund:${string}`
  | `reveal:${string}`;

export interface Actions {
  phase: Partial<Record<ActionKey, TxPhase>>;
  errors: Partial<Record<ActionKey, HumanError | null>>;
  lastSig: Partial<Record<ActionKey, string>>;
  /** buy_tickets(quantity): the purchase, then the reveal session for the new entry */
  buy: (quantity: number) => void;
  claimFree: () => void;
  /** set_limit: lamports per 30-day period, 0 = none (a raise or removal waits 72 h) */
  setLimit: (lamports: bigint) => void;
  /** self_exclude until a unix time; it can only be extended */
  selfExclude: (until: number) => void;
  /** devnet only: ask the faucet for SOL from this browser (connection.requestAirdrop), then confirm it */
  airdrop: () => void;
  runDraw: () => void;
  settle: () => void;
  cancel: () => void;
  refund: (entry: EntryView) => void;
  reveal: (entry: EntryView) => void;
  session: RevealSession | null;
  closeSession: () => void;
  clearError: (k: ActionKey) => void;
  /** null when the wallet adapter is in charge; otherwise a notice to show */
  disabledReason: string | null;
}

export const ActionsContext = createContext<Actions | null>(null);

export function useActions(): Actions {
  const v = useContext(ActionsContext);
  if (!v) throw new Error("useActions outside provider");
  return v;
}
