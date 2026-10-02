import { PublicKey } from "@solana/web3.js";

/**
 * Build-time switch for screenshot fixtures. Next inlines NEXT_PUBLIC_* at build
 * time, so in a normal build this is the literal `false` and every fixture branch
 * (and the fixtures module itself) is dropped by the bundler.
 */
export const FIXTURES = process.env.NEXT_PUBLIC_FIXTURES === "1";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export const PROGRAM_ID = new PublicKey(
  "FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb"
);

export const ORAO_PROGRAM_ID = new PublicKey(
  "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y"
);
export const ORAO_NETWORK_STATE = new PublicKey(
  "5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK"
);

export const SOURCE_URL = "https://github.com/djbigzzz/drawsol";
export const FAUCET_URL = "https://faucet.solana.com";
export const SOLFAUCET_URL = "https://solfaucet.com";
/** What "Get devnet SOL" asks the devnet faucet for, from the visitor's own browser. */
export const AIRDROP_LAMPORTS = 500_000_000;
/** Below this (or below one ticket plus fees) the stub offers "Get devnet SOL". */
export const LOW_BALANCE_LAMPORTS = BigInt(50_000_000);
/**
 * The in-app question was removed from the confirm step on this date. Draws created before it have
 * published terms (committed in terms_hash) that still mention it; the back of the ticket says so.
 */
export const QUESTION_REMOVED_AT = Math.floor(Date.UTC(2026, 9, 2) / 1000);
export const GAMBLE_AWARE_URL = "https://www.begambleaware.org";

export const MAX_PER_TX = 25;
export const CANCEL_GRACE_SECS = 48 * 3600;

/** Account sizes (8-byte discriminator + InitSpace) for rent estimates. */
export const ENTRY_SPACE = 8 + 32 + 32 + 4 + 4 + 2 + 1 + 8 + 8 + 32 + 32 + 1 + 25 + 8 + 1 + 1;
export const PLAYER_SPACE = 8 + 32 + 32 + 4 + 8 + 8 + 1 + 1;

export const solscanAccount = (addr: string) =>
  `https://solscan.io/account/${addr}?cluster=devnet`;
export const solscanTx = (sig: string) =>
  `https://solscan.io/tx/${sig}?cluster=devnet`;
