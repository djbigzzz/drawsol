/**
 * Shared helpers for scripts/admin.ts and keeper/index.ts (DrawSol v2, SPEC §2).
 * Fairness functions mirror programs/drawsol/src/fairness.rs and are checked against
 * tests-svm/fixtures/fairness_vectors.json by `npx tsx scripts/check-vectors.ts`.
 */
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Drawsol } from "../app/src/idl/drawsol";

export const ROOT = path.resolve(__dirname, "..");
const IDL = JSON.parse(fs.readFileSync(path.join(ROOT, "app/src/idl/drawsol.json"), "utf8"));

export const PROGRAM_ID = new PublicKey(IDL.address);
export const ORAO_VRF_ID = new PublicKey("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
export const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
export const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(os.homedir(), ".config/solana/id.json");

export const CANCEL_GRACE_SECS = 48 * 3600;
export const RESERVE_UNLOCK_SECS = 7 * 86400;

// RandomnessV2 account (ORAO): disc[8] | tag u8 (0 pending, 1 fulfilled) | client[32] | seed[32] | randomness[64]
const RANDOMNESS_V2_DISC = Buffer.from([0x8b, 0xef, 0xb8, 0xd7, 0xe3, 0x56, 0xbf, 0xe2]);

export type DrawsolProgram = Program<Drawsol>;

// ------------------------------------------------------------------ setup

export function loadKeypair(p = KEYPAIR_PATH): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

export function makeProgram(keypair = loadKeypair(), rpcUrl = RPC_URL): DrawsolProgram {
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: "confirmed" });
  return new Program<Drawsol>(IDL as Drawsol, provider);
}

export function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

// ------------------------------------------------------------------ PDAs

const u32le = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const u64le = (n: number | bigint | BN) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n.toString()));
  return b;
};
const pda = (seeds: (Buffer | Uint8Array)[], program = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync(seeds, program)[0];

export const configPda = () => pda([Buffer.from("config")]);
export const drawPda = (id: number | bigint | BN) => pda([Buffer.from("draw"), u64le(id)]);
export const vaultPda = (draw: PublicKey) => pda([Buffer.from("vault"), draw.toBuffer()]);
export const playerPda = (draw: PublicKey, wallet: PublicKey) =>
  pda([Buffer.from("player"), draw.toBuffer(), wallet.toBuffer()]);
export const entryPda = (draw: PublicKey, seq: number) => pda([Buffer.from("entry"), draw.toBuffer(), u32le(seq)]);
export const programDataPda = () => pda([PROGRAM_ID.toBuffer()], BPF_LOADER_UPGRADEABLE_ID);
export const oraoNetworkStatePda = () => pda([Buffer.from("orao-vrf-network-configuration")], ORAO_VRF_ID);
export const oraoRequestPda = (seed: Buffer) => pda([Buffer.from("orao-vrf-randomness-request"), seed], ORAO_VRF_ID);

// ------------------------------------------------------------------ fairness (SPEC §2.3)

const sha256 = (...parts: (Buffer | Uint8Array | string)[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(typeof p === "string" ? Buffer.from(p) : p);
  return h.digest();
};

export const entryVrfSeed = (draw: PublicKey, buyer: PublicKey, seq: number, nonce: Buffer) =>
  sha256("drawsol:v2:entry", draw.toBuffer(), buyer.toBuffer(), u32le(seq), nonce);
export const drawVrfSeed = (draw: PublicKey, nextTicket: number, nonce: Buffer) =>
  sha256("drawsol:v2:draw", draw.toBuffer(), u32le(nextTicket), nonce);

export const uniformIndex = (r: bigint, n: number) => Number((r * BigInt(n)) >> 64n);
export const ticketRoll = (rnd: Buffer, ticket: number) => sha256(rnd, "ticket", u32le(ticket)).readBigUInt64LE(0);

export function ticketTier(rnd: Buffer, ticket: number, denominator: number, tiers: { odds: number }[]): number {
  if (denominator === 0) return 0;
  const x = uniformIndex(ticketRoll(rnd, ticket), denominator);
  let cum = 0;
  for (let i = 0; i < tiers.length; i++) {
    cum += tiers[i].odds;
    if (x < cum) return i + 1;
  }
  return 0;
}

export const winningTicket = (rnd: Buffer, nextTicket: number) =>
  uniformIndex(sha256(rnd, "draw").readBigUInt64LE(0), nextTicket);

/** Returns the 64 fulfilled bytes, or null while pending / missing. Throws on a foreign account. */
export async function readRandomness(connection: Connection, req: PublicKey, expectedSeed?: Uint8Array | number[]) {
  const acc = await connection.getAccountInfo(req, "confirmed");
  if (!acc) return null;
  if (!acc.owner.equals(ORAO_VRF_ID)) throw new Error(`${req} is not owned by ORAO`);
  const d = acc.data;
  if (d.length < 73 || !d.subarray(0, 8).equals(RANDOMNESS_V2_DISC)) throw new Error(`${req} is not a RandomnessV2 account`);
  if (expectedSeed && !d.subarray(41, 73).equals(Buffer.from(expectedSeed))) throw new Error(`${req}: seed mismatch`);
  if (d[8] !== 1 || d.length < 137) return null;
  return Buffer.from(d.subarray(73, 137));
}

// ------------------------------------------------------------------ chain reads

export type DrawAccount = Awaited<ReturnType<DrawsolProgram["account"]["draw"]["fetch"]>>;
export type EntryAccount = Awaited<ReturnType<DrawsolProgram["account"]["entry"]["fetch"]>>;

export const statusName = (s: object) => Object.keys(s)[0] as "open" | "drawing" | "settled" | "cancelled";
export const sol = (lamports: number | bigint | BN) => (Number(lamports.toString()) / LAMPORTS_PER_SOL).toFixed(4);
export const lamports = (solAmount: number) => new BN(Math.round(solAmount * LAMPORTS_PER_SOL).toString());

export async function fetchEntries(program: DrawsolProgram, draw: PublicKey) {
  const all = await program.account.entry.all([{ memcmp: { offset: 8, bytes: draw.toBase58() } }]);
  return all.sort((a, b) => a.account.seq - b.account.seq);
}

export async function oraoTreasury(program: DrawsolProgram) {
  const ns = await program.account.networkState.fetch(oraoNetworkStatePda());
  return ns.config.treasury as PublicKey;
}

export const isDue = (d: DrawAccount, now = Math.floor(Date.now() / 1000)) =>
  statusName(d.status) === "open" && (now >= d.closesAt.toNumber() || d.paidTickets === d.ticketCap);

// ------------------------------------------------------------------ actions (permissionless)

/** Reveals every paid, unrevealed entry whose randomness is fulfilled. Returns the number revealed. */
export async function revealReady(program: DrawsolProgram, draw: PublicKey): Promise<number> {
  const d = await program.account.draw.fetch(draw);
  if (d.reserveWithdrawn) return 0;
  let n = 0;
  for (const { publicKey, account: e } of await fetchEntries(program, draw)) {
    if (e.isFree || e.revealed) continue;
    const rnd = await readRandomness(program.provider.connection, e.vrfRequest, e.vrfSeed);
    if (!rnd) continue;
    try {
      const sig = await program.methods
        .revealEntry()
        .accountsPartial({
          draw,
          vault: vaultPda(draw),
          entry: publicKey,
          player: playerPda(draw, e.owner),
          owner: e.owner,
          vrfRequest: e.vrfRequest,
        })
        .rpc();
      const tiers = Array.from({ length: e.count }, (_, i) => ticketTier(rnd, e.firstTicket + i, d.iwDenominator, d.iwTiers));
      log(`revealed entry #${e.seq} (${e.count} tickets from #${e.firstTicket}) tiers=[${tiers.join(",")}] ${sig}`);
      n++;
    } catch (err) {
      log(`reveal of entry #${e.seq} failed:`, (err as Error).message);
    }
  }
  return n;
}

/** request_draw for a due Open draw. Returns the ORAO request (or null if it cancelled for no tickets). */
export async function requestDraw(program: DrawsolProgram, draw: PublicKey): Promise<PublicKey | null> {
  const d = await program.account.draw.fetch(draw);
  const nonce = randomBytes(16);
  const seed = drawVrfSeed(draw, d.nextTicket, nonce);
  const vrfRequest = oraoRequestPda(seed);
  const sig = await program.methods
    .requestDraw(Array.from(nonce))
    .accountsPartial({
      draw,
      vault: vaultPda(draw),
      authority: d.authority,
      payer: program.provider.publicKey!,
      vrfRequest,
      vrfConfig: oraoNetworkStatePda(),
      vrfTreasury: await oraoTreasury(program),
    })
    .rpc();
  if (d.nextTicket === 0) {
    log(`draw #${d.id} had no tickets: cancelled, prize + reserve returned to authority ${sig}`);
    return null;
  }
  log(`draw #${d.id} requested: ${d.nextTicket} tickets, ORAO request ${vrfRequest} ${sig}`);
  return vrfRequest;
}

/** settle_draw if the draw randomness is fulfilled. Returns true when settled. */
export async function settleIfReady(program: DrawsolProgram, draw: PublicKey): Promise<boolean> {
  const d = await program.account.draw.fetch(draw);
  if (statusName(d.status) !== "drawing") return false;
  const rnd = await readRandomness(program.provider.connection, d.drawVrfRequest, d.drawVrfSeed);
  if (!rnd) return false;
  const w = winningTicket(rnd, d.nextTicket);
  const entries = await fetchEntries(program, draw);
  const hit = entries.find(({ account: e }) => w >= e.firstTicket && w < e.firstTicket + e.count);
  if (!hit) throw new Error(`no entry holds winning ticket ${w}`);
  const sig = await program.methods
    .settleDraw()
    .accountsPartial({
      draw,
      vault: vaultPda(draw),
      vrfRequest: d.drawVrfRequest,
      winningEntry: hit.publicKey,
      winner: hit.account.owner,
    })
    .rpc();
  log(`draw #${d.id} settled: ticket #${w} (entry #${hit.account.seq}) → ${hit.account.owner}, ${sol(d.prizeLamports)} SOL ${sig}`);
  return true;
}

/** cancel_draw once the randomness grace period is over. */
export async function cancelIfStuck(program: DrawsolProgram, draw: PublicKey, now = Math.floor(Date.now() / 1000)) {
  const d = await program.account.draw.fetch(draw);
  if (statusName(d.status) !== "drawing" || now <= d.closesAt.toNumber() + CANCEL_GRACE_SECS) return false;
  if (await readRandomness(program.provider.connection, d.drawVrfRequest, d.drawVrfSeed)) return false;
  const sig = await program.methods.cancelDraw().accountsPartial({ draw }).rpc();
  log(`draw #${d.id} cancelled (randomness timeout) ${sig}`);
  return true;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
