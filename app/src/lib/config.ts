import { PublicKey } from "@solana/web3.js";

/**
 * Build-time switch for screenshot fixtures. Next inlines NEXT_PUBLIC_* at build
 * time, so in a normal build this is the literal `false` and every fixture branch
 * (and the fixtures module itself) is dropped by the bundler.
 */
export const FIXTURES = process.env.NEXT_PUBLIC_FIXTURES === "1";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

/**
 * The site's base path ("/drawsol"), from next.config.js. Next prefixes its own routes and bundles with it
 * but leaves a plain <img src> alone, so every static file under public/ is referenced through here.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** `art("prize-500.png")` → "/drawsol/art/prize-500.png": a generated graphic in public/art. */
export const art = (file: string) => `${BASE_PATH}/art/${file}`;

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
export const GAMBLE_AWARE_URL = "https://www.begambleaware.org";

// SPEC-v4 §1 / constants.rs
/** the program's hard cap on one purchase; a draw's own max_per_tx is at most this */
export const MAX_PER_TX = 1000;
/** a draw stuck in Drawing this long after draw_at may be cancelled by anyone (refunds) */
export const CANCEL_GRACE_SECS = 48 * 3600;
/** raising (or removing) a play limit takes effect this long after it is asked for */
export const LIMIT_INCREASE_DELAY = 72 * 3600;
/** the play-limit period */
export const PERIOD_SECS = 30 * 86400;

/**
 * Compute budget a client must request for `reveal_entry` (SPEC-v4 §6): ≈ 24k + 362 CU per ticket measured;
 * the 200k default only covers ≈ 480 tickets, so every reveal sends a SetComputeUnitLimit with this.
 */
export const revealCuLimit = (count: number) => Math.min(1_400_000, 80_000 + 400 * count);

/** Account sizes (8-byte discriminator + fields) for rent estimates. EntryV4 is sized from its ticket count. */
export const entrySpace = (count: number) => 8 + 160 + (4 + 4 * count) + (4 + count);
export const PLAYER_SPACE = 8 + 32 + 32 + 4 + 8 + 8 + 1 + 1;
export const PROFILE_SPACE = 8 + 32 + 4 + 8 + 8 + 8 + 8 + 8 + 8 + 1;

export const solscanAccount = (addr: string) =>
  `https://solscan.io/account/${addr}?cluster=devnet`;
export const solscanTx = (sig: string) =>
  `https://solscan.io/tx/${sig}?cluster=devnet`;
