/**
 * Shared helpers for scripts/admin.ts, scripts/e2e-devnet-v3.ts and keeper/index.ts (DrawSol v3, SPEC-v3 §2).
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

// SPEC-v3 §2.1
export const MAX_PER_TX = 25;
export const HOUSE_BPS_MIN = 5000;
export const HOUSE_BPS_MAX = 6000;
export const POT_BPS_MIN = 2000;
export const FLOOR_MARGIN_BPS_MIN = 1000;
export const SOL_SHARE_MAX_BPS = 5000;
export const CREDITS_TIER_MAX = 100;
export const CANCEL_GRACE_SECS = 48 * 3600;
export const PUBLIC_GRACE_MAX = 48 * 3600;
export const TIER_NONE = 0;
export const TIER_SOL_SHARE = 1;
export const TIER_CREDITS = 2;

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
export const drawPda = (id: number | bigint | BN) => pda([Buffer.from("draw3"), u64le(id)]);
export const vaultPda = (draw: PublicKey) => pda([Buffer.from("vault3"), draw.toBuffer()]);
export const playerPda = (draw: PublicKey, wallet: PublicKey) =>
  pda([Buffer.from("player3"), draw.toBuffer(), wallet.toBuffer()]);
export const entryPda = (draw: PublicKey, seq: number) => pda([Buffer.from("entry3"), draw.toBuffer(), u32le(seq)]);
export const profilePda = (wallet: PublicKey) => pda([Buffer.from("profile"), wallet.toBuffer()]);
/** v2 (legacy) accounts: draws #0–#1 on devnet. */
export const legacyDrawPda = (id: number | bigint | BN) => pda([Buffer.from("draw"), u64le(id)]);
export const legacyVaultPda = (draw: PublicKey) => pda([Buffer.from("vault"), draw.toBuffer()]);
export const programDataPda = () => pda([PROGRAM_ID.toBuffer()], BPF_LOADER_UPGRADEABLE_ID);
export const oraoNetworkStatePda = () => pda([Buffer.from("orao-vrf-network-configuration")], ORAO_VRF_ID);
export const oraoRequestPda = (seed: Buffer) => pda([Buffer.from("orao-vrf-randomness-request"), seed], ORAO_VRF_ID);

// ------------------------------------------------------------------ fairness (SPEC §2.3, v3 domains)

export const sha256 = (...parts: (Buffer | Uint8Array | string)[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(typeof p === "string" ? Buffer.from(p) : p);
  return h.digest();
};

export const entryVrfSeed = (draw: PublicKey, buyer: PublicKey, seq: number, nonce: Buffer) =>
  sha256("drawsol:v3:entry", draw.toBuffer(), buyer.toBuffer(), u32le(seq), nonce);
export const drawVrfSeed = (draw: PublicKey, nextTicket: number, nonce: Buffer) =>
  sha256("drawsol:v3:draw", draw.toBuffer(), u32le(nextTicket), nonce);
/** v2 seeds, for verifying legacy draws only. */
export const entryVrfSeedV2 = (draw: PublicKey, buyer: PublicKey, seq: number, nonce: Buffer) =>
  sha256("drawsol:v2:entry", draw.toBuffer(), buyer.toBuffer(), u32le(seq), nonce);
export const drawVrfSeedV2 = (draw: PublicKey, nextTicket: number, nonce: Buffer) =>
  sha256("drawsol:v2:draw", draw.toBuffer(), u32le(nextTicket), nonce);

export const uniformIndex = (r: bigint, n: number) => Number((r * BigInt(n)) >> 64n);
export const ticketRoll = (rnd: Buffer, ticket: number) => sha256(rnd, "ticket", u32le(ticket)).readBigUInt64LE(0);

/** Instant tier of one ticket: 0 = none, i+1 = tier i. Only each tier's `odds` matter. */
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

export type TierV3 = { odds: number; kind: number; value: number };

/** Recomputes a pot entry's reveal: tiers, SOL owed (before the pool cap) and credits won. SPEC-v3 §2.4. */
export function expectedReveal(
  rnd: Buffer,
  e: { firstTicket: number; count: number; poolSnapshot: BN },
  d: { iwDenominator: number; iwTiers: TierV3[] },
) {
  const tiers: number[] = [];
  let owed = 0n;
  let credits = 0;
  const snap = BigInt(e.poolSnapshot.toString());
  for (let i = 0; i < e.count; i++) {
    const t = ticketTier(rnd, e.firstTicket + i, d.iwDenominator, d.iwTiers);
    tiers.push(t);
    if (!t) continue;
    const tier = d.iwTiers[t - 1];
    if (tier.kind === TIER_SOL_SHARE) owed += (snap * BigInt(tier.value)) / 10_000n;
    if (tier.kind === TIER_CREDITS) credits += tier.value;
  }
  return { tiers, owed, credits };
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

export type DrawAccount = Awaited<ReturnType<DrawsolProgram["account"]["drawV3"]["fetch"]>>;
export type EntryAccount = Awaited<ReturnType<DrawsolProgram["account"]["entryV3"]["fetch"]>>;
export type Status = "open" | "drawing" | "settled" | "cancelled";

export const statusName = (s: object) => Object.keys(s)[0] as Status;
export const kindName = (k: object) => Object.keys(k)[0] as "pot" | "headline";
export const sol = (lamports: number | bigint | BN) => (Number(lamports.toString()) / LAMPORTS_PER_SOL).toFixed(4);
export const lamports = (solAmount: number) => new BN(Math.round(solAmount * LAMPORTS_PER_SOL).toString());
export const iso = (unix: number | BN) => new Date(Number(unix.toString()) * 1000).toISOString();

export async function fetchEntries(program: DrawsolProgram, draw: PublicKey) {
  const all = await program.account.entryV3.all([{ memcmp: { offset: 8, bytes: draw.toBase58() } }]);
  return all.sort((a, b) => a.account.seq - b.account.seq);
}

/** Every v3 draw, by id. */
export async function fetchDraws(program: DrawsolProgram) {
  const all = await program.account.drawV3.all();
  return all.sort((a, b) => a.account.id.cmp(b.account.id));
}

export async function oraoTreasury(program: DrawsolProgram) {
  const ns = await program.account.networkState.fetch(oraoNetworkStatePda());
  return ns.config.treasury as PublicKey;
}

/** Due for request_draw (SPEC-v3 §2.8): Open and now ≥ draw_at. */
export const isDue = (d: DrawAccount, now = nowSecs()) => statusName(d.status) === "open" && now >= d.drawAt.toNumber();
/** End of the keeper/authority-only window. */
export const publicFrom = (d: DrawAccount) => d.drawAt.toNumber() + d.publicGraceSecs;
/** request_draw will cancel instead of drawing: no tickets, or a headline below min_tickets. */
export const willCancelAtRequest = (d: DrawAccount) =>
  d.nextTicket === 0 || (kindName(d.kind) === "headline" && d.paidTickets < d.minTickets);
/** The prize settle_draw will pay now. */
export const currentPrize = (d: DrawAccount) =>
  kindName(d.kind) === "headline" ? d.prizeLamports : d.potLamports.add(d.instantPoolLamports);

// ------------------------------------------------------------------ v2 legacy (raw bytes, see legacy_close_v2.rs)

export const V2_OFFSETS = { id: 8, status: 48, prize: 87, nextTicket: 187, entryCount: 191, prizePaid: 407, proceedsWithdrawn: 408, reserveWithdrawn: 409 };
const V2_DRAW_DISC = Buffer.from("e18329de7a1492ca", "hex");

export async function fetchLegacyDraw(connection: Connection, id: number) {
  const draw = legacyDrawPda(id);
  const acc = await connection.getAccountInfo(draw, "confirmed");
  if (!acc || !acc.owner.equals(PROGRAM_ID) || acc.data.length !== 444 || !acc.data.subarray(0, 8).equals(V2_DRAW_DISC)) return null;
  const d = acc.data;
  const status = (["open", "drawing", "settled", "cancelled"] as Status[])[d[V2_OFFSETS.status]];
  const entryCount = d.readUInt32LE(V2_OFFSETS.entryCount);
  const nextTicket = d.readUInt32LE(V2_OFFSETS.nextTicket);
  const finished = status === "settled" && d[V2_OFFSETS.prizePaid] === 1 && d[V2_OFFSETS.proceedsWithdrawn] === 1 && d[V2_OFFSETS.reserveWithdrawn] === 1;
  const vault = legacyVaultPda(draw);
  const vaultLamports = await connection.getBalance(vault, "confirmed");
  return {
    id, draw, vault, status, entryCount, nextTicket,
    drawLamports: acc.lamports, vaultLamports,
    closable: (entryCount === 0 && nextTicket === 0) || finished,
  };
}

// ------------------------------------------------------------------ draw presets & terms (SPEC-v3 §3)

export type PotPreset = {
  label: string; price: number; cap: number; houseBps: number; potBps: number; instantBps: number;
  perTx: number; perWallet: number; freeCap: number; graceMin: number; denominator: number; tiers: TierV3[];
};
export type HeadlinePreset = {
  label: string; prize: number; price: number; cap: number; houseBps: number; minTickets: number; floorMarginBps: number;
  perTx: number; perWallet: number; freeCap: number; graceMin: number;
};

export const POT_PRESETS: Record<string, PotPreset> = {
  nightly: {
    label: "Nightly pot draw (devnet)",
    price: 0.01, cap: 300, houseBps: 5500, potBps: 3500, instantBps: 1000, perTx: 25, perWallet: 50, freeCap: 15,
    graceMin: 30, denominator: 1000,
    tiers: [
      { odds: 15, kind: TIER_SOL_SHARE, value: 2000 },
      { odds: 60, kind: TIER_SOL_SHARE, value: 400 },
      { odds: 150, kind: TIER_CREDITS, value: 1 },
    ],
  },
};

export const HEADLINE_PRESETS: Record<string, HeadlinePreset> = {
  weekly: {
    label: "Weekly headline draw (devnet)",
    prize: 1, price: 0.01, cap: 230, houseBps: 5500, minTickets: 120, floorMarginBps: 2000,
    perTx: 25, perWallet: 50, freeCap: 15, graceMin: 30,
  },
};

/** Next `hourUtc`:00 UTC at least `minLeadSecs` from now (nightly pot draw: 22:00). */
export function nextDailyUtc(hourUtc: number, now = nowSecs(), minLeadSecs = 15 * 60) {
  const d = new Date(now * 1000);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc) / 1000;
  while (t < now + minLeadSecs) t += 86400;
  return t;
}

/** Next given weekday (0 = Sunday) at `hourUtc`:00 UTC (weekly headline draw: Sunday 20:00). */
export function nextWeeklyUtc(weekday: number, hourUtc: number, now = nowSecs(), minLeadSecs = 3600) {
  let t = nextDailyUtc(hourUtc, now, minLeadSecs);
  while (new Date(t * 1000).getUTCDay() !== weekday) t += 86400;
  return t;
}

const fmtBps = (b: number) => `${(b / 100).toFixed(b % 100 ? 2 : 0)}%`;

/** Terms text for a draw, generated only from on-chain parameters (so it can be re-rendered for any draw). */
export function renderTerms(id: number, d: DrawAccount | ReturnType<typeof drawShape>) {
  const kind = kindName(d.kind);
  const template = fs.readFileSync(path.join(ROOT, `scripts/terms-${kind}.md`), "utf8");
  const price = Number(d.ticketPrice.toString()) / LAMPORTS_PER_SOL;
  const lines = [
    `- Draw: #${id} (${kind} draw)`,
    `- Program: ${PROGRAM_ID.toBase58()}`,
    `- Ticket price: ${price} SOL`,
    `- Paid tickets: ${d.ticketCap}; max ${d.maxPerTx} per transaction, ${d.maxPerWallet} per wallet (all ticket kinds)`,
    `- Free entries: up to ${d.freeCap}, one per wallet`,
    `- Sales close: ${iso(d.closesAt)} (unix ${d.closesAt.toString()}) or at sell-out`,
    `- Draw time: ${iso(d.drawAt)} (unix ${d.drawAt.toString()}); keeper/operator-only for the first ${Math.round(d.publicGraceSecs / 60)} min, then anyone`,
  ];
  if (kind === "pot") {
    lines.push(
      `- Split of every paid ticket: ${fmtBps(d.houseBps)} house · ${fmtBps(d.potBps)} pot · ${fmtBps(d.instantBps)} instant-win pool`,
      `- Grand prize: the pot plus the unwon instant-win pool at settlement`,
      "",
      "### Instant-win table (per ticket)",
      "",
      "| Prize | Odds |",
      "|---|---|",
      ...d.iwTiers
        .filter((t) => t.kind !== TIER_NONE)
        .map((t) => `| ${t.kind === TIER_SOL_SHARE ? `${fmtBps(t.value)} of your pool snapshot (SOL)` : `${t.value} free-ticket credit${t.value > 1 ? "s" : ""}`} | ${t.odds} in ${d.iwDenominator.toLocaleString("en-US")} |`),
    );
    const hit = d.iwTiers.reduce((a, t) => a + t.odds, 0);
    if (hit) lines.push("", `Any instant result: 1 in ${(d.iwDenominator / hit).toFixed(1)}.`);
  } else {
    lines.push(
      `- Grand prize: ${sol(d.prizeLamports)} SOL, escrowed in the vault at creation`,
      `- Minimum paid tickets: ${d.minTickets} — below this at the draw time, the draw is cancelled and every paid entry refunded in full`,
      `- House share: at least ${fmtBps(d.houseBps)} of ticket revenue at sell-out; at least ${fmtBps(d.floorMarginBps)} over the prize at the minimum`,
    );
  }
  return `${template}\n## 7. Parameters of this draw\n\n${lines.join("\n")}\n`;
}

/** The subset of DrawV3 fields the terms are rendered from (for a draw that does not exist yet). */
export function drawShape(x: {
  kind: "pot" | "headline"; ticketPrice: BN; ticketCap: number; maxPerTx: number; maxPerWallet: number; freeCap: number;
  closesAt: BN; drawAt: BN; publicGraceSecs: number; houseBps: number; potBps: number; instantBps: number;
  prizeLamports: BN; minTickets: number; floorMarginBps: number; iwDenominator: number; iwTiers: TierV3[];
}) {
  return { ...x, kind: { [x.kind]: {} } as object };
}

const padTiers = (t: TierV3[]) => [...t, ...Array(4 - t.length).fill({ odds: 0, kind: 0, value: 0 })] as TierV3[];

export type PotOverrides = Partial<Omit<PotPreset, "label" | "tiers">> & { closesAt?: number; drawAt?: number };
export type HeadlineOverrides = Partial<Omit<HeadlinePreset, "label">> & { closesAt?: number; drawAt?: number };

/** Builds + checks create_pot_draw params (same checks as the program, so mistakes fail before sending). */
export function buildPotDraw(preset: PotPreset, o: PotOverrides, closesAtDefault: number) {
  const p = { ...preset, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) } as PotPreset & PotOverrides;
  const closesAt = p.closesAt ?? closesAtDefault;
  const drawAt = p.drawAt ?? closesAt;
  const shape = drawShape({
    kind: "pot", ticketPrice: lamports(p.price), ticketCap: p.cap, maxPerTx: p.perTx, maxPerWallet: p.perWallet,
    freeCap: p.freeCap, closesAt: new BN(closesAt), drawAt: new BN(drawAt), publicGraceSecs: Math.round(p.graceMin * 60),
    houseBps: p.houseBps, potBps: p.potBps, instantBps: p.instantBps, prizeLamports: new BN(0), minTickets: 0,
    floorMarginBps: 0, iwDenominator: p.denominator, iwTiers: padTiers(p.tiers),
  });
  checkCommon(shape);
  if (p.houseBps + p.potBps + p.instantBps !== 10_000) throw new Error("house + pot + instant must be 10000 bps");
  if (p.potBps < POT_BPS_MIN) throw new Error(`pot_bps must be ≥ ${POT_BPS_MIN}`);
  const odds = p.tiers.reduce((a, t) => a + t.odds, 0);
  const creditEv = p.tiers.filter((t) => t.kind === TIER_CREDITS).reduce((a, t) => a + t.odds * t.value, 0);
  if (p.denominator ? odds === 0 || odds > p.denominator || creditEv >= p.denominator : odds !== 0)
    throw new Error("invalid instant tiers (odds sum / expected credits per ticket)");
  for (const t of p.tiers) {
    if (t.kind === TIER_SOL_SHARE && !(t.odds > 0 && t.value > 0 && t.value <= SOL_SHARE_MAX_BPS)) throw new Error("bad sol_share tier");
    if (t.kind === TIER_CREDITS && !(t.odds > 0 && t.value > 0 && t.value <= CREDITS_TIER_MAX)) throw new Error("bad credits tier");
  }
  return shape;
}

export function buildHeadlineDraw(preset: HeadlinePreset, o: HeadlineOverrides, closesAtDefault: number) {
  const p = { ...preset, ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) } as HeadlinePreset & HeadlineOverrides;
  const closesAt = p.closesAt ?? closesAtDefault;
  const drawAt = p.drawAt ?? closesAt;
  const shape = drawShape({
    kind: "headline", ticketPrice: lamports(p.price), ticketCap: p.cap, maxPerTx: p.perTx, maxPerWallet: p.perWallet,
    freeCap: p.freeCap, closesAt: new BN(closesAt), drawAt: new BN(drawAt), publicGraceSecs: Math.round(p.graceMin * 60),
    houseBps: p.houseBps, potBps: 0, instantBps: 0, prizeLamports: lamports(p.prize), minTickets: p.minTickets,
    floorMarginBps: p.floorMarginBps, iwDenominator: 0, iwTiers: padTiers([]),
  });
  checkCommon(shape);
  const price = BigInt(shape.ticketPrice.toString());
  const prize = BigInt(shape.prizeLamports.toString());
  if (prize <= 0n) throw new Error("prize must be > 0");
  if (p.minTickets < 1 || p.minTickets > p.cap) throw new Error("min_tickets must be in [1, cap]");
  if (p.floorMarginBps < FLOOR_MARGIN_BPS_MIN) throw new Error(`floor margin must be ≥ ${FLOOR_MARGIN_BPS_MIN} bps`);
  if (BigInt(p.cap) * price * BigInt(10_000 - p.houseBps) < prize * 10_000n)
    throw new Error(`sell-out leaves the house < ${p.houseBps} bps: cap × price × (1 − house) must be ≥ prize`);
  if (BigInt(p.minTickets) * price * 10_000n < prize * BigInt(10_000 + p.floorMarginBps))
    throw new Error(`min_tickets × price must be ≥ prize × (1 + ${p.floorMarginBps} bps)`);
  return shape;
}

function checkCommon(s: ReturnType<typeof drawShape>) {
  const now = nowSecs();
  if (s.ticketPrice.lten(0) || s.ticketCap <= 0) throw new Error("price and cap must be > 0");
  if (s.maxPerTx < 1 || s.maxPerTx > MAX_PER_TX || s.maxPerWallet < 1) throw new Error("bad per-tx / per-wallet limits");
  if (s.closesAt.toNumber() <= now) throw new Error("closes_at must be in the future");
  if (s.drawAt.lt(s.closesAt)) throw new Error("draw_at must be ≥ closes_at");
  if (s.publicGraceSecs > PUBLIC_GRACE_MAX) throw new Error("public grace must be ≤ 48h");
  if (s.houseBps < HOUSE_BPS_MIN || s.houseBps > HOUSE_BPS_MAX) throw new Error(`house_bps must be in [${HOUSE_BPS_MIN}, ${HOUSE_BPS_MAX}]`);
}

const commonArgs = (s: ReturnType<typeof drawShape>, termsHash: Buffer) => ({
  ticketPrice: s.ticketPrice,
  ticketCap: s.ticketCap,
  maxPerTx: s.maxPerTx,
  maxPerWallet: s.maxPerWallet,
  freeCap: s.freeCap,
  closesAt: s.closesAt,
  drawAt: s.drawAt,
  publicGraceSecs: s.publicGraceSecs,
  houseBps: s.houseBps,
  termsHash: Array.from(termsHash),
});

/** Sends create_pot_draw / create_headline_draw for `shape`; signer = provider wallet. Returns id, draw, terms. */
export async function createDraw(program: DrawsolProgram, shape: ReturnType<typeof drawShape>) {
  const config = await program.account.config.fetch(configPda());
  const id = config.nextDrawId.toNumber();
  const terms = renderTerms(id, shape);
  const termsHash = sha256(terms);
  const draw = drawPda(id);
  const signer = program.provider.publicKey!;
  let sig: string;
  if (kindName(shape.kind) === "pot") {
    sig = await program.methods
      .createPotDraw({
        common: commonArgs(shape, termsHash),
        potBps: shape.potBps,
        instantBps: shape.instantBps,
        iwDenominator: shape.iwDenominator,
        iwTiers: shape.iwTiers,
      })
      .accountsPartial({ config: configPda(), draw, vault: vaultPda(draw), creator: signer })
      .rpc();
  } else {
    sig = await program.methods
      .createHeadlineDraw({
        common: commonArgs(shape, termsHash),
        prizeLamports: shape.prizeLamports,
        minTickets: shape.minTickets,
        floorMarginBps: shape.floorMarginBps,
      })
      .accountsPartial({ config: configPda(), draw, vault: vaultPda(draw), admin: signer })
      .rpc();
  }
  return { id, draw, terms, termsHash, sig };
}

// ------------------------------------------------------------------ actions

const NO_ORAO = { vrfRequest: null, vrfConfig: null, vrfTreasury: null, vrf: null };

/** buy_tickets; ORAO accounts only when the draw rolls. Returns the entry and its ORAO request (if any). */
export async function buyTickets(program: DrawsolProgram, draw: PublicKey, quantity: number, useCredits = 0) {
  const d = await program.account.drawV3.fetch(draw);
  const buyer = program.provider.publicKey!;
  const seq = d.entryCount;
  const nonce = randomBytes(16);
  const rolls = kindName(d.kind) === "pot" && d.iwDenominator > 0;
  const vrfRequest = rolls ? oraoRequestPda(entryVrfSeed(draw, buyer, seq, nonce)) : null;
  const orao = rolls
    ? { vrfRequest, vrfConfig: oraoNetworkStatePda(), vrfTreasury: await oraoTreasury(program), vrf: ORAO_VRF_ID }
    : NO_ORAO;
  const sig = await program.methods
    .buyTickets(quantity, useCredits, Array.from(nonce))
    .accountsPartial({
      draw, vault: vaultPda(draw), entry: entryPda(draw, seq), player: playerPda(draw, buyer),
      profile: profilePda(buyer), buyer, ...orao,
    })
    .rpc();
  return { entry: entryPda(draw, seq), seq, firstTicket: d.nextTicket, vrfRequest, sig };
}

export async function claimFreeEntry(program: DrawsolProgram, draw: PublicKey) {
  const d = await program.account.drawV3.fetch(draw);
  const buyer = program.provider.publicKey!;
  const seq = d.entryCount;
  const nonce = randomBytes(16);
  const rolls = kindName(d.kind) === "pot" && d.iwDenominator > 0;
  const vrfRequest = rolls ? oraoRequestPda(entryVrfSeed(draw, buyer, seq, nonce)) : null;
  const orao = rolls
    ? { vrfRequest, vrfConfig: oraoNetworkStatePda(), vrfTreasury: await oraoTreasury(program), vrf: ORAO_VRF_ID }
    : NO_ORAO;
  const sig = await program.methods
    .claimFreeEntry(Array.from(nonce))
    .accountsPartial({ draw, entry: entryPda(draw, seq), player: playerPda(draw, buyer), profile: profilePda(buyer), buyer, ...orao })
    .rpc();
  return { entry: entryPda(draw, seq), seq, ticket: d.nextTicket, vrfRequest, sig };
}

/** reveal_entry for one entry (permissionless). */
export async function revealEntry(program: DrawsolProgram, draw: PublicKey, entry: PublicKey, e: EntryAccount) {
  return program.methods
    .revealEntry()
    .accountsPartial({
      draw, vault: vaultPda(draw), entry, player: playerPda(draw, e.owner), profile: profilePda(e.owner),
      owner: e.owner, vrfRequest: e.vrfRequest,
    })
    .rpc();
}

/** Reveals every rolled, unrevealed entry whose randomness is fulfilled. Returns the number revealed. */
export async function revealReady(program: DrawsolProgram, draw: PublicKey): Promise<number> {
  const d = await program.account.drawV3.fetch(draw);
  if (statusName(d.status) === "cancelled" || d.revealedEntries >= d.rolledEntries) return 0;
  let n = 0;
  for (const { publicKey, account: e } of await fetchEntries(program, draw)) {
    if (!e.needsReveal || e.revealed) continue;
    const rnd = await readRandomness(program.provider.connection, e.vrfRequest, e.vrfSeed);
    if (!rnd) continue;
    try {
      const sig = await revealEntry(program, draw, publicKey, e);
      const after = await program.account.entryV3.fetch(publicKey);
      log(`draw #${d.id} entry #${e.seq}: revealed ${e.count} tickets from #${e.firstTicket}, tiers=[${after.tiers.slice(0, e.count).join(",")}] ` +
        `sol=${sol(after.solPaid)} credits=${after.creditsWon} ${sig}`);
      n++;
    } catch (err) {
      log(`reveal of draw #${d.id} entry #${e.seq} failed:`, (err as Error).message);
    }
  }
  return n;
}

/** request_draw for a due Open draw. Returns the ORAO request, or null if the draw was cancelled instead. */
export async function requestDraw(program: DrawsolProgram, draw: PublicKey): Promise<PublicKey | null> {
  const d = await program.account.drawV3.fetch(draw);
  const nonce = randomBytes(16);
  const cancels = willCancelAtRequest(d);
  const vrfRequest = cancels ? null : oraoRequestPda(drawVrfSeed(draw, d.nextTicket, nonce));
  const orao = cancels
    ? NO_ORAO
    : { vrfRequest, vrfConfig: oraoNetworkStatePda(), vrfTreasury: await oraoTreasury(program), vrf: ORAO_VRF_ID };
  const sig = await program.methods
    .requestDraw(Array.from(nonce))
    .accountsPartial({
      config: configPda(), draw, vault: vaultPda(draw), authority: d.authority, payer: program.provider.publicKey!, ...orao,
    })
    .rpc();
  if (cancels) {
    const why = d.nextTicket === 0 ? "no tickets" : `undersold (${d.paidTickets}/${d.minTickets} paid tickets): refunds open`;
    log(`draw #${d.id} cancelled at request — ${why}${kindName(d.kind) === "headline" ? ", prize returned to the authority" : ""} ${sig}`);
    return null;
  }
  log(`draw #${d.id} requested: ${d.nextTicket} tickets, ORAO request ${vrfRequest} ${sig}`);
  return vrfRequest;
}

/** settle_draw if the draw randomness is fulfilled. Returns the result when settled. */
export async function settleIfReady(program: DrawsolProgram, draw: PublicKey) {
  const d = await program.account.drawV3.fetch(draw);
  if (statusName(d.status) !== "drawing") return null;
  const rnd = await readRandomness(program.provider.connection, d.drawVrfRequest, d.drawVrfSeed);
  if (!rnd) return null;
  const w = winningTicket(rnd, d.nextTicket);
  const entries = await fetchEntries(program, draw);
  const hit = entries.find(({ account: e }) => w >= e.firstTicket && w < e.firstTicket + e.count);
  if (!hit) throw new Error(`no entry holds winning ticket ${w}`);
  const sig = await program.methods
    .settleDraw()
    .accountsPartial({ draw, vault: vaultPda(draw), vrfRequest: d.drawVrfRequest, winningEntry: hit.publicKey, winner: hit.account.owner })
    .rpc();
  const after = await program.account.drawV3.fetch(draw);
  log(`draw #${d.id} settled: ticket #${w} (entry #${hit.account.seq}) → ${hit.account.owner}, ${sol(after.prizePaidLamports)} SOL ${sig}`);
  return { id: d.id.toNumber(), kind: kindName(d.kind), ticket: w, winner: hit.account.owner, prize: after.prizePaidLamports, sig };
}

/** cancel_draw once the randomness grace period is over. */
export async function cancelIfStuck(program: DrawsolProgram, draw: PublicKey, now = nowSecs()) {
  const d = await program.account.drawV3.fetch(draw);
  if (statusName(d.status) !== "drawing" || now <= d.drawAt.toNumber() + CANCEL_GRACE_SECS) return false;
  if (await readRandomness(program.provider.connection, d.drawVrfRequest, d.drawVrfSeed)) return false;
  const sig = await program.methods.cancelDraw().accountsPartial({ draw }).rpc();
  log(`draw #${d.id} cancelled (randomness timeout) ${sig}`);
  return true;
}

/** claim_refund for every unrefunded entry of a cancelled draw that is owed something. */
export async function refundAll(program: DrawsolProgram, draw: PublicKey) {
  let total = 0n;
  for (const { publicKey, account: e } of await fetchEntries(program, draw)) {
    if (e.refunded) continue;
    const amount = BigInt(e.paidLamports.toString()) - BigInt(e.solPaid.toString());
    if (amount <= 0n && e.creditCount === 0) continue;
    const sig = await program.methods
      .claimRefund()
      .accountsPartial({ draw, vault: vaultPda(draw), entry: publicKey, profile: profilePda(e.owner), owner: e.owner })
      .rpc();
    log(`refunded entry #${e.seq}: ${sol(new BN((amount > 0n ? amount : 0n).toString()))} SOL, ${e.creditCount} credits → ${e.owner} ${sig}`);
    total += amount > 0n ? amount : 0n;
  }
  return total;
}
