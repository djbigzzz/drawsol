/**
 * DrawSol fairness functions — byte-for-byte the same as SPEC §2.3 / SPEC-v3 §2.4 and the program
 * (programs/drawsol/src/fairness.rs). Anyone can run these in the browser to recompute a result from ORAO
 * randomness. v3 changed only the seed domains; the v2 seeds are kept for legacy history.
 */
import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import { ORAO_PROGRAM_ID } from "./config";

const enc = new TextEncoder();
const ENTRY_DOMAIN = enc.encode("drawsol:v3:entry");
const DRAW_DOMAIN = enc.encode("drawsol:v3:draw");
const ENTRY_DOMAIN_V2 = enc.encode("drawsol:v2:entry");
const DRAW_DOMAIN_V2 = enc.encode("drawsol:v2:draw");
const TICKET_TAG = enc.encode("ticket");
const DRAW_TAG = enc.encode("draw");
const TWO_64 = BigInt(64);

/** IwTierV3.kind */
export const TIER_NONE = 0;
export const TIER_SOL_SHARE = 1;
export const TIER_CREDITS = 2;
/** UI only: a legacy v2 tier, a fixed amount in lamports (`amount`) */
export const TIER_FIXED = 3;

export interface TierSpec {
  /** winning outcomes out of the draw's denominator; the roll uses only this */
  odds: number;
  /** 0 none, 1 sol_share (value = bps of the entry's pool snapshot), 2 credits (value = free tickets), 3 legacy fixed */
  kind: number;
  value: number;
  /** legacy v2 only: the fixed amount in lamports */
  amount?: bigint;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function u64leFirst8(h: Uint8Array): bigint {
  let r = BigInt(0);
  for (let i = 7; i >= 0; i--) r = (r << BigInt(8)) | BigInt(h[i]);
  return r;
}

function asBytes(k: PublicKey | Uint8Array): Uint8Array {
  return k instanceof Uint8Array ? k : k.toBytes();
}

function check(len: number, b: Uint8Array, what: string) {
  if (b.length !== len) throw new Error(`${what} must be ${len} bytes, got ${b.length}`);
}

/** sha256("drawsol:v3:entry" || draw || buyer || seq_le_u32 || client_nonce[16]) */
export function entrySeed(
  draw: PublicKey | Uint8Array,
  buyer: PublicKey | Uint8Array,
  seq: number,
  clientNonce: Uint8Array,
  domain = ENTRY_DOMAIN
): Uint8Array {
  check(16, clientNonce, "client nonce");
  return sha256(concat(domain, asBytes(draw), asBytes(buyer), u32le(seq), clientNonce));
}

/** sha256("drawsol:v3:draw" || draw || next_ticket_le_u32 || client_nonce[16]) */
export function drawSeed(
  draw: PublicKey | Uint8Array,
  nextTicket: number,
  clientNonce: Uint8Array,
  domain = DRAW_DOMAIN
): Uint8Array {
  check(16, clientNonce, "client nonce");
  return sha256(concat(domain, asBytes(draw), u32le(nextTicket), clientNonce));
}

/** v2 (legacy) seeds, for checking history only. */
export const entrySeedV2 = (draw: PublicKey | Uint8Array, buyer: PublicKey | Uint8Array, seq: number, clientNonce: Uint8Array) =>
  entrySeed(draw, buyer, seq, clientNonce, ENTRY_DOMAIN_V2);
export const drawSeedV2 = (draw: PublicKey | Uint8Array, nextTicket: number, clientNonce: Uint8Array) =>
  drawSeed(draw, nextTicket, clientNonce, DRAW_DOMAIN_V2);

/** ORAO randomness request PDA: ["orao-vrf-randomness-request", seed] */
export function oraoRandomnessPda(seed: Uint8Array): PublicKey {
  check(32, seed, "seed");
  return PublicKey.findProgramAddressSync(
    [enc.encode("orao-vrf-randomness-request"), seed],
    ORAO_PROGRAM_ID
  )[0];
}

/** r = u64_le(sha256(rand64 || "ticket" || ticket_le_u32)[0..8]) */
export function ticketRoll(rand64: Uint8Array, ticket: number): bigint {
  check(64, rand64, "randomness");
  return u64leFirst8(sha256(concat(rand64, TICKET_TAG, u32le(ticket))));
}

/** x = (r * denominator) >> 64 */
export function ticketX(rand64: Uint8Array, ticket: number, denominator: number): number {
  return Number((ticketRoll(rand64, ticket) * BigInt(denominator)) >> TWO_64);
}

/**
 * Instant result for one ticket: 0 = no win, k = tier index + 1.
 * Walks tiers cumulatively by odds; first tier with x < cumulative wins.
 */
export function rollTicket(
  rand64: Uint8Array,
  ticket: number,
  denominator: number,
  tiers: { odds: number }[]
): number {
  if (denominator <= 0) return 0;
  const x = ticketX(rand64, ticket, denominator);
  let cumulative = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].odds === 0) continue;
    cumulative += tiers[i].odds;
    if (x < cumulative) return i + 1;
  }
  return 0;
}

export function rollEntry(
  rand64: Uint8Array,
  firstTicket: number,
  count: number,
  denominator: number,
  tiers: { odds: number }[]
): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(rollTicket(rand64, firstTicket + i, denominator, tiers));
  return out;
}

/** r = u64_le(sha256(rand64 || "draw")[0..8]) */
export function drawRoll(rand64: Uint8Array): bigint {
  check(64, rand64, "randomness");
  return u64leFirst8(sha256(concat(rand64, DRAW_TAG)));
}

/** w = (r * next_ticket) >> 64 */
export function winningTicket(rand64: Uint8Array, nextTicket: number): number {
  return Number((drawRoll(rand64) * BigInt(nextTicket)) >> TWO_64);
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(h: string): Uint8Array {
  const s = h.replace(/^0x/, "");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
