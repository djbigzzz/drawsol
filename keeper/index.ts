import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { AnchorProvider, Program, Wallet, Idl, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

// Configuration
const PROGRAM_ID = new PublicKey("Ezd47gH9g4jheYrN8M7svheSszkjpPXXvW3NHc2V4Emg");
const DRAW_NUMBER = 1;
const RPC_URL = process.env.RPC_URL || clusterApiUrl("devnet");
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(
  process.env.HOME || "~",
  ".config/solana/id.json"
);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// PDA seeds
const DRAW_STATE_SEED = "draw_state";
const VAULT_SEED = "vault";
const PRIZE_ESCROW_SEED = "prize_escrow";
const PENDING_PAYOUT_SEED = "pending_payout";

// Minimal IDL for keeper operations
const IDL: Idl = {
  version: "0.1.0",
  name: "drawsol",
  instructions: [
    {
      name: "processPayout",
      accounts: [
        { name: "drawState", isMut: false, isSigner: false },
        { name: "pendingPayout", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "winnerTokenAccount", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "triggerGrandDraw",
      accounts: [
        { name: "drawState", isMut: true, isSigner: false },
        { name: "prizeEscrow", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "DrawState",
      type: {
        kind: "struct",
        fields: [
          { name: "ticketCap", type: "u32" },
          { name: "ticketsSold", type: "u32" },
          { name: "usdcCollected", type: "u64" },
          { name: "solPriceUsd", type: "u64" },
          { name: "thresholdUsdc", type: "u64" },
          { name: "status", type: { defined: "DrawStatus" } },
          { name: "operator", type: "publicKey" },
          { name: "winner", type: { option: "publicKey" } },
          { name: "drawNumber", type: "u8" },
          { name: "vaultBump", type: "u8" },
          { name: "escrowBump", type: "u8" },
          { name: "bump", type: "u8" },
          { name: "skillAnswerHash", type: { array: ["u8", 32] } },
          { name: "usdcMint", type: "publicKey" },
        ],
      },
    },
    {
      name: "PendingPayout",
      type: {
        kind: "struct",
        fields: [
          { name: "winner", type: "publicKey" },
          { name: "amount", type: "u64" },
          { name: "dueTimestamp", type: "i64" },
          { name: "paid", type: "bool" },
          { name: "drawNumber", type: "u8" },
          { name: "slotNumber", type: "u32" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  types: [
    {
      name: "DrawStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Open" },
          { name: "ThresholdMet" },
          { name: "Drawing" },
          { name: "Settled" },
        ],
      },
    },
  ],
};

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      log(`[RETRY] ${label} attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  log(`[FAIL] ${label} failed after ${MAX_RETRIES} attempts`);
  return null;
}

function loadKeypair(): Keypair {
  const raw = fs.readFileSync(KEYPAIR_PATH, "utf-8");
  const secret = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function getPda(seeds: (Buffer | Uint8Array)[]): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

async function processPayouts(program: Program, drawNumber: number) {
  const [drawStatePda] = getPda([
    Buffer.from(DRAW_STATE_SEED),
    Buffer.from([drawNumber]),
  ]);
  const [vaultPda] = getPda([
    Buffer.from(VAULT_SEED),
    Buffer.from([drawNumber]),
  ]);

  log("Fetching draw state...");
  let drawState: any;
  try {
    drawState = await program.account.drawState.fetch(drawStatePda);
  } catch {
    log("Draw state not found — skipping");
    return;
  }

  log(`Draw #${drawNumber}: ${drawState.ticketsSold} tickets sold, status: ${JSON.stringify(drawState.status)}`);

  // Fetch all PendingPayout accounts
  const payouts = await program.account.pendingPayout.all();
  const now = Math.floor(Date.now() / 1000);

  const duePendingPayouts = payouts.filter((p: any) => {
    const data = p.account;
    return (
      !data.paid &&
      data.drawNumber === drawNumber &&
      data.dueTimestamp.toNumber() < now
    );
  });

  log(`Found ${duePendingPayouts.length} due payouts to process`);

  for (const payout of duePendingPayouts) {
    const data = payout.account as any;
    const winnerPubkey = data.winner as PublicKey;
    const amount = data.amount as BN;

    log(
      `Processing payout: ${amount.toNumber() / 1_000_000} USDC → ${winnerPubkey.toBase58()}`
    );

    const winnerTokenAccount = await getAssociatedTokenAddress(
      drawState.usdcMint,
      winnerPubkey
    );

    await retryWithBackoff(async () => {
      const tx = await program.methods
        .processPayout()
        .accounts({
          drawState: drawStatePda,
          pendingPayout: payout.publicKey,
          vault: vaultPda,
          winnerTokenAccount,
          payer: (program.provider as AnchorProvider).wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      log(`Payout processed: ${tx}`);
      return tx;
    }, `payout-${payout.publicKey.toBase58()}`);
  }
}

async function checkThreshold(program: Program, drawNumber: number) {
  const [drawStatePda] = getPda([
    Buffer.from(DRAW_STATE_SEED),
    Buffer.from([drawNumber]),
  ]);
  const [prizeEscrowPda] = getPda([
    Buffer.from(PRIZE_ESCROW_SEED),
    Buffer.from([drawNumber]),
  ]);

  let drawState: any;
  try {
    drawState = await program.account.drawState.fetch(drawStatePda);
  } catch {
    return;
  }

  // Check if threshold is met and needs trigger
  if ("thresholdMet" in drawState.status) {
    log("Threshold met! Triggering grand draw...");

    await retryWithBackoff(async () => {
      const tx = await program.methods
        .triggerGrandDraw()
        .accounts({
          drawState: drawStatePda,
          prizeEscrow: prizeEscrowPda,
          payer: (program.provider as AnchorProvider).wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      log(`Grand draw triggered: ${tx}`);
      return tx;
    }, "trigger-grand-draw");
  }
}

async function runKeeper() {
  log("=== DrawSol Keeper Bot Starting ===");
  log(`RPC: ${RPC_URL}`);
  log(`Program: ${PROGRAM_ID.toBase58()}`);
  log(`Draw: #${DRAW_NUMBER}`);

  const connection = new Connection(RPC_URL, "confirmed");
  const keypair = loadKeypair();
  const wallet = new Wallet(keypair);

  log(`Keeper wallet: ${keypair.publicKey.toBase58()}`);

  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const program = new Program(IDL, PROGRAM_ID, provider);

  // Process payouts
  await processPayouts(program, DRAW_NUMBER);

  // Check threshold
  await checkThreshold(program, DRAW_NUMBER);

  log("=== Keeper run complete ===\n");
}

// Run immediately
runKeeper().catch((err) => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
