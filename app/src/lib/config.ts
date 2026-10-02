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
 * terms_hash values (hex) of published terms that mention the in-app question, removed from the app on
 * 2 Oct 2026: scripts/terms/draw-0.md and draw-1.md, as committed on-chain at create_draw. The back of the
 * ticket says so for those draws only. Newer terms (scripts/terms.md v3) have no question.
 */
export const QUESTION_TERMS_HASHES = [
  "af22f9dfb92c6a7a6101136632acfffd42bcf9bcbfa9d69c360f9db96e8ff35f",
  "8cdfab33b62705ebbc2c6d344d28a6e811eeade80ffb87e203d9170e48ece441",
];
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
