/**
 * Shared helpers for scripts/admin.ts, scripts/e2e-devnet-v4.ts and keeper/index.ts (DrawSol v4, SPEC-v4).
 * Fairness functions mirror programs/drawsol/src/fairness.rs and are checked against
 * tests-svm/fixtures/fairness_vectors.json by `npx tsx scripts/check-vectors.ts`.
 *
 * The IDL comes from target/idl-v4 (written by `anchor build` + the copy step in programs/drawsol/BUILD.md);
 * app/ keeps its own copy.
 */
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createHash, randomBytes } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Drawsol } from "../target/idl-v4/drawsol";

export const ROOT = path.resolve(__dirname, "..");
const IDL = JSON.parse(fs.readFileSync(path.join(ROOT, "target/idl-v4/drawsol.json"), "utf8"));

export const PROGRAM_ID = new PublicKey(IDL.address);
export const ORAO_VRF_ID = new PublicKey("VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y");
export const BPF_LOADER_UPGRADEABLE_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
export const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
export const KEYPAIR_PATH = process.env.KEYPAIR_PATH || path.join(os.homedir(), ".config/solana/id.json");

// SPEC-v4 / constants.rs
export const MAX_PER_TX = 1000;
export const MAX_TIERS = 8;
export const TICKET_CAP_MAX = 65_535;
export const POOL_CHUNK_MAX = 2000;
export const SCHEDULE_BATCH_MAX = 300;
export const HOUSE_BPS_MIN = 5000;
export const HOUSE_BPS_MAX = 6000;
export const CANCEL_GRACE_SECS = 48 * 3600;
export const PUBLIC_GRACE_MAX = 48 * 3600;
export const SCHEDULE_WON_BIT = 0x80;
export const SCHEDULE_TIER_MASK = 0x7f;
/** Pool account: disc[8] | remaining u32 | u32[cap]. Schedule account: disc[8] | u8[cap]. */
export const POOL_REMAINING_OFFSET = 8;
export const POOL_NUMBERS_OFFSET = 12;
export const SCHEDULE_BYTES_OFFSET = 8;

/**
 * Compute budget a client must request for `reveal_entry`. Measured in LiteSVM (programs/drawsol/BUILD.md):
 * 1 ticket ≈ 25k CU, 30 ≈ 37k, 1000 ≈ 386k; i.e. ≈ 24k + 362 CU per ticket. The default 200k limit only
 * covers entries of ≈ 480 tickets, so always send a SetComputeUnitLimit with this value.
 */
export const revealCuLimit = (count: number) => Math.min(1_400_000, 80_000 + 400 * count);

// RandomnessV2 account (ORAO): disc[8] | tag u8 (0 pending, 1 fulfilled) | client[32] | seed[32] | randomness[64]
const RANDOMNESS_V2_DISC = Buffer.from([0x8b, 0xef, 0xb8, 0xd7, 0xe3, 0x56, 0xbf, 0xe2]);

export type DrawsolProgram = Program<Drawsol>;

// ------------------------------------------------------------------ setup

export function loadKeypair(p = KEYPAIR_PATH): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

/** Keeper key: KEEPER_SECRET (JSON array, for CI) or the file at KEEPER_KEYPAIR. Never the admin key. */
export function loadKeeperKeypair(): Keypair {
  if (process.env.KEEPER_SECRET) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.KEEPER_SECRET)));
  if (process.env.KEEPER_KEYPAIR) return loadKeypair(process.env.KEEPER_KEYPAIR);
  throw new Error("set KEEPER_KEYPAIR (path to a keypair file) or KEEPER_SECRET (its JSON array)");
}

export function makeProgram(keypair = loadKeypair(), rpcUrl = RPC_URL): DrawsolProgram {
  const connection = new Connection(rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(keypair), { commitment: "confirmed" });
  return new Program<Drawsol>(IDL as Drawsol, provider);
}

export function log(...args: unknown[]) {
  console.log(new Date().toISOString(), ...args);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const nowSecs = () => Math.floor(Date.now() / 1000);

// ------------------------------------------------------------------ PDAs

export const u32le = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
export const u64le = (n: number | bigint | BN) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n.toString()));
  return b;
};
const pda = (seeds: (Buffer | Uint8Array)[], program = PROGRAM_ID) =>
  PublicKey.findProgramAddressSync(seeds, program)[0];

export const configPda = () => pda([Buffer.from("config")]);
export const drawPda = (id: number | bigint | BN) => pda([Buffer.from("draw4"), u64le(id)]);
export const vaultPda = (draw: PublicKey) => pda([Buffer.from("vault4"), draw.toBuffer()]);
export const poolPda = (draw: PublicKey) => pda([Buffer.from("pool"), draw.toBuffer()]);
export const schedulePda = (draw: PublicKey) => pda([Buffer.from("schedule"), draw.toBuffer()]);
export const playerPda = (draw: PublicKey, wallet: PublicKey) =>
  pda([Buffer.from("player4"), draw.toBuffer(), wallet.toBuffer()]);
export const entryPda = (draw: PublicKey, seq: number) => pda([Buffer.from("entry4"), draw.toBuffer(), u32le(seq)]);
export const profilePda = (wallet: PublicKey) => pda([Buffer.from("profile"), wallet.toBuffer()]);
/** v3 (legacy) accounts: draws #2–#6 on devnet. */
export const legacyV3DrawPda = (id: number | bigint | BN) => pda([Buffer.from("draw3"), u64le(id)]);
export const legacyV3VaultPda = (draw: PublicKey) => pda([Buffer.from("vault3"), draw.toBuffer()]);
/** v2 (legacy) accounts: draws #0–#1 (closed; history only). */
export const legacyDrawPda = (id: number | bigint | BN) => pda([Buffer.from("draw"), u64le(id)]);
export const programDataPda = () => pda([PROGRAM_ID.toBuffer()], BPF_LOADER_UPGRADEABLE_ID);
export const oraoNetworkStatePda = () => pda([Buffer.from("orao-vrf-network-configuration")], ORAO_VRF_ID);
export const oraoRequestPda = (seed: Buffer) => pda([Buffer.from("orao-vrf-randomness-request"), seed], ORAO_VRF_ID);

// ------------------------------------------------------------------ fairness (fairness.rs, v4 domains)

export const sha256 = (...parts: (Buffer | Uint8Array | string)[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(typeof p === "string" ? Buffer.from(p) : p);
  return h.digest();
};

export const entryVrfSeed = (draw: PublicKey, buyer: PublicKey, seq: number, nonce: Buffer) =>
  sha256("drawsol:v4:entry", draw.toBuffer(), buyer.toBuffer(), u32le(seq), nonce);
export const drawVrfSeed = (draw: PublicKey, nextPos: number, nonce: Buffer) =>
  sha256("drawsol:v4:draw", draw.toBuffer(), u32le(nextPos), nonce);
/** v3 / v2 seeds, for verifying legacy draws only. */
export const entryVrfSeedV3 = (draw: PublicKey, buyer: PublicKey, seq: number, nonce: Buffer) =>
  sha256("drawsol:v3:entry", draw.toBuffer(), buyer.toBuffer(), u32le(seq), nonce);
export const drawVrfSeedV3 = (draw: PublicKey, nextTicket: number, nonce: Buffer) =>
  sha256("drawsol:v3:draw", draw.toBuffer(), u32le(nextTicket), nonce);
export const entryVrfSeedV2 = (draw: PublicKey, buyer: PublicKey, seq: number, nonce: Buffer) =>
  sha256("drawsol:v2:entry", draw.toBuffer(), buyer.toBuffer(), u32le(seq), nonce);
export const drawVrfSeedV2 = (draw: PublicKey, nextTicket: number, nonce: Buffer) =>
  sha256("drawsol:v2:draw", draw.toBuffer(), u32le(nextTicket), nonce);

export const uniformIndex = (r: bigint, n: number) => Number((r * BigInt(n)) >> 64n);

/** Roll for the i-th ticket of an entry: four u64 per sha256(rand || "assign" || (i/4) le u32). */
export const assignRoll = (rnd: Buffer, i: number) =>
  sha256(rnd, "assign", u32le(Math.floor(i / 4))).readBigUInt64LE((i % 4) * 8);
export const assignIndex = (rnd: Buffer, i: number, remaining: number) => Number(assignRoll(rnd, i) % BigInt(remaining));

/**
 * Fisher–Yates swap-remove over `pool[..remaining]`, exactly as reveal_entry does it on the Pool account.
 * Mutates `pool` and returns { tickets, remaining }.
 */
export function assignTickets(rnd: Buffer, count: number, pool: number[], remaining: number) {
  const tickets: number[] = [];
  for (let i = 0; i < count; i++) {
    if (remaining <= 0) throw new Error("pool exhausted");
    const j = assignIndex(rnd, i, remaining);
    tickets.push(pool[j]);
    pool[j] = pool[remaining - 1];
    remaining--;
  }
  return { tickets, remaining };
}

/** Winning position of the end-prize draw over `nextPos` positions. */
export const winningPosition = (rnd: Buffer, nextPos: number) =>
  uniformIndex(sha256(rnd, "draw").readBigUInt64LE(0), nextPos);
/** v2/v3 name of the same function. */
export const winningTicket = winningPosition;

/** v2/v3 per-ticket instant roll / tier (history only). */
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

/**
 * Recomputes a reveal from the pool / schedule state *before* it: tickets, prizes (tier+1 per ticket)
 * and the lamports owed. `schedule` holds the raw schedule bytes, `tiers` the draw's tiers.
 */
export function expectedReveal(
  rnd: Buffer,
  count: number,
  pool: { remaining: number; numbers: number[] },
  schedule: Buffer | Uint8Array,
  tiers: { amount: BN }[],
) {
  const numbers = [...pool.numbers];
  const { tickets } = assignTickets(rnd, count, numbers, pool.remaining);
  const prizes: number[] = [];
  let owed = 0n;
  for (const t of tickets) {
    const tier = schedule[t] & SCHEDULE_TIER_MASK;
    prizes.push(tier);
    if (tier) owed += BigInt(tiers[tier - 1].amount.toString());
  }
  return { tickets, prizes, owed };
}

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

export type DrawAccount = Awaited<ReturnType<DrawsolProgram["account"]["drawV4"]["fetch"]>>;
export type EntryAccount = Awaited<ReturnType<DrawsolProgram["account"]["entryV4"]["fetch"]>>;
export type Status = "draft" | "open" | "drawing" | "settled" | "cancelled";
export type Tier = { amount: BN; count: number; set: number; won: number };

export const statusName = (s: object) => Object.keys(s)[0] as Status;
export const sol = (lamports: number | bigint | BN) => (Number(lamports.toString()) / LAMPORTS_PER_SOL).toFixed(4);
export const lamports = (solAmount: number) => new BN(Math.round(solAmount * LAMPORTS_PER_SOL).toString());
export const iso = (unix: number | BN) => new Date(Number(unix.toString()) * 1000).toISOString();
export const big = (x: BN | number | bigint) => BigInt(x.toString());

export async function fetchEntries(program: DrawsolProgram, draw: PublicKey) {
  const all = await program.account.entryV4.all([{ memcmp: { offset: 8, bytes: draw.toBase58() } }]);
  return all.sort((a, b) => a.account.seq - b.account.seq);
}

/** Every v4 draw, by id. */
export async function fetchDraws(program: DrawsolProgram) {
  const all = await program.account.drawV4.all();
  return all.sort((a, b) => a.account.id.cmp(b.account.id));
}

/** Raw Pool account of a draw: numbers still in the pool are `numbers[..remaining]`. */
export async function fetchPool(connection: Connection, draw: PublicKey, cap: number) {
  const acc = await connection.getAccountInfo(poolPda(draw), "confirmed");
  if (!acc) throw new Error(`no pool account for ${draw}`);
  const remaining = acc.data.readUInt32LE(POOL_REMAINING_OFFSET);
  const n = Math.min(cap, Math.floor((acc.data.length - POOL_NUMBERS_OFFSET) / 4));
  const numbers: number[] = [];
  for (let i = 0; i < n; i++) numbers.push(acc.data.readUInt32LE(POOL_NUMBERS_OFFSET + 4 * i));
  return { remaining, numbers, length: acc.data.length };
}

/** Raw Schedule bytes of a draw (cap of them; fewer while the account is still growing). */
export async function fetchSchedule(connection: Connection, draw: PublicKey, cap: number) {
  const acc = await connection.getAccountInfo(schedulePda(draw), "confirmed");
  if (!acc) throw new Error(`no schedule account for ${draw}`);
  return Buffer.from(acc.data.subarray(SCHEDULE_BYTES_OFFSET, SCHEDULE_BYTES_OFFSET + cap));
}

export const scheduleHash = (schedule: Buffer) => sha256(schedule);

export async function oraoTreasury(program: DrawsolProgram) {
  const ns = await program.account.networkState.fetch(oraoNetworkStatePda());
  return ns.config.treasury as PublicKey;
}

/** Due for request_draw: Open and now ≥ draw_at. */
export const isDue = (d: DrawAccount, now = nowSecs()) => statusName(d.status) === "open" && now >= d.drawAt.toNumber();
/** End of the keeper/authority-only window. */
export const publicFrom = (d: DrawAccount) => d.drawAt.toNumber() + d.publicGraceSecs;
/** request_draw will cancel instead of drawing: nothing sold. */
export const willCancelAtRequest = (d: DrawAccount) => d.nextPos === 0;
/** The prize settle_draw will pay now: the end prize, or the fallback pot below min_tickets. */
export const fallbackPot = (d: DrawAccount) => new BN((big(d.revenue) * BigInt(d.potBps) / 10_000n).toString());
export const currentPrize = (d: DrawAccount) => (d.paidTickets >= d.minTickets ? d.endPrizeLamports : fallbackPot(d));
export const usedTiers = (d: { tiers: Tier[] }) => d.tiers.filter((t) => t.count > 0);

// ------------------------------------------------------------------ v3 legacy (raw bytes, see legacy_close_v3.rs)

export const V3_OFFSETS = {
  id: 8, kind: 48, status: 49, prize: 106, houseLamports: 136, houseWithdrawn: 144, revenue: 152, refunded: 160,
  paidTickets: 208, nextTicket: 220, entryCount: 224, prizePaid: 448,
};
const V3_DRAW_DISC = Buffer.from("ce5ad7498e94deb4", "hex");
export const V3_DRAW_LEN = 483;

export async function fetchLegacyDrawV3(connection: Connection, id: number) {
  const draw = legacyV3DrawPda(id);
  const acc = await connection.getAccountInfo(draw, "confirmed");
  if (!acc || !acc.owner.equals(PROGRAM_ID) || acc.data.length !== V3_DRAW_LEN || !acc.data.subarray(0, 8).equals(V3_DRAW_DISC)) return null;
  const d = acc.data;
  const kind = (["pot", "headline"] as const)[d[V3_OFFSETS.kind]];
  const status = (["open", "drawing", "settled", "cancelled"] as const)[d[V3_OFFSETS.status]];
  const entryCount = d.readUInt32LE(V3_OFFSETS.entryCount);
  const nextTicket = d.readUInt32LE(V3_OFFSETS.nextTicket);
  const prizePaid = d[V3_OFFSETS.prizePaid] === 1;
  const settledDone = status === "settled" && prizePaid && d.readBigUInt64LE(V3_OFFSETS.houseWithdrawn) === d.readBigUInt64LE(V3_OFFSETS.houseLamports);
  const cancelledDone = status === "cancelled" && d.readBigUInt64LE(V3_OFFSETS.refunded) === d.readBigUInt64LE(V3_OFFSETS.revenue) && (kind !== "headline" || prizePaid);
  const vault = legacyV3VaultPda(draw);
  const vaultLamports = await connection.getBalance(vault, "confirmed");
  return {
    id, draw, vault, kind, status, entryCount, nextTicket, prize: d.readBigUInt64LE(V3_OFFSETS.prize),
    drawLamports: acc.lamports, vaultLamports,
    closable: (entryCount === 0 && nextTicket === 0) || settledDone || cancelledDone,
  };
}

// ------------------------------------------------------------------ presets, schedule picking & terms (SPEC-v4 §4)

export type TierSpec = { usd: number; count: number };
export type Preset = {
  label: string;
  /** end prize in USD; converted at `usdRate` */
  prizeUsd: number;
  price: number; cap: number; minTickets: number; houseBps: number; potBps: number; instantBps: number;
  perTx: number; perWallet: number; freeCap: number; graceMin: number; tiers: TierSpec[]; usdRate: number;
};

export const PRESETS: Record<string, Preset> = {
  weekly: {
    label: "Weekly draw (devnet, SPEC-v4 §4)",
    prizeUsd: 500, usdRate: 119.3, price: 0.00838, cap: 2000, minTickets: 1430,
    houseBps: 5500, potBps: 3500, instantBps: 1000, perTx: 1000, perWallet: 2000, freeCap: 20, graceMin: 30,
    tiers: [{ usd: 25, count: 2 }, { usd: 10, count: 4 }, { usd: 5, count: 8 }, { usd: 2, count: 15 }, { usd: 1, count: 40 }],
  },
};

/** `"25x2,10x4,5x8"` → tiers (usd × count). */
export function parseTiers(s: string): TierSpec[] {
  return s.split(",").map((part) => {
    const m = part.trim().match(/^([\d.]+)x(\d+)$/i);
    if (!m) throw new Error(`bad tier "${part}" (want <usd>x<count>)`);
    return { usd: Number(m[1]), count: Number(m[2]) };
  });
}

/** Next given weekday (0 = Sunday) at `hourUtc`:00 UTC at least `minLeadSecs` from now. */
export function nextWeeklyUtc(weekday: number, hourUtc: number, now = nowSecs(), minLeadSecs = 3600) {
  const d = new Date(now * 1000);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc) / 1000;
  while (t < now + minLeadSecs || new Date(t * 1000).getUTCDay() !== weekday) t += 86400;
  return t;
}

/** The draw's fixed parameters, in the units the program takes. */
export type DrawShape = {
  ticketPrice: BN; ticketCap: number; maxPerTx: number; maxPerWallet: number; freeCap: number;
  closesAt: BN; drawAt: BN; publicGraceSecs: number; houseBps: number; potBps: number; instantBps: number;
  endPrizeLamports: BN; minTickets: number; tiers: { amount: BN; count: number }[];
  /** display only */ usdRate: number; prizeUsd: number; tierUsd: number[];
};

export type Overrides = Partial<Omit<Preset, "label" | "tiers">> & { prize?: number; tiers?: TierSpec[]; closesAt?: number; drawAt?: number };

/** Builds + checks create_draw params (same checks as the program, so mistakes fail before sending). */
export function buildDraw(preset: Preset, o: Overrides, closesAtDefault: number): DrawShape {
  const p = { ...preset, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) } as Preset & Overrides;
  const closesAt = p.closesAt ?? closesAtDefault;
  const drawAt = p.drawAt ?? closesAt;
  const prizeSol = p.prize ?? p.prizeUsd / p.usdRate;
  const tiers = p.tiers.map((t) => ({ amount: lamports(t.usd / p.usdRate), count: t.count }));
  // The USD → lamport conversion can overshoot the instant budget by rounding (SPEC-v4 §4: $200 at $119.30 is
  // 1.67645 SOL against a 1.676 SOL budget). Scale every tier down proportionally so Σ schedule fits exactly.
  const budget = BigInt(p.instantBps) * BigInt(p.cap) * big(lamports(p.price)) / 10_000n;
  const total = scheduleTotal(tiers);
  if (total > budget) {
    for (const t of tiers) t.amount = new BN(((big(t.amount) * budget) / total).toString());
    console.log(`note: instant tiers scaled by ${(Number(budget) / Number(total)).toFixed(6)} to fit the ${sol(budget)} SOL budget (was ${sol(total)} SOL)`);
  }
  const s: DrawShape = {
    ticketPrice: lamports(p.price), ticketCap: p.cap, maxPerTx: p.perTx, maxPerWallet: p.perWallet, freeCap: p.freeCap,
    closesAt: new BN(closesAt), drawAt: new BN(drawAt), publicGraceSecs: Math.round(p.graceMin * 60),
    houseBps: p.houseBps, potBps: p.potBps, instantBps: p.instantBps, endPrizeLamports: lamports(prizeSol),
    minTickets: p.minTickets, tiers, usdRate: p.usdRate, prizeUsd: p.prize !== undefined ? p.prize * p.usdRate : p.prizeUsd,
    tierUsd: p.tiers.map((t) => t.usd),
  };
  checkShape(s);
  return s;
}

export const scheduleTotal = (tiers: { amount: BN; count: number }[]) =>
  tiers.reduce((a, t) => a + big(t.amount) * BigInt(t.count), 0n);

/** The program's create/open checks (SPEC-v4 §1). */
export function checkShape(s: DrawShape) {
  const now = nowSecs();
  const price = big(s.ticketPrice);
  const prize = big(s.endPrizeLamports);
  if (price <= 0n || s.ticketCap < 1 || s.ticketCap > TICKET_CAP_MAX) throw new Error("price must be > 0 and 1 ≤ cap ≤ 65535");
  if (s.maxPerTx < 1 || s.maxPerTx > MAX_PER_TX || s.maxPerWallet < 1) throw new Error("bad per-tx / per-wallet limits");
  if (s.closesAt.toNumber() <= now) throw new Error("closes_at must be in the future");
  if (s.drawAt.lt(s.closesAt)) throw new Error("draw_at must be ≥ closes_at");
  if (s.publicGraceSecs > PUBLIC_GRACE_MAX) throw new Error("public grace must be ≤ 48h");
  if (s.houseBps < HOUSE_BPS_MIN || s.houseBps > HOUSE_BPS_MAX) throw new Error(`house_bps must be in [${HOUSE_BPS_MIN}, ${HOUSE_BPS_MAX}]`);
  if (s.houseBps + s.potBps + s.instantBps !== 10_000) throw new Error("house + pot + instant must be 10000 bps");
  if (prize <= 0n) throw new Error("end prize must be > 0");
  if (s.minTickets < 1 || s.minTickets > s.ticketCap) throw new Error("min_tickets must be in [1, cap]");
  if (s.tiers.length > MAX_TIERS) throw new Error("at most 8 tiers");
  const count = s.tiers.reduce((a, t) => a + t.count, 0);
  if (count > s.ticketCap) throw new Error("Σ tier counts > cap");
  for (const t of s.tiers) if ((big(t.amount) === 0n) !== (t.count === 0)) throw new Error("tier amount and count must both be set");
  if (BigInt(s.minTickets) * price * BigInt(s.potBps) < prize * 10_000n)
    throw new Error(`min_tickets × price × pot_bps/1e4 (${sol(BigInt(s.minTickets) * price * BigInt(s.potBps) / 10_000n)} SOL) must be ≥ end prize (${sol(prize)} SOL)`);
  if (scheduleTotal(s.tiers) * 10_000n > BigInt(s.instantBps) * BigInt(s.ticketCap) * price)
    throw new Error(`Σ schedule (${sol(scheduleTotal(s.tiers))} SOL) must be ≤ instant_bps × cap × price / 1e4 (${sol(BigInt(s.instantBps) * BigInt(s.ticketCap) * price / 10_000n)} SOL)`);
}

/** The program's `CreateDrawParams` for a shape (8 tiers, zero-padded). */
export function createParams(s: DrawShape, termsHash: Buffer) {
  const tiers = [...s.tiers.map((t) => ({ amount: t.amount, count: t.count }))];
  while (tiers.length < MAX_TIERS) tiers.push({ amount: new BN(0), count: 0 });
  return {
    ticketPrice: s.ticketPrice, ticketCap: s.ticketCap, maxPerTx: s.maxPerTx, maxPerWallet: s.maxPerWallet,
    freeCap: s.freeCap, closesAt: s.closesAt, drawAt: s.drawAt, publicGraceSecs: s.publicGraceSecs,
    houseBps: s.houseBps, potBps: s.potBps, instantBps: s.instantBps, endPrizeLamports: s.endPrizeLamports,
    minTickets: s.minTickets, tiers, termsHash: Array.from(termsHash),
  };
}

/**
 * Seeded shuffle of 0..cap (Fisher–Yates driven by sha256(seed || i le u32)), as published in the terms:
 * for i = cap−1 … 1: j = u64le(sha256(seed || i)[0..8]) mod (i+1); swap(i, j).
 */
export function seededShuffle(seed: Buffer, cap: number): number[] {
  const v = Array.from({ length: cap }, (_, i) => i);
  for (let i = cap - 1; i >= 1; i--) {
    const j = Number(sha256(seed, u32le(i)).readBigUInt64LE(0) % BigInt(i + 1));
    [v[i], v[j]] = [v[j], v[i]];
  }
  return v;
}

/** Winning numbers per tier: the first Σ count numbers of the seeded shuffle, tier by tier. */
export function pickSchedule(seed: Buffer, cap: number, tiers: { count: number }[]): number[][] {
  const order = seededShuffle(seed, cap);
  const out: number[][] = [];
  let k = 0;
  for (const t of tiers) {
    out.push(order.slice(k, k + t.count).sort((a, b) => a - b));
    k += t.count;
  }
  return out;
}

export const scheduleEntries = (numbers: number[][]) =>
  numbers.flatMap((nums, tier) => nums.map((ticket) => ({ ticket, tier })));

const fmtBps = (b: number) => `${(b / 100).toFixed(b % 100 ? 2 : 0)}%`;
const fmtUsd = (x: number) => (Number.isInteger(x) ? `$${x}` : `$${x.toFixed(2)}`);

/** The parameters section of the terms (also the seed input for the winning numbers). */
export function renderParameters(id: number, s: DrawShape) {
  const price = Number(s.ticketPrice.toString()) / LAMPORTS_PER_SOL;
  const lines = [
    `- Draw: #${id}`,
    `- Program: ${PROGRAM_ID.toBase58()}`,
    `- Ticket price: ${price} SOL`,
    `- Ticket numbers: 0 to ${s.ticketCap - 1} (${s.ticketCap} tickets of every kind); max ${s.maxPerTx} per transaction, ${s.maxPerWallet} per wallet`,
    `- Free entries: up to ${s.freeCap}, one per wallet`,
    `- Sales close: ${iso(s.closesAt)} (unix ${s.closesAt.toString()}) or at sell-out`,
    `- Draw time: ${iso(s.drawAt)} (unix ${s.drawAt.toString()}); keeper/operator-only for the first ${Math.round(s.publicGraceSecs / 60)} min, then anyone`,
    `- End prize: ${sol(s.endPrizeLamports)} SOL (${fmtUsd(s.prizeUsd)} at $${s.usdRate} per SOL), escrowed in the vault at opening`,
    `- Minimum paid tickets for the full end prize: ${s.minTickets}; below that the end prize is the fallback pot, ${fmtBps(s.potBps)} of ticket revenue`,
    `- Split: ${fmtBps(s.houseBps)} house · ${fmtBps(s.potBps)} end prize / fallback pot · ${fmtBps(s.instantBps)} instant prizes (the schedule total is at most ${fmtBps(s.instantBps)} of a sell-out)`,
    "",
    "### Instant prizes",
    "",
    "| Prize | Winning numbers |",
    "|---|---|",
    ...s.tiers.map((t, i) => `| ${sol(t.amount)} SOL (${fmtUsd(s.tierUsd[i])}) | ${t.count} |`),
    "",
    `Schedule total: ${sol(scheduleTotal(s.tiers))} SOL, escrowed in the vault at opening.`,
  ];
  return lines.join("\n");
}

/** Seed of the winning-number shuffle: sha256(draw id le u64 || parameters section). */
export const scheduleSeed = (id: number, parameters: string) => sha256(u64le(id), parameters);

export function renderNumbers(numbers: number[][], s: DrawShape) {
  const lines = ["### Winning numbers", "", "Chosen before sales opened by the seeded shuffle described in section 3; every number below is",
    "fixed in the on-chain schedule (hash published in the `DrawOpened` event).", ""];
  numbers.forEach((nums, i) => lines.push(`- ${sol(s.tiers[i].amount)} SOL (${fmtUsd(s.tierUsd[i])}) × ${nums.length}: ${nums.join(", ")}`));
  return lines.join("\n");
}

/** Full terms text: template + parameters + winning numbers. Its sha256 is the on-chain terms_hash. */
export function renderTerms(id: number, s: DrawShape, numbers: number[][]) {
  const template = fs.readFileSync(path.join(ROOT, "scripts/terms-v4.md"), "utf8");
  return `${template}\n## 7. Parameters of this draw\n\n${renderParameters(id, s)}\n\n${renderNumbers(numbers, s)}\n`;
}

/** Everything needed to re-render / resume a draw's setup: scripts/terms/draw-<id>.json. */
export type TermsFile = {
  id: number; draw: string; shape: Record<string, unknown>; numbers: number[][]; termsHash: string; scheduleSeed: string;
};
export const termsPaths = (id: number) => ({
  md: path.join(ROOT, `scripts/terms/draw-${id}.md`),
  json: path.join(ROOT, `scripts/terms/draw-${id}.json`),
});

export function shapeToJson(s: DrawShape) {
  return {
    ...s, ticketPrice: s.ticketPrice.toString(), closesAt: s.closesAt.toString(), drawAt: s.drawAt.toString(),
    endPrizeLamports: s.endPrizeLamports.toString(), tiers: s.tiers.map((t) => ({ amount: t.amount.toString(), count: t.count })),
  };
}

export function shapeFromJson(j: Record<string, unknown>): DrawShape {
  const x = j as Record<string, string | number | number[] | { amount: string; count: number }[]>;
  return {
    ...(j as object), ticketPrice: new BN(x.ticketPrice as string), closesAt: new BN(x.closesAt as string), drawAt: new BN(x.drawAt as string),
    endPrizeLamports: new BN(x.endPrizeLamports as string),
    tiers: (x.tiers as { amount: string; count: number }[]).map((t) => ({ amount: new BN(t.amount), count: t.count })),
  } as DrawShape;
}

/** Shape of an on-chain draw (for re-rendering terms); USD figures come from the terms file when present. */
export function shapeFromChain(d: DrawAccount, usd?: { usdRate: number; prizeUsd: number; tierUsd: number[] }): DrawShape {
  const tiers = usedTiers(d).map((t) => ({ amount: t.amount, count: t.count }));
  return {
    ticketPrice: d.ticketPrice, ticketCap: d.ticketCap, maxPerTx: d.maxPerTx, maxPerWallet: d.maxPerWallet, freeCap: d.freeCap,
    closesAt: d.closesAt, drawAt: d.drawAt, publicGraceSecs: d.publicGraceSecs, houseBps: d.houseBps, potBps: d.potBps,
    instantBps: d.instantBps, endPrizeLamports: d.endPrizeLamports, minTickets: d.minTickets, tiers,
    usdRate: usd?.usdRate ?? 0, prizeUsd: usd?.prizeUsd ?? 0, tierUsd: usd?.tierUsd ?? tiers.map(() => 0),
  };
}

// ------------------------------------------------------------------ setup actions (Draft)

/** create_draw: picks the winning numbers (seeded shuffle), hashes the full terms, sends. Signer = provider wallet. */
export async function createDraw(program: DrawsolProgram, shape: DrawShape) {
  const config = await program.account.config.fetch(configPda());
  const id = config.nextDrawId.toNumber();
  const parameters = renderParameters(id, shape);
  const seed = scheduleSeed(id, parameters);
  const numbers = pickSchedule(seed, shape.ticketCap, shape.tiers);
  const terms = renderTerms(id, shape, numbers);
  const termsHash = sha256(terms);
  const draw = drawPda(id);
  const sig = await program.methods
    .createDraw(createParams(shape, termsHash))
    .accountsPartial({ config: configPda(), draw, vault: vaultPda(draw), pool: poolPda(draw), schedule: schedulePda(draw), creator: program.provider.publicKey! })
    .rpc();
  return { id, draw, terms, termsHash, numbers, seed, sig };
}

/** init_pool in chunks from the pool's current `remaining` up to the cap. Returns the chunks sent. */
export async function initPoolAll(program: DrawsolProgram, draw: PublicKey, onChunk?: (from: number, to: number, sig: string) => void) {
  const d = await program.account.drawV4.fetch(draw);
  let from = (await fetchPool(program.provider.connection, draw, d.ticketCap)).remaining;
  const chunks: [number, number][] = [];
  while (from < d.ticketCap) {
    const to = Math.min(from + POOL_CHUNK_MAX, d.ticketCap);
    const sig = await program.methods
      .initPool(from, to)
      .accountsPartial({ config: configPda(), draw, pool: poolPda(draw), schedule: schedulePda(draw), payer: program.provider.publicKey! })
      .rpc();
    onChunk?.(from, to, sig);
    chunks.push([from, to]);
    from = to;
  }
  return chunks;
}

/** set_schedule in batches, skipping numbers already registered on chain (resumable). Returns batches sent. */
export async function setScheduleAll(program: DrawsolProgram, draw: PublicKey, numbers: number[][], onBatch?: (n: number, sig: string) => void) {
  const d = await program.account.drawV4.fetch(draw);
  const onChain = await fetchSchedule(program.provider.connection, draw, d.ticketCap);
  const pending = scheduleEntries(numbers).filter((e) => {
    const b = onChain[e.ticket];
    if (b && (b & SCHEDULE_TIER_MASK) !== e.tier + 1) throw new Error(`ticket ${e.ticket} is registered for another tier on chain`);
    return !b;
  });
  let sent = 0;
  for (let i = 0; i < pending.length; i += SCHEDULE_BATCH_MAX) {
    const batch = pending.slice(i, i + SCHEDULE_BATCH_MAX);
    const sig = await program.methods
      .setSchedule(batch)
      .accountsPartial({ config: configPda(), draw, schedule: schedulePda(draw), signer: program.provider.publicKey! })
      .rpc();
    onBatch?.(batch.length, sig);
    sent++;
  }
  return sent;
}

/** open_draw: escrows end prize + schedule total from the signer (must be the authority). */
export async function openDraw(program: DrawsolProgram, draw: PublicKey) {
  return program.methods
    .openDraw()
    .accountsPartial({ draw, vault: vaultPda(draw), pool: poolPda(draw), schedule: schedulePda(draw), authority: program.provider.publicKey! })
    .rpc();
}

// ------------------------------------------------------------------ play actions

async function oraoAccounts(program: DrawsolProgram, vrfRequest: PublicKey) {
  return { vrfRequest, vrfConfig: oraoNetworkStatePda(), vrfTreasury: await oraoTreasury(program), vrf: ORAO_VRF_ID };
}

/** buy_tickets. Returns the entry, its ORAO request and first position. */
export async function buyTickets(program: DrawsolProgram, draw: PublicKey, quantity: number) {
  const d = await program.account.drawV4.fetch(draw);
  const buyer = program.provider.publicKey!;
  const seq = d.entryCount;
  const nonce = randomBytes(16);
  const vrfRequest = oraoRequestPda(entryVrfSeed(draw, buyer, seq, nonce));
  const sig = await program.methods
    .buyTickets(quantity, Array.from(nonce))
    .accountsPartial({
      draw, vault: vaultPda(draw), entry: entryPda(draw, seq), player: playerPda(draw, buyer), profile: profilePda(buyer), buyer,
      ...(await oraoAccounts(program, vrfRequest)),
    })
    .rpc();
  return { entry: entryPda(draw, seq), seq, firstPos: d.nextPos, vrfRequest, sig };
}

export async function claimFreeEntry(program: DrawsolProgram, draw: PublicKey) {
  const d = await program.account.drawV4.fetch(draw);
  const buyer = program.provider.publicKey!;
  const seq = d.entryCount;
  const nonce = randomBytes(16);
  const vrfRequest = oraoRequestPda(entryVrfSeed(draw, buyer, seq, nonce));
  const sig = await program.methods
    .claimFreeEntry(Array.from(nonce))
    .accountsPartial({
      draw, entry: entryPda(draw, seq), player: playerPda(draw, buyer), profile: profilePda(buyer), buyer,
      ...(await oraoAccounts(program, vrfRequest)),
    })
    .rpc();
  return { entry: entryPda(draw, seq), seq, pos: d.nextPos, vrfRequest, sig };
}

/** reveal_entry for one entry (permissionless), with the compute budget it needs. */
export async function revealEntry(program: DrawsolProgram, draw: PublicKey, entry: PublicKey, e: EntryAccount) {
  return program.methods
    .revealEntry()
    .accountsPartial({
      draw, vault: vaultPda(draw), pool: poolPda(draw), schedule: schedulePda(draw), entry, player: playerPda(draw, e.owner),
      owner: e.owner, vrfRequest: e.vrfRequest,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: revealCuLimit(e.count) })])
    .rpc();
}

/** Reveals every unrevealed entry whose randomness is fulfilled. Returns the number revealed. */
export async function revealReady(program: DrawsolProgram, draw: PublicKey): Promise<number> {
  const d = await program.account.drawV4.fetch(draw);
  const st = statusName(d.status);
  if (st === "cancelled" || st === "draft" || d.revealedEntries >= d.entryCount) return 0;
  let n = 0;
  for (const { publicKey, account: e } of await fetchEntries(program, draw)) {
    if (e.revealed) continue;
    const rnd = await readRandomness(program.provider.connection, e.vrfRequest, e.vrfSeed);
    if (!rnd) continue;
    try {
      const sig = await revealEntry(program, draw, publicKey, e);
      const after = await program.account.entryV4.fetch(publicKey);
      const wins = after.prizes.filter((p) => p > 0).length;
      log(`draw #${d.id} entry #${e.seq}: revealed ${e.count} ticket(s) [${after.tickets.slice(0, 12).join(",")}${e.count > 12 ? ",…" : ""}] ` +
        `${wins} instant win(s), ${sol(after.instantPaid)} SOL ${sig}`);
      n++;
    } catch (err) {
      log(`reveal of draw #${d.id} entry #${e.seq} failed:`, (err as Error).message);
    }
  }
  return n;
}

/** request_draw for a due Open draw. Returns the ORAO request, or null if the draw was cancelled instead. */
export async function requestDraw(program: DrawsolProgram, draw: PublicKey): Promise<PublicKey | null> {
  const d = await program.account.drawV4.fetch(draw);
  const nonce = randomBytes(16);
  const cancels = willCancelAtRequest(d);
  const vrfRequest = cancels ? null : oraoRequestPda(drawVrfSeed(draw, d.nextPos, nonce));
  const orao = cancels
    ? { vrfRequest: null, vrfConfig: null, vrfTreasury: null, vrf: null }
    : await oraoAccounts(program, vrfRequest!);
  const sig = await program.methods
    .requestDraw(Array.from(nonce))
    .accountsPartial({ config: configPda(), draw, vault: vaultPda(draw), authority: d.authority, payer: program.provider.publicKey!, ...orao })
    .rpc();
  if (cancels) {
    log(`draw #${d.id} cancelled at request — no tickets; escrow returned to the authority ${sig}`);
    return null;
  }
  log(`draw #${d.id} requested: ${d.nextPos} positions, ORAO request ${vrfRequest} ${sig}`);
  return vrfRequest;
}

/** settle_draw if the draw randomness is fulfilled and the winning entry is revealed. */
export async function settleIfReady(program: DrawsolProgram, draw: PublicKey) {
  const d = await program.account.drawV4.fetch(draw);
  if (statusName(d.status) !== "drawing") return null;
  const rnd = await readRandomness(program.provider.connection, d.drawVrfRequest, d.drawVrfSeed);
  if (!rnd) return null;
  const pos = winningPosition(rnd, d.nextPos);
  const entries = await fetchEntries(program, draw);
  const hit = entries.find(({ account: e }) => pos >= e.firstPos && pos < e.firstPos + e.count);
  if (!hit) throw new Error(`no entry holds winning position ${pos}`);
  if (!hit.account.revealed) {
    log(`draw #${d.id}: winning entry #${hit.account.seq} is not revealed yet (randomness pending?)`);
    return null;
  }
  const ticket = hit.account.tickets[pos - hit.account.firstPos];
  const fallback = d.paidTickets < d.minTickets;
  const sig = await program.methods
    .settleDraw()
    .accountsPartial({ draw, vault: vaultPda(draw), vrfRequest: d.drawVrfRequest, winningEntry: hit.publicKey, winner: hit.account.owner, authority: d.authority })
    .rpc();
  const after = await program.account.drawV4.fetch(draw);
  log(`draw #${d.id} settled: position ${pos} → ticket #${ticket} (entry #${hit.account.seq}) → ${hit.account.owner}, ` +
    `${sol(after.endPrizePaid)} SOL${fallback ? " (fallback pot)" : " (full end prize)"} ${sig}`);
  return { id: d.id.toNumber(), pos, ticket, winner: hit.account.owner, prize: after.endPrizePaid, fallback, sig };
}

/** cancel_draw once the randomness grace period is over. */
export async function cancelIfStuck(program: DrawsolProgram, draw: PublicKey, now = nowSecs()) {
  const d = await program.account.drawV4.fetch(draw);
  if (statusName(d.status) !== "drawing" || now <= d.drawAt.toNumber() + CANCEL_GRACE_SECS) return false;
  if (await readRandomness(program.provider.connection, d.drawVrfRequest, d.drawVrfSeed)) return false;
  const sig = await program.methods.cancelDraw().accountsPartial({ draw, signer: program.provider.publicKey! }).rpc();
  log(`draw #${d.id} cancelled (randomness timeout) ${sig}`);
  return true;
}

/** claim_refund for every unrefunded entry of a cancelled draw that is owed something. */
export async function refundAll(program: DrawsolProgram, draw: PublicKey) {
  let total = 0n;
  for (const { publicKey, account: e } of await fetchEntries(program, draw)) {
    if (e.refunded) continue;
    const amount = big(e.paidLamports) - big(e.instantPaid);
    if (amount <= 0n) continue;
    const sig = await program.methods
      .claimRefund()
      .accountsPartial({ draw, vault: vaultPda(draw), entry: publicKey, owner: e.owner })
      .rpc();
    log(`refunded entry #${e.seq}: ${sol(amount)} SOL → ${e.owner} ${sig}`);
    total += amount;
  }
  return total;
}

/** withdraw (authority = provider wallet). Returns the signature. */
export async function withdraw(program: DrawsolProgram, draw: PublicKey) {
  return program.methods.withdraw().accountsPartial({ draw, vault: vaultPda(draw), authority: program.provider.publicKey! }).rpc();
}
