/**
 * The only module that knows the Anchor IDL's names. Everything else in the app works with the plain
 * views in ./types. The v4 IDL (src/idl/drawsol.json) drives every read and transaction; the v3 IDL
 * (src/idl/drawsol-v3.json) is used read-only, for the v3 draws still on chain (Nº 2 settled, Nº 3
 * cancelled) while their accounts exist. v2 draws Nº 0 and Nº 1 are closed and no longer read.
 */
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  type AccountInfo,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "@/idl/drawsol.json";
import idlV3Json from "@/idl/drawsol-v3.json";
import { ORAO_NETWORK_STATE, ORAO_PROGRAM_ID, PROGRAM_ID, revealCuLimit } from "./config";
import { SCHEDULE_TIER_MASK, SCHEDULE_WON_BIT } from "./fairness";
import type { ConfigView, DrawStatus, DrawView, EntryView, InstantTier, Legacy, PlayerView, PoolView, ProfileView, Tier } from "./types";
import { fetchOraoNetwork } from "./orao";

export const IDL = idlJson as unknown as Idl;
const IDL_V3 = idlV3Json as unknown as Idl;

export { configPda, drawPda, vaultPda, poolPda, schedulePda, playerPda, entryPda, profilePda, legacyDrawPda, legacyVaultPda } from "./pdas";
import { configPda, entryPda, playerPda, poolPda, profilePda, schedulePda, vaultPda } from "./pdas";

// ---------- Program ----------
const readOnlyWallet = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("read-only");
  },
  signAllTransactions: async () => {
    throw new Error("read-only");
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyProgram = Program<any>;

export function makeProgram(connection: Connection): AnyProgram {
  const provider = new AnchorProvider(connection, readOnlyWallet as never, {
    commitment: "confirmed",
  });
  return new Program(IDL, provider);
}

/** Read-only v3 program (legacy history). Never used to build a transaction. */
export function makeLegacyProgram(connection: Connection): AnyProgram {
  const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: "confirmed" });
  return new Program(IDL_V3, provider);
}

// ---------- decoding ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number => (BN.isBN(v) ? (v as BN).toNumber() : Number(v));
const big = (v: any): bigint => BigInt(BN.isBN(v) ? (v as BN).toString() : v);
const bytes = (v: any): Uint8Array => Uint8Array.from(v as number[]);
const status = (s: any): DrawStatus => Object.keys(s)[0] as DrawStatus;
const ZERO = BigInt(0);

/** Pool account: disc[8] | remaining u32 | u32[cap]. Schedule account: disc[8] | u8[cap]. */
const POOL_REMAINING_OFFSET = 8;
const POOL_NUMBERS_OFFSET = 12;
const SCHEDULE_BYTES_OFFSET = 8;

/** The tiers in use (count > 0), in schedule order. */
function decodeTiers(a: any): Tier[] {
  return (a.tiers as any[])
    .map((t) => ({ amount: big(t.amount), count: num(t.count), set: num(t.set), won: num(t.won) }))
    .filter((t) => t.count > 0);
}

/**
 * The published schedule from the raw Schedule bytes (one per ticket number): the winning numbers of each
 * tier, ascending, and which of them a reveal has already handed out (bit 7).
 */
export function decodeSchedule(tiers: Tier[], schedule: Uint8Array): InstantTier[] {
  const out: InstantTier[] = tiers.map((t) => ({ lamports: t.amount, numbers: [], won: [] }));
  for (let i = 0; i < schedule.length; i++) {
    const b = schedule[i];
    const tier = (b & SCHEDULE_TIER_MASK) - 1;
    if (tier < 0 || tier >= out.length) continue;
    out[tier].numbers.push(i);
    if (b & SCHEDULE_WON_BIT) out[tier].won.push(i);
  }
  return out;
}

/** The `cap` schedule bytes of a Schedule account's data (fewer while the account is still growing). */
export const scheduleBytes = (data: Uint8Array, cap: number) => data.subarray(SCHEDULE_BYTES_OFFSET, SCHEDULE_BYTES_OFFSET + cap);

export function decodeDraw(address: PublicKey, a: any, schedule: Uint8Array): DrawView {
  const tiers = decodeTiers(a);
  return {
    address,
    id: num(a.id),
    legacy: null,
    authority: a.authority,
    status: status(a.status),
    ticketPrice: big(a.ticketPrice),
    ticketCap: num(a.ticketCap),
    maxPerTx: num(a.maxPerTx),
    maxPerWallet: num(a.maxPerWallet),
    freeCap: num(a.freeCap),
    createdAt: num(a.createdAt),
    closesAt: num(a.closesAt),
    drawAt: num(a.drawAt),
    publicGraceSecs: num(a.publicGraceSecs),
    houseBps: num(a.houseBps),
    potBps: num(a.potBps),
    instantBps: num(a.instantBps),
    endPrizeLamports: big(a.endPrizeLamports),
    minTickets: num(a.minTickets),
    tiers,
    scheduleTotalLamports: big(a.scheduleTotalLamports),
    scheduleSet: num(a.scheduleSet),
    instantsPaid: big(a.instantsPaid),
    revenueLamports: big(a.revenue),
    houseLamports: big(a.houseLamports),
    houseWithdrawn: big(a.houseWithdrawn),
    refundedLamports: big(a.refundedLamports),
    paidTickets: num(a.paidTickets),
    freeTickets: num(a.freeTickets),
    assigned: num(a.assigned),
    nextPos: num(a.nextPos),
    entryCount: num(a.entryCount),
    revealedEntries: num(a.revealedEntries),
    drawVrfRequest: a.drawVrfRequest,
    drawVrfSeed: bytes(a.drawVrfSeed),
    randomness: bytes(a.randomness),
    winningPos: num(a.winningPos),
    winningTicket: num(a.winningTicket),
    winningEntry: a.winningEntry,
    winner: a.winner,
    endPrizePaid: big(a.endPrizePaid),
    settledAt: num(a.settledAt),
    prizePaid: !!a.prizePaid,
    escrowReturned: !!a.escrowReturned,
    instantEscrowReturned: !!a.instantEscrowReturned,
    termsHash: bytes(a.termsHash),
    schedule: decodeSchedule(tiers, schedule),
    guaranteed: true,
    randomNumbers: true,
  };
}

export function decodeEntry(address: PublicKey, a: any): EntryView {
  const count = num(a.count);
  const revealed = !!a.revealed;
  return {
    address,
    draw: a.draw,
    owner: a.owner,
    seq: num(a.seq),
    firstPos: num(a.firstPos),
    count,
    isFree: !!a.isFree,
    paidLamports: big(a.paidLamports),
    createdAt: num(a.createdAt),
    vrfRequest: a.vrfRequest,
    vrfSeed: bytes(a.vrfSeed),
    needsReveal: true,
    revealed,
    instantPaid: big(a.instantPaid),
    refunded: !!a.refunded,
    tickets: revealed ? (a.tickets as any[]).slice(0, count).map(num) : [],
    prizes: revealed ? Array.from(a.prizes as ArrayLike<number>).slice(0, count).map(Number) : [],
  };
}

export function decodePlayer(address: PublicKey, a: any): PlayerView {
  return {
    address,
    tickets: num(a.tickets),
    spent: big(a.paid),
    won: big(a.wonLamports),
    freeClaimed: !!a.freeClaimed,
  };
}

export function decodeProfile(address: PublicKey, a: any): ProfileView {
  return {
    address,
    limitLamports: big(a.limitLamports),
    pendingLimit: big(a.pendingLimit),
    pendingFrom: num(a.pendingFrom),
    periodStart: num(a.periodStart),
    periodSpent: big(a.periodSpent),
    excludedUntil: num(a.excludedUntil),
  };
}

/**
 * A v3 DrawV3 account mapped onto the v4 view (history only). A pot draw's end prize was its pot plus the
 * unwon instant pool; a headline draw's its escrow. Tickets were numbered sequentially: positions are
 * ticket numbers, so winning_pos = winning_ticket.
 */
export function decodeLegacyDraw(address: PublicKey, a: any): DrawView {
  const legacy: Legacy = Object.keys(a.kind)[0] === "pot" ? "pot" : "headline";
  const pot = legacy === "pot";
  const potLamports = big(a.potLamports);
  const instantPool = big(a.instantPoolLamports);
  return {
    address,
    id: num(a.id),
    legacy,
    authority: a.authority,
    status: status(a.status),
    ticketPrice: big(a.ticketPrice),
    ticketCap: num(a.ticketCap),
    maxPerTx: num(a.maxPerTx),
    maxPerWallet: num(a.maxPerWallet),
    freeCap: num(a.freeCap),
    createdAt: num(a.createdAt),
    closesAt: num(a.closesAt),
    drawAt: num(a.drawAt),
    publicGraceSecs: num(a.publicGraceSecs),
    houseBps: num(a.houseBps),
    potBps: num(a.potBps),
    instantBps: num(a.instantBps),
    endPrizeLamports: pot ? potLamports + instantPool : big(a.prizeLamports),
    minTickets: num(a.minTickets),
    tiers: [],
    scheduleTotalLamports: ZERO,
    scheduleSet: 0,
    instantsPaid: ZERO,
    revenueLamports: big(a.revenueLamports),
    houseLamports: big(a.houseLamports),
    houseWithdrawn: big(a.houseWithdrawn),
    refundedLamports: big(a.refundedLamports),
    paidTickets: num(a.paidTickets),
    freeTickets: num(a.freeTickets),
    assigned: num(a.nextTicket),
    nextPos: num(a.nextTicket),
    entryCount: num(a.entryCount),
    revealedEntries: num(a.revealedEntries),
    drawVrfRequest: a.drawVrfRequest,
    drawVrfSeed: bytes(a.drawVrfSeed),
    randomness: bytes(a.randomness),
    winningPos: num(a.winningTicket),
    winningTicket: num(a.winningTicket),
    winningEntry: a.winningEntry,
    winner: a.winner,
    endPrizePaid: big(a.prizePaidLamports),
    settledAt: num(a.settledAt),
    prizePaid: !!a.prizePaid,
    escrowReturned: false,
    instantEscrowReturned: false,
    termsHash: bytes(a.termsHash),
    schedule: [],
    guaranteed: pot,
    randomNumbers: false,
    legacyInstantPool: pot ? instantPool : undefined,
  };
}

/** A v3 EntryV3 account mapped onto the v4 view: its tickets are the sequential range it was sold. */
export function decodeLegacyEntry(address: PublicKey, a: any): EntryView {
  const count = num(a.count);
  const first = num(a.firstTicket);
  return {
    address,
    draw: a.draw,
    owner: a.owner,
    seq: num(a.seq),
    firstPos: first,
    count,
    isFree: !!a.isFree,
    paidLamports: big(a.paidLamports),
    createdAt: num(a.createdAt),
    vrfRequest: a.vrfRequest,
    vrfSeed: bytes(a.vrfSeed),
    needsReveal: !!a.needsReveal,
    revealed: !!a.revealed,
    instantPaid: big(a.solPaid),
    refunded: !!a.refunded,
    tickets: Array.from({ length: count }, (_, i) => first + i),
    prizes: (a.tiers as number[]).slice(0, count).map(Number),
    legacyCreditsWon: num(a.creditsWon),
  };
}

// ---------- reads ----------
const acc = (p: AnyProgram) => p.account as any;

/** Config: admin | keeper | next_draw_id | bump (byte-identical since v3). */
export function parseConfig(data: Uint8Array): ConfigView | null {
  if (data.length < 8 + 32 + 32 + 8) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { admin: new PublicKey(data.subarray(8, 40)), keeper: new PublicKey(data.subarray(40, 72)), nextDrawId: Number(dv.getBigUint64(72, true)) };
}

export async function fetchConfig(p: AnyProgram): Promise<ConfigView | null> {
  const info = await p.provider.connection.getAccountInfo(configPda(), "confirmed");
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  return parseConfig(info.data);
}

/** The Schedule accounts of several draws, in order; a missing one is an error (an Open draw always has one). */
async function fetchSchedules(conn: Connection, draws: { address: PublicKey; cap: number }[]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (let i = 0; i < draws.length; i += 100) {
    const chunk = draws.slice(i, i + 100);
    const infos = await conn.getMultipleAccountsInfo(
      chunk.map((d) => schedulePda(d.address)),
      "confirmed"
    );
    infos.forEach((info: AccountInfo<Buffer> | null, k) => {
      if (!info || !info.owner.equals(PROGRAM_ID)) throw new Error(`no schedule account for draw ${chunk[k].address.toBase58()}`);
      out.push(scheduleBytes(info.data, chunk[k].cap));
    });
  }
  return out;
}

/**
 * Every v4 draw with its schedule, newest id first. Drafts (nothing escrowed, not on sale) are not part of
 * the public catalogue.
 */
export async function fetchAllDraws(p: AnyProgram): Promise<DrawView[]> {
  const all = ((await acc(p).drawV4.all()) as any[]).filter((d) => status(d.account.status) !== "draft");
  const schedules = await fetchSchedules(
    p.provider.connection,
    all.map((d) => ({ address: d.publicKey as PublicKey, cap: num(d.account.ticketCap) }))
  );
  return all.map((d, i) => decodeDraw(d.publicKey, d.account, schedules[i])).sort((a, b) => b.id - a.id);
}

/**
 * The v3 draws still on chain (read-only history). legacy_close_v3 closes them one by one, so a missing
 * account simply isn't shown.
 */
export async function fetchLegacyDraws(legacy: AnyProgram): Promise<DrawView[]> {
  const all = await acc(legacy).drawV3.all();
  return (all as any[]).map((d) => decodeLegacyDraw(d.publicKey, d.account)).sort((a, b) => b.id - a.id);
}

export async function fetchLegacyEntries(legacy: AnyProgram, draw: PublicKey): Promise<EntryView[]> {
  const all = await acc(legacy).entryV3.all([{ memcmp: { offset: 8, bytes: draw.toBase58() } }]);
  return (all as any[]).map((e) => decodeLegacyEntry(e.publicKey, e.account)).sort((a, b) => b.seq - a.seq);
}

/** One draw and its schedule, read together; the raw schedule bytes come back too, for onAccountChange decodes. */
export async function fetchDraw(p: AnyProgram, address: PublicKey): Promise<{ draw: DrawView; schedule: Uint8Array } | null> {
  const conn = p.provider.connection;
  const [info, sched] = await conn.getMultipleAccountsInfo([address, schedulePda(address)], "confirmed");
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  const a = p.coder.accounts.decode("drawV4", info.data);
  if (!sched) throw new Error("no schedule account");
  const schedule = scheduleBytes(sched.data, num(a.ticketCap));
  return { draw: decodeDraw(address, a, schedule), schedule };
}

/** Only the Pool account's `remaining` counter (a 4-byte slice), for the live "numbers left" figure. */
export async function fetchPoolRemaining(conn: Connection, draw: PublicKey): Promise<number | null> {
  const info = await conn.getAccountInfo(poolPda(draw), { commitment: "confirmed", dataSlice: { offset: POOL_REMAINING_OFFSET, length: 4 } });
  if (!info || !info.owner.equals(PROGRAM_ID) || info.data.length < 4) return null;
  return new DataView(info.data.buffer, info.data.byteOffset, 4).getUint32(0, true);
}

/** Decode a DrawV4 account's raw data (onAccountChange) against the schedule last read. */
export function decodeDrawData(p: AnyProgram, address: PublicKey, data: Buffer, schedule: Uint8Array): DrawView {
  return decodeDraw(address, p.coder.accounts.decode("drawV4", data), schedule);
}

/** The raw Pool account of a draw: numbers still in the pool are `numbers[..remaining]`. */
export async function fetchPool(conn: Connection, draw: PublicKey, cap: number): Promise<PoolView | null> {
  const info = await conn.getAccountInfo(poolPda(draw), "confirmed");
  if (!info || !info.owner.equals(PROGRAM_ID) || info.data.length < POOL_NUMBERS_OFFSET) return null;
  const dv = new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength);
  const remaining = dv.getUint32(POOL_REMAINING_OFFSET, true);
  const n = Math.min(cap, Math.floor((info.data.length - POOL_NUMBERS_OFFSET) / 4));
  const numbers: number[] = [];
  for (let i = 0; i < n; i++) numbers.push(dv.getUint32(POOL_NUMBERS_OFFSET + 4 * i, true));
  return { remaining, numbers };
}

export async function fetchEntries(p: AnyProgram, draw: PublicKey, owner?: PublicKey): Promise<EntryView[]> {
  const filters: any[] = [{ memcmp: { offset: 8, bytes: draw.toBase58() } }];
  if (owner) filters.push({ memcmp: { offset: 40, bytes: owner.toBase58() } });
  const all = await acc(p).entryV4.all(filters);
  return (all as any[]).map((e) => decodeEntry(e.publicKey, e.account)).sort((a, b) => b.seq - a.seq);
}

/** Every v4 Entry account of the program (all draws), newest first by creation time. */
export async function fetchAllEntries(p: AnyProgram): Promise<EntryView[]> {
  const all = await acc(p).entryV4.all();
  return (all as any[]).map((e) => decodeEntry(e.publicKey, e.account)).sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
}

export async function fetchEntry(p: AnyProgram, address: PublicKey): Promise<EntryView | null> {
  const e = await acc(p).entryV4.fetchNullable(address);
  return e ? decodeEntry(address, e) : null;
}

export async function fetchPlayer(p: AnyProgram, draw: PublicKey, wallet: PublicKey): Promise<PlayerView | null> {
  const address = playerPda(draw, wallet);
  const a = await acc(p).playerV4.fetchNullable(address);
  return a ? decodePlayer(address, a) : null;
}

/** The wallet's Profile; null when it has never been created (no limit, no break). */
export async function fetchProfile(p: AnyProgram, wallet: PublicKey): Promise<ProfileView | null> {
  const address = profilePda(wallet);
  const a = await acc(p).profile.fetchNullable(address);
  return a ? decodeProfile(address, a) : null;
}

// ---------- instructions ----------
const m = (p: AnyProgram) => p.methods as any;

async function oraoAccounts(p: AnyProgram, vrfRequest: PublicKey) {
  const { treasury } = await fetchOraoNetwork(p.provider.connection);
  return { vrfRequest, vrfConfig: ORAO_NETWORK_STATE, vrfTreasury: treasury, vrf: ORAO_PROGRAM_ID };
}

/** SPEC-v4 §6: request_draw's ORAO accounts are optional and passed as null on the no-tickets cancel path. */
const NO_ORAO = { vrfRequest: null, vrfConfig: null, vrfTreasury: null, vrf: null };

/** buy_tickets(quantity, client_nonce): every purchase rolls through ORAO at reveal, so its request is required. */
export async function ixBuyTickets(
  p: AnyProgram,
  args: { draw: DrawView; buyer: PublicKey; quantity: number; nonce: Uint8Array; vrfRequest: PublicKey }
): Promise<{ ix: TransactionInstruction; entry: PublicKey }> {
  const entry = entryPda(args.draw.address, args.draw.entryCount);
  const ix = await m(p)
    .buyTickets(args.quantity, Array.from(args.nonce))
    .accountsPartial({
      draw: args.draw.address,
      vault: vaultPda(args.draw.address),
      entry,
      player: playerPda(args.draw.address, args.buyer),
      profile: profilePda(args.buyer),
      buyer: args.buyer,
      ...(await oraoAccounts(p, args.vrfRequest)),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { ix, entry };
}

export async function ixClaimFree(
  p: AnyProgram,
  args: { draw: DrawView; wallet: PublicKey; nonce: Uint8Array; vrfRequest: PublicKey }
): Promise<{ ix: TransactionInstruction; entry: PublicKey }> {
  const entry = entryPda(args.draw.address, args.draw.entryCount);
  const ix = await m(p)
    .claimFreeEntry(Array.from(args.nonce))
    .accountsPartial({
      draw: args.draw.address,
      entry,
      player: playerPda(args.draw.address, args.wallet),
      profile: profilePda(args.wallet),
      buyer: args.wallet,
      ...(await oraoAccounts(p, args.vrfRequest)),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return { ix, entry };
}

/**
 * reveal_entry: permissionless; the fee payer is whoever signs the transaction. The compute budget grows with
 * the ticket count (SPEC-v4 §6), so the caller sends `computeUnits` as the transaction's limit.
 */
export async function ixRevealEntry(p: AnyProgram, draw: PublicKey, entry: EntryView): Promise<{ ix: TransactionInstruction; computeUnits: number }> {
  const ix = await m(p)
    .revealEntry()
    .accountsPartial({
      draw,
      vault: vaultPda(draw),
      pool: poolPda(draw),
      schedule: schedulePda(draw),
      entry: entry.address,
      player: playerPda(draw, entry.owner),
      owner: entry.owner,
      vrfRequest: entry.vrfRequest,
    })
    .instruction();
  return { ix, computeUnits: revealCuLimit(entry.count) };
}

/** The compute-budget instruction a reveal needs, for callers that assemble their own transaction. */
export const revealBudgetIx = (count: number) => ComputeBudgetProgram.setComputeUnitLimit({ units: revealCuLimit(count) });

export async function ixRequestDraw(
  p: AnyProgram,
  args: { draw: DrawView; caller: PublicKey; nonce: Uint8Array; vrfRequest: PublicKey | null }
): Promise<TransactionInstruction> {
  return m(p)
    .requestDraw(Array.from(args.nonce))
    .accountsPartial({
      config: configPda(),
      draw: args.draw.address,
      vault: vaultPda(args.draw.address),
      authority: args.draw.authority,
      payer: args.caller,
      ...(args.vrfRequest ? await oraoAccounts(p, args.vrfRequest) : NO_ORAO),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

/** settle_draw: the entry holding the winning position must already be revealed (SPEC-v4 §6). */
export function ixSettle(p: AnyProgram, draw: DrawView, winningEntry: EntryView) {
  return m(p)
    .settleDraw()
    .accountsPartial({
      draw: draw.address,
      vault: vaultPda(draw.address),
      vrfRequest: draw.drawVrfRequest,
      winningEntry: winningEntry.address,
      winner: winningEntry.owner,
      authority: draw.authority,
    })
    .instruction() as Promise<TransactionInstruction>;
}

export function ixCancel(p: AnyProgram, draw: DrawView, signer: PublicKey) {
  return m(p).cancelDraw().accountsPartial({ draw: draw.address, signer }).instruction() as Promise<TransactionInstruction>;
}

export function ixRefund(p: AnyProgram, draw: PublicKey, entry: EntryView) {
  return m(p)
    .claimRefund()
    .accountsPartial({
      draw,
      vault: vaultPda(draw),
      entry: entry.address,
      owner: entry.owner,
    })
    .instruction() as Promise<TransactionInstruction>;
}

export function ixSetLimit(p: AnyProgram, wallet: PublicKey, lamports: bigint) {
  return m(p)
    .setLimit(new BN(lamports.toString()))
    .accountsPartial({ profile: profilePda(wallet), wallet, systemProgram: SystemProgram.programId })
    .instruction() as Promise<TransactionInstruction>;
}

export function ixSelfExclude(p: AnyProgram, wallet: PublicKey, until: number) {
  return m(p)
    .selfExclude(new BN(until))
    .accountsPartial({ profile: profilePda(wallet), wallet, systemProgram: SystemProgram.programId })
    .instruction() as Promise<TransactionInstruction>;
}

/** Program error code → IDL error name, from the generated IDL. */
export function idlErrorName(code: number): string | null {
  const errs = (IDL as any).errors as { code: number; name: string }[] | undefined;
  return errs?.find((e) => e.code === code)?.name ?? null;
}
