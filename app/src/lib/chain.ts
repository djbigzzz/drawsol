/**
 * The only module that knows the Anchor IDL's names. Everything else in the app works with the plain
 * views in ./types. The v3 IDL (src/idl/drawsol.json) drives every read and transaction; the v2 IDL
 * (src/idl/drawsol-v2.json) is used read-only, for the legacy draws Nº 0 and Nº 1 while their accounts exist.
 */
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  type AccountInfo,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "@/idl/drawsol.json";
import idlV2Json from "@/idl/drawsol-v2.json";
import { ORAO_NETWORK_STATE, ORAO_PROGRAM_ID, PROGRAM_ID } from "./config";
import { TIER_FIXED } from "./fairness";
import type { ConfigView, DrawKind, DrawStatus, DrawView, EntryView, PlayerView, ProfileView } from "./types";
import { fetchOraoNetwork } from "./orao";

export const IDL = idlJson as unknown as Idl;
const IDL_V2 = idlV2Json as unknown as Idl;

export { configPda, drawPda, vaultPda, playerPda, entryPda, profilePda, legacyDrawPda, legacyVaultPda } from "./pdas";
import { configPda, entryPda, legacyDrawPda, playerPda, profilePda, vaultPda } from "./pdas";

/** The v2 draws that may still be on chain until legacy_close_v2 closes them (v3 ids start at 2). */
export const LEGACY_DRAW_IDS = [0, 1];

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

/** Read-only v2 program (legacy history). Never used to build a transaction. */
export function makeLegacyProgram(connection: Connection): AnyProgram {
  const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: "confirmed" });
  return new Program(IDL_V2, provider);
}

// ---------- decoding ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number => (BN.isBN(v) ? (v as BN).toNumber() : Number(v));
const big = (v: any): bigint => BigInt(BN.isBN(v) ? (v as BN).toString() : v);
const bytes = (v: any): Uint8Array => Uint8Array.from(v as number[]);
const status = (s: any): DrawStatus => Object.keys(s)[0] as DrawStatus;
const kindOf = (k: any): DrawKind => Object.keys(k)[0] as DrawKind;
const ZERO = BigInt(0);

export function decodeDraw(address: PublicKey, a: any): DrawView {
  return {
    address,
    id: num(a.id),
    kind: kindOf(a.kind),
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
    prizeLamports: big(a.prizeLamports),
    minTickets: num(a.minTickets),
    floorMarginBps: num(a.floorMarginBps),
    potLamports: big(a.potLamports),
    instantPoolLamports: big(a.instantPoolLamports),
    houseLamports: big(a.houseLamports),
    houseWithdrawn: big(a.houseWithdrawn),
    revenueLamports: big(a.revenueLamports),
    refundedLamports: big(a.refundedLamports),
    iwDenominator: num(a.iwDenominator),
    iwTiers: (a.iwTiers as any[]).map((t) => ({ odds: num(t.odds), kind: num(t.kind), value: num(t.value) })),
    paidTickets: num(a.paidTickets),
    freeTickets: num(a.freeTickets),
    creditTickets: num(a.creditTickets),
    nextTicket: num(a.nextTicket),
    entryCount: num(a.entryCount),
    rolledEntries: num(a.rolledEntries),
    revealedEntries: num(a.revealedEntries),
    drawVrfRequest: a.drawVrfRequest,
    drawVrfSeed: bytes(a.drawVrfSeed),
    randomness: bytes(a.randomness),
    winningTicket: num(a.winningTicket),
    winningEntry: a.winningEntry,
    winner: a.winner,
    prizePaidLamports: big(a.prizePaidLamports),
    settledAt: num(a.settledAt),
    prizePaid: !!a.prizePaid,
    termsHash: bytes(a.termsHash),
  };
}

export function decodeEntry(address: PublicKey, a: any): EntryView {
  const count = num(a.count);
  return {
    address,
    draw: a.draw,
    owner: a.owner,
    seq: num(a.seq),
    firstTicket: num(a.firstTicket),
    count,
    paidCount: num(a.paidCount),
    creditCount: num(a.creditCount),
    isFree: !!a.isFree,
    paidLamports: big(a.paidLamports),
    createdAt: num(a.createdAt),
    poolSnapshot: big(a.poolSnapshot),
    vrfRequest: a.vrfRequest,
    vrfSeed: bytes(a.vrfSeed),
    needsReveal: !!a.needsReveal,
    revealed: !!a.revealed,
    tiers: (a.tiers as number[]).slice(0, count).map(Number),
    solPaid: big(a.solPaid),
    creditsWon: num(a.creditsWon),
    refunded: !!a.refunded,
  };
}

export function decodePlayer(address: PublicKey, a: any): PlayerView {
  return {
    address,
    tickets: num(a.tickets),
    spent: big(a.paid),
    won: big(a.wonSol),
    wonCredits: num(a.wonCredits),
    freeClaimed: !!a.freeClaimed,
  };
}

export function decodeProfile(address: PublicKey, a: any): ProfileView {
  return {
    address,
    credits: num(a.credits),
    limitLamports: big(a.limitLamports),
    pendingLimit: big(a.pendingLimit),
    pendingFrom: num(a.pendingFrom),
    periodStart: num(a.periodStart),
    periodSpent: big(a.periodSpent),
    excludedUntil: num(a.excludedUntil),
  };
}

/** A v2 Draw account, mapped onto the v3 view (kind "v2": an escrowed grand prize with a fixed-amount reserve). */
export function decodeLegacyDraw(address: PublicKey, a: any): DrawView {
  const closesAt = num(a.closesAt);
  const prizePaid = !!a.prizePaid;
  return {
    address,
    id: num(a.id),
    kind: "v2",
    authority: a.authority,
    status: status(a.status),
    ticketPrice: big(a.ticketPrice),
    ticketCap: num(a.ticketCap),
    maxPerTx: num(a.maxPerTx),
    maxPerWallet: num(a.maxPerWallet),
    freeCap: num(a.freeCap),
    createdAt: num(a.createdAt),
    closesAt,
    drawAt: closesAt,
    publicGraceSecs: 0,
    houseBps: 0,
    potBps: 0,
    instantBps: 0,
    prizeLamports: big(a.prizeLamports),
    minTickets: 0,
    floorMarginBps: 0,
    potLamports: ZERO,
    instantPoolLamports: ZERO,
    houseLamports: ZERO,
    houseWithdrawn: ZERO,
    revenueLamports: big(a.proceedsLamports),
    refundedLamports: big(a.refundedLamports),
    iwDenominator: num(a.iwDenominator),
    iwTiers: (a.iwTiers as any[]).map((t) => ({ odds: num(t.odds), kind: big(t.amount) > ZERO ? TIER_FIXED : 0, value: 0, amount: big(t.amount) })),
    paidTickets: num(a.paidTickets),
    freeTickets: num(a.freeTickets),
    creditTickets: 0,
    nextTicket: num(a.nextTicket),
    entryCount: num(a.entryCount),
    rolledEntries: num(a.paidEntries),
    revealedEntries: num(a.revealedEntries),
    drawVrfRequest: a.drawVrfRequest,
    drawVrfSeed: bytes(a.drawVrfSeed),
    randomness: bytes(a.randomness),
    winningTicket: num(a.winningTicket),
    winningEntry: a.winningEntry,
    winner: a.winner,
    prizePaidLamports: prizePaid && status(a.status) === "settled" ? big(a.prizeLamports) : ZERO,
    settledAt: num(a.settledAt),
    prizePaid,
    termsHash: bytes(a.termsHash),
    legacyIwPaid: big(a.iwPaidLamports),
  };
}

export function decodeLegacyEntry(address: PublicKey, a: any): EntryView {
  const count = num(a.count);
  const isFree = !!a.isFree;
  return {
    address,
    draw: a.draw,
    owner: a.owner,
    seq: num(a.seq),
    firstTicket: num(a.firstTicket),
    count,
    paidCount: isFree ? 0 : count,
    creditCount: 0,
    isFree,
    paidLamports: big(a.paidLamports),
    createdAt: num(a.createdAt),
    poolSnapshot: ZERO,
    vrfRequest: a.vrfRequest,
    vrfSeed: bytes(a.vrfSeed),
    needsReveal: !isFree,
    revealed: !!a.revealed,
    tiers: (a.tiers as number[]).slice(0, count).map(Number),
    solPaid: big(a.instantPaid),
    creditsWon: 0,
    refunded: !!a.refunded,
  };
}

// ---------- reads ----------
const acc = (p: AnyProgram) => p.account as any;

/**
 * Config, parsed by layout length: v3 is admin | keeper | next_draw_id | bump; until migrate_config runs the
 * account still has v2's admin | next_draw_id | bump (keeper null). Same discriminator in both.
 */
export function parseConfig(data: Uint8Array): ConfigView | null {
  if (data.length < 8 + 32 + 8) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const admin = new PublicKey(data.subarray(8, 40));
  if (data.length >= 8 + 32 + 32 + 8) {
    return { admin, keeper: new PublicKey(data.subarray(40, 72)), nextDrawId: Number(dv.getBigUint64(72, true)) };
  }
  return { admin, keeper: null, nextDrawId: Number(dv.getBigUint64(40, true)) };
}

export async function fetchConfig(p: AnyProgram): Promise<ConfigView | null> {
  const info = await p.provider.connection.getAccountInfo(configPda(), "confirmed");
  if (!info || !info.owner.equals(PROGRAM_ID)) return null;
  return parseConfig(info.data);
}

export async function fetchAllDraws(p: AnyProgram): Promise<DrawView[]> {
  const all = await acc(p).drawV3.all();
  return (all as any[]).map((d) => decodeDraw(d.publicKey, d.account)).sort((a, b) => b.id - a.id);
}

/**
 * The v2 draws still on chain (read-only history). legacy_close_v2 closes them at the cutover, so a missing or
 * undecodable account simply isn't shown.
 */
export async function fetchLegacyDraws(legacy: AnyProgram): Promise<DrawView[]> {
  const keys = LEGACY_DRAW_IDS.map((id) => legacyDrawPda(id));
  const infos = await legacy.provider.connection.getMultipleAccountsInfo(keys, "confirmed");
  const out: DrawView[] = [];
  infos.forEach((info: AccountInfo<Buffer> | null, i) => {
    if (!info || !info.owner.equals(PROGRAM_ID) || info.data.length === 0) return;
    try {
      out.push(decodeLegacyDraw(keys[i], legacy.coder.accounts.decode("draw", info.data)));
    } catch {
      /* closed or not a v2 Draw: not shown */
    }
  });
  return out;
}

export async function fetchLegacyEntries(legacy: AnyProgram, draw: PublicKey): Promise<EntryView[]> {
  const all = await acc(legacy).entry.all([{ memcmp: { offset: 8, bytes: draw.toBase58() } }]);
  return (all as any[]).map((e) => decodeLegacyEntry(e.publicKey, e.account)).sort((a, b) => b.seq - a.seq);
}

export async function fetchDraw(p: AnyProgram, address: PublicKey): Promise<DrawView | null> {
  const d = await acc(p).drawV3.fetchNullable(address);
  return d ? decodeDraw(address, d) : null;
}

export function decodeDrawData(p: AnyProgram, address: PublicKey, data: Buffer): DrawView {
  return decodeDraw(address, p.coder.accounts.decode("drawV3", data));
}

export async function fetchEntries(p: AnyProgram, draw: PublicKey, owner?: PublicKey): Promise<EntryView[]> {
  const filters: any[] = [{ memcmp: { offset: 8, bytes: draw.toBase58() } }];
  if (owner) filters.push({ memcmp: { offset: 40, bytes: owner.toBase58() } });
  const all = await acc(p).entryV3.all(filters);
  return (all as any[]).map((e) => decodeEntry(e.publicKey, e.account)).sort((a, b) => b.seq - a.seq);
}

/** Every v3 Entry account of the program (all draws), newest first by creation time. */
export async function fetchAllEntries(p: AnyProgram): Promise<EntryView[]> {
  const all = await acc(p).entryV3.all();
  return (all as any[]).map((e) => decodeEntry(e.publicKey, e.account)).sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
}

export async function fetchEntry(p: AnyProgram, address: PublicKey): Promise<EntryView | null> {
  const e = await acc(p).entryV3.fetchNullable(address);
  return e ? decodeEntry(address, e) : null;
}

export async function fetchPlayer(p: AnyProgram, draw: PublicKey, wallet: PublicKey): Promise<PlayerView | null> {
  const address = playerPda(draw, wallet);
  const a = await acc(p).playerV3.fetchNullable(address);
  return a ? decodePlayer(address, a) : null;
}

/** The wallet's Profile; null when it has never been created (no credits, no limit, no break). */
export async function fetchProfile(p: AnyProgram, wallet: PublicKey): Promise<ProfileView | null> {
  const address = profilePda(wallet);
  const a = await acc(p).profile.fetchNullable(address);
  return a ? decodeProfile(address, a) : null;
}

// ---------- instructions ----------
const m = (p: AnyProgram) => p.methods as any;

/** SPEC-v3 §6: the ORAO accounts are optional and passed as null when no roll is made. */
const NO_ORAO = { vrfRequest: null, vrfConfig: null, vrfTreasury: null, vrf: null };

async function oraoAccounts(p: AnyProgram, vrfRequest: PublicKey | null) {
  if (!vrfRequest) return NO_ORAO;
  const { treasury } = await fetchOraoNetwork(p.provider.connection);
  return { vrfRequest, vrfConfig: ORAO_NETWORK_STATE, vrfTreasury: treasury, vrf: ORAO_PROGRAM_ID };
}

/** Pot draws with instant tiers roll every ticket (paid, credit or free) through ORAO. */
export const drawRolls = (d: DrawView) => d.kind === "pot" && d.iwDenominator > 0;

export async function ixBuyTickets(
  p: AnyProgram,
  args: { draw: DrawView; buyer: PublicKey; quantity: number; useCredits: number; nonce: Uint8Array; vrfRequest: PublicKey | null }
): Promise<{ ix: TransactionInstruction; entry: PublicKey }> {
  const entry = entryPda(args.draw.address, args.draw.entryCount);
  const ix = await m(p)
    .buyTickets(args.quantity, args.useCredits, Array.from(args.nonce))
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
  args: { draw: DrawView; wallet: PublicKey; nonce: Uint8Array; vrfRequest: PublicKey | null }
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

/** Permissionless; the fee payer is whoever signs the transaction. */
export function ixRevealEntry(p: AnyProgram, draw: PublicKey, entry: EntryView) {
  return m(p)
    .revealEntry()
    .accountsPartial({
      draw,
      vault: vaultPda(draw),
      entry: entry.address,
      player: playerPda(draw, entry.owner),
      profile: profilePda(entry.owner),
      owner: entry.owner,
      vrfRequest: entry.vrfRequest,
    })
    .instruction() as Promise<TransactionInstruction>;
}

/** request_draw cancels instead of drawing when no ticket sold, or a headline draw is below its minimum. */
export const cancelsAtRequest = (d: DrawView) => d.nextTicket === 0 || (d.kind === "headline" && d.paidTickets < d.minTickets);

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
      ...(await oraoAccounts(p, args.vrfRequest)),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
}

export function ixSettle(p: AnyProgram, draw: DrawView, winningEntry: EntryView) {
  return m(p)
    .settleDraw()
    .accountsPartial({
      draw: draw.address,
      vault: vaultPda(draw.address),
      vrfRequest: draw.drawVrfRequest,
      winningEntry: winningEntry.address,
      winner: winningEntry.owner,
    })
    .instruction() as Promise<TransactionInstruction>;
}

export function ixCancel(p: AnyProgram, draw: DrawView) {
  return m(p).cancelDraw().accountsPartial({ draw: draw.address }).instruction() as Promise<TransactionInstruction>;
}

export function ixRefund(p: AnyProgram, draw: PublicKey, entry: EntryView) {
  return m(p)
    .claimRefund()
    .accountsPartial({
      draw,
      vault: vaultPda(draw),
      entry: entry.address,
      profile: profilePda(entry.owner),
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
