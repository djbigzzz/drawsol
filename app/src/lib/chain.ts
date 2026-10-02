/**
 * The only module that knows the Anchor IDL's names. Everything else in the app
 * works with the plain views in ./types.
 */
import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "@/idl/drawsol.json";
import { ORAO_NETWORK_STATE, ORAO_PROGRAM_ID, PROGRAM_ID } from "./config";
import type { ConfigView, DrawStatus, DrawView, EntryView, PlayerView } from "./types";
import { fetchOraoNetwork } from "./orao";

export const IDL = idlJson as unknown as Idl;

export { configPda, drawPda, vaultPda, playerPda, entryPda } from "./pdas";
import { configPda, entryPda, playerPda, vaultPda } from "./pdas";

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

// ---------- decoding ----------
/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number => (BN.isBN(v) ? (v as BN).toNumber() : Number(v));
const big = (v: any): bigint => BigInt(BN.isBN(v) ? (v as BN).toString() : v);
const bytes = (v: any): Uint8Array => Uint8Array.from(v as number[]);
const status = (s: any): DrawStatus => Object.keys(s)[0] as DrawStatus;

export function decodeDraw(address: PublicKey, a: any): DrawView {
  return {
    address,
    id: num(a.id),
    authority: a.authority,
    status: status(a.status),
    ticketPrice: big(a.ticketPrice),
    ticketCap: num(a.ticketCap),
    maxPerTx: num(a.maxPerTx),
    maxPerWallet: num(a.maxPerWallet),
    freeCap: num(a.freeCap),
    createdAt: num(a.createdAt),
    closesAt: num(a.closesAt),
    prizeLamports: big(a.prizeLamports),
    iwReserveLamports: big(a.iwReserveLamports),
    iwPaidLamports: big(a.iwPaidLamports),
    iwDenominator: num(a.iwDenominator),
    iwTiers: (a.iwTiers as any[]).map((t) => ({ amount: big(t.amount), odds: num(t.odds) })),
    proceedsLamports: big(a.proceedsLamports),
    refundedLamports: big(a.refundedLamports),
    paidTickets: num(a.paidTickets),
    freeTickets: num(a.freeTickets),
    nextTicket: num(a.nextTicket),
    entryCount: num(a.entryCount),
    paidEntries: num(a.paidEntries),
    revealedEntries: num(a.revealedEntries),
    drawVrfRequest: a.drawVrfRequest,
    drawVrfSeed: bytes(a.drawVrfSeed),
    randomness: bytes(a.randomness),
    winningTicket: num(a.winningTicket),
    winningEntry: a.winningEntry,
    winner: a.winner,
    settledAt: num(a.settledAt),
    prizePaid: !!a.prizePaid,
    proceedsWithdrawn: !!a.proceedsWithdrawn,
    reserveWithdrawn: !!a.reserveWithdrawn,
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
    isFree: !!a.isFree,
    paidLamports: big(a.paidLamports),
    createdAt: num(a.createdAt),
    vrfRequest: a.vrfRequest,
    vrfSeed: bytes(a.vrfSeed),
    revealed: !!a.revealed,
    tiers: (a.tiers as number[]).slice(0, count).map(Number),
    instantPaid: big(a.instantPaid),
    refunded: !!a.refunded,
  };
}

export function decodePlayer(address: PublicKey, a: any): PlayerView {
  return {
    address,
    tickets: num(a.tickets),
    spent: big(a.spent),
    won: big(a.won),
    freeClaimed: !!a.freeClaimed,
  };
}

// ---------- reads ----------
const acc = (p: AnyProgram) => p.account as any;

export async function fetchConfig(p: AnyProgram): Promise<ConfigView | null> {
  const c = await acc(p).config.fetchNullable(configPda());
  return c ? { admin: c.admin, nextDrawId: num(c.nextDrawId) } : null;
}

export async function fetchAllDraws(p: AnyProgram): Promise<DrawView[]> {
  const all = await acc(p).draw.all();
  return (all as any[]).map((d) => decodeDraw(d.publicKey, d.account)).sort((a, b) => b.id - a.id);
}

export async function fetchDraw(p: AnyProgram, address: PublicKey): Promise<DrawView | null> {
  const d = await acc(p).draw.fetchNullable(address);
  return d ? decodeDraw(address, d) : null;
}

export function decodeDrawData(p: AnyProgram, address: PublicKey, data: Buffer): DrawView {
  return decodeDraw(address, p.coder.accounts.decode("draw", data));
}

export async function fetchEntries(
  p: AnyProgram,
  draw: PublicKey,
  owner?: PublicKey
): Promise<EntryView[]> {
  const filters: any[] = [{ memcmp: { offset: 8, bytes: draw.toBase58() } }];
  if (owner) filters.push({ memcmp: { offset: 40, bytes: owner.toBase58() } });
  const all = await acc(p).entry.all(filters);
  return (all as any[]).map((e) => decodeEntry(e.publicKey, e.account)).sort((a, b) => b.seq - a.seq);
}

/** Every Entry account of the program (all draws), newest first by creation time. */
export async function fetchAllEntries(p: AnyProgram): Promise<EntryView[]> {
  const all = await acc(p).entry.all();
  return (all as any[]).map((e) => decodeEntry(e.publicKey, e.account)).sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
}

export async function fetchEntry(p: AnyProgram, address: PublicKey): Promise<EntryView | null> {
  const e = await acc(p).entry.fetchNullable(address);
  return e ? decodeEntry(address, e) : null;
}

export async function fetchPlayer(
  p: AnyProgram,
  draw: PublicKey,
  wallet: PublicKey
): Promise<PlayerView | null> {
  const address = playerPda(draw, wallet);
  const a = await acc(p).player.fetchNullable(address);
  return a ? decodePlayer(address, a) : null;
}

// ---------- instructions ----------
const m = (p: AnyProgram) => p.methods as any;

export async function ixBuyTickets(
  p: AnyProgram,
  args: { draw: DrawView; buyer: PublicKey; quantity: number; nonce: Uint8Array; vrfRequest: PublicKey }
): Promise<{ ix: TransactionInstruction; entry: PublicKey }> {
  const { treasury } = await fetchOraoNetwork(p.provider.connection);
  const entry = entryPda(args.draw.address, args.draw.entryCount);
  const ix = await m(p)
    .buyTickets(args.quantity, Array.from(args.nonce))
    .accountsPartial({
      draw: args.draw.address,
      vault: vaultPda(args.draw.address),
      entry,
      player: playerPda(args.draw.address, args.buyer),
      buyer: args.buyer,
      vrfRequest: args.vrfRequest,
      vrfConfig: ORAO_NETWORK_STATE,
      vrfTreasury: treasury,
      vrf: ORAO_PROGRAM_ID,
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
      owner: entry.owner,
      vrfRequest: entry.vrfRequest,
    })
    .instruction() as Promise<TransactionInstruction>;
}

export function ixClaimFree(p: AnyProgram, draw: DrawView, wallet: PublicKey) {
  return m(p)
    .claimFreeEntry()
    .accountsPartial({
      draw: draw.address,
      entry: entryPda(draw.address, draw.entryCount),
      player: playerPda(draw.address, wallet),
      buyer: wallet,
      systemProgram: SystemProgram.programId,
    })
    .instruction() as Promise<TransactionInstruction>;
}

export async function ixRequestDraw(
  p: AnyProgram,
  args: { draw: DrawView; caller: PublicKey; nonce: Uint8Array; vrfRequest: PublicKey }
): Promise<TransactionInstruction> {
  const { treasury } = await fetchOraoNetwork(p.provider.connection);
  return m(p)
    .requestDraw(Array.from(args.nonce))
    .accountsPartial({
      draw: args.draw.address,
      vault: vaultPda(args.draw.address),
      authority: args.draw.authority,
      payer: args.caller,
      vrfRequest: args.vrfRequest,
      vrfConfig: ORAO_NETWORK_STATE,
      vrfTreasury: treasury,
      vrf: ORAO_PROGRAM_ID,
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
  return m(p)
    .cancelDraw()
    .accountsPartial({ draw: draw.address })
    .instruction() as Promise<TransactionInstruction>;
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

/** Program error code → IDL error name, from the generated IDL. */
export function idlErrorName(code: number): string | null {
  const errs = (IDL as any).errors as { code: number; name: string }[] | undefined;
  return errs?.find((e) => e.code === code)?.name ?? null;
}
