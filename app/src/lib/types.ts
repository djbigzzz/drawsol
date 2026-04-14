import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

export interface DrawState {
  ticketCap: number;
  ticketsSold: number;
  usdcCollected: BN;
  solPriceUsd: BN;
  thresholdUsdc: BN;
  status: DrawStatus;
  operator: PublicKey;
  winner: PublicKey | null;
  drawNumber: number;
  vaultBump: number;
  escrowBump: number;
  bump: number;
  skillAnswerHash: number[];
  usdcMint: PublicKey;
}

export type DrawStatus =
  | { open: {} }
  | { thresholdMet: {} }
  | { drawing: {} }
  | { settled: {} };

export interface TicketData {
  owner: PublicKey;
  slotNumber: number;
  timestamp: BN;
  freeEntry: boolean;
  instantWinAmount: BN;
  instantWinResolved: boolean;
  drawNumber: number;
  bump: number;
}

export interface PendingPayoutData {
  winner: PublicKey;
  amount: BN;
  dueTimestamp: BN;
  paid: boolean;
  drawNumber: number;
  slotNumber: number;
  bump: number;
}

export function getStatusString(status: DrawStatus): string {
  if ("open" in status) return "Open";
  if ("thresholdMet" in status) return "Threshold Met";
  if ("drawing" in status) return "Drawing";
  if ("settled" in status) return "Settled";
  return "Unknown";
}

export function isOpen(status: DrawStatus): boolean {
  return "open" in status;
}
