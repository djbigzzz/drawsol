import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "Ezd47gH9g4jheYrN8M7svheSszkjpPXXvW3NHc2V4Emg"
);

export const USDC_MINT_DEVNET = new PublicKey(
  "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"
);

export const USDC_MINT_MAINNET = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

export const ORAO_VRF_PROGRAM = new PublicKey(
  "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
);

export const DRAW_NUMBER = 1;
export const TICKET_PRICE_USDC = 1.99;
export const TICKET_CAP = 25_000;
export const GRAND_PRIZE_SOL = 100;

export const DISCOUNT_TIERS = [
  { min: 10, max: 29, discount: 10, label: "10% OFF" },
  { min: 30, max: 69, discount: 20, label: "20% OFF" },
  { min: 70, max: 100, discount: 30, label: "30% OFF" },
];

export const PRIZE_TABLE = [
  { amount: 50, count: 10, odds: "1 in 2,500" },
  { amount: 25, count: 20, odds: "1 in 1,250" },
  { amount: 10, count: 100, odds: "1 in 250" },
  { amount: 5, count: 600, odds: "1 in 42" },
];

// PDA seeds
export const DRAW_STATE_SEED = "draw_state";
export const VAULT_SEED = "vault";
export const PRIZE_ESCROW_SEED = "prize_escrow";
export const TICKET_SEED = "ticket";
export const PENDING_PAYOUT_SEED = "pending_payout";
export const FREE_ENTRY_SEED = "free_entry";
