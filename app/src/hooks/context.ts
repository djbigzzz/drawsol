"use client";

import { createContext, useContext } from "react";
import type { PublicKey } from "@solana/web3.js";
import type {
  ConfigView,
  DrawView,
  EntryView,
  LoadState,
  PlayerView,
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
  entryRent: bigint | null;
  playerRent: bigint | null;
}

export interface DrawSolData {
  load: LoadState;
  config: ConfigView | null;
  draws: DrawView[];
  current: DrawView | null;
  vaultLamports: bigint | null;
  entries: EntryView[];
  entriesState: "loading" | "error" | "ready";
  wallet: WalletView | null;
  player: PlayerView | null;
  myEntries: EntryView[];
  /** ORAO request for the current draw (Drawing only) */
  drawRandomness: RandomnessView | null;
  costs: Costs;
  /** unix seconds, ticks every second */
  now: number;
  refresh: () => void;
  /** finds the settle_draw transaction of a settled draw (signature) */
  findSettleTx: (draw: DrawView) => Promise<string | null>;
  /** reads an ORAO request account's randomness (for recompute) */
  readOrao: (address: PublicKey) => Promise<Uint8Array | null>;
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
  firstTicket: number;
  count: number;
  stage: RevealStage;
  buyTx?: string;
  vrfRequest?: PublicKey;
  vrfStartedAt?: number;
  vrfMs?: number;
  revealTx?: string;
  /** read from Entry.tiers after the reveal tx; never invented */
  tiers?: number[];
  instantPaid?: bigint;
  error?: HumanError;
  /** tier amounts in lamports from the draw account */
  tierAmounts: bigint[];
  /** the entry's fulfilled ORAO randomness (64 bytes), for per-ticket rolls and stamp ink */
  randomness?: Uint8Array;
  /** fixtures only: how many stubs are already turned */
  initialShown?: number;
}

export type ActionKey = "buy" | "free" | "run" | "settle" | "cancel" | `refund:${string}` | `reveal:${string}`;

export interface Actions {
  phase: Partial<Record<ActionKey, TxPhase>>;
  errors: Partial<Record<ActionKey, HumanError | null>>;
  lastSig: Partial<Record<ActionKey, string>>;
  buy: (quantity: number) => void;
  claimFree: () => void;
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
