/**
 * DrawSol fairness functions — byte-for-byte the same as SPEC-v4 §3 / §6 and the program
 * (programs/drawsol/src/fairness.rs). Anyone can run these in the browser to recompute a result from ORAO
 * randomness: the ticket numbers a reveal handed out (Fisher–Yates over the draw's Pool account) and the
 * winning position of the end-prize draw. The v3 / v2 seed and roll functions are kept for the legacy
 * draws still on chain (history only); they are checked against the same vectors.
 */
import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import { ORAO_PROGRAM_ID } from "./config";

const enc = new TextEncoder();
const ENTRY_DOMAIN = enc.encode("drawsol:v4:entry");
const DRAW_DOMAIN = enc.encode("drawsol:v4:draw");
const ENTRY_DOMAIN_V3 = enc.encode("drawsol:v3:entry");
const DRAW_DOMAIN_V3 = enc.encode("drawsol:v3:draw");
const ENTRY_DOMAIN_V2 = enc.encode("drawsol:v2:entry");
const DRAW_DOMAIN_V2 = enc.encode("drawsol:v2:draw");
const ASSIGN_TAG = enc.encode("assign");
const TICKET_TAG = enc.encode("ticket");
const DRAW_TAG = enc.encode("draw");
const TWO_64 = BigInt(64);

/** Schedule account byte: bit 7 = the number has been handed out (won); low 7 bits = tier + 1, 0 = no prize. */
export const SCHEDULE_WON_BIT = 0x80;
export const SCHEDULE_TIER_MASK = 0x7f;

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

/** u64, little-endian, from 8 bytes at `at`. */
function u64leAt(h: Uint8Array, at = 0): bigint {
  let r = BigInt(0);
  for (let i = at + 7; i >= at; i--) r = (r << BigInt(8)) | BigInt(h[i]);
  return r;
}

function asBytes(k: PublicKey | Uint8Array): Uint8Array {
  return k instanceof Uint8Array ? k : k.toBytes();
}

function check(len: number, b: Uint8Array, what: string) {
  if (b.length !== len) throw new Error(`${what} must be ${len} bytes, got ${b.length}`);
}

/** sha256("drawsol:v4:entry" || draw || buyer || seq_le_u32 || client_nonce[16]) */
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

/** sha256("drawsol:v4:draw" || draw || next_pos_le_u32 || client_nonce[16]) */
export function drawSeed(
  draw: PublicKey | Uint8Array,
  nextPos: number,
  clientNonce: Uint8Array,
  domain = DRAW_DOMAIN
): Uint8Array {
  check(16, clientNonce, "client nonce");
  return sha256(concat(domain, asBytes(draw), u32le(nextPos), clientNonce));
}

/** v3 / v2 (legacy) seeds, for checking history only. */
export const entrySeedV3 = (draw: PublicKey | Uint8Array, buyer: PublicKey | Uint8Array, seq: number, clientNonce: Uint8Array) =>
  entrySeed(draw, buyer, seq, clientNonce, ENTRY_DOMAIN_V3);
export const drawSeedV3 = (draw: PublicKey | Uint8Array, nextTicket: number, clientNonce: Uint8Array) =>
  drawSeed(draw, nextTicket, clientNonce, DRAW_DOMAIN_V3);
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

// ---------- v4: ticket assignment at reveal, winning position at settle ----------

/**
 * Roll for the i-th ticket of an entry (i from 0): four u64 per hash,
 * u64_le(sha256(rand64 || "assign" || (i/4)_le_u32)[8·(i%4) .. +8]).
 */
export function assignRoll(rand64: Uint8Array, i: number): bigint {
  check(64, rand64, "randomness");
  return u64leAt(sha256(concat(rand64, ASSIGN_TAG, u32le(Math.floor(i / 4)))), (i % 4) * 8);
}

/** j = roll mod remaining */
export function assignIndex(rand64: Uint8Array, i: number, remaining: number): number {
  return Number(assignRoll(rand64, i) % BigInt(remaining));
}

/**
 * Fisher–Yates swap-remove over `pool[..remaining]`, exactly as reveal_entry does it on the Pool account:
 * for i in 0..count: j = assignIndex(i, remaining); ticket = pool[j]; pool[j] = pool[remaining − 1]; remaining −= 1.
 * Mutates `pool` and returns the tickets handed out and the numbers left.
 */
export function assignTickets(rand64: Uint8Array, count: number, pool: number[], remaining: number): { tickets: number[]; remaining: number } {
  const tickets: number[] = [];
  for (let i = 0; i < count; i++) {
    if (remaining <= 0) throw new Error("pool exhausted");
    const j = assignIndex(rand64, i, remaining);
    tickets.push(pool[j]);
    pool[j] = pool[remaining - 1];
    remaining--;
  }
  return { tickets, remaining };
}

/** r = u64_le(sha256(rand64 || "draw")[0..8]) */
export function drawRoll(rand64: Uint8Array): bigint {
  check(64, rand64, "randomness");
  return u64leAt(sha256(concat(rand64, DRAW_TAG)));
}

/**
 * The winning position of the end-prize draw: (r × next_pos) >> 64. The winning ticket is
 * entry.tickets[pos − entry.first_pos] of the entry with first_pos ≤ pos < first_pos + count.
 */
export function winningPosition(rand64: Uint8Array, nextPos: number): number {
  return Number((drawRoll(rand64) * BigInt(nextPos)) >> TWO_64);
}

/** v3 / v2 name of the same function (positions were ticket numbers then). */
export const winningTicket = winningPosition;

// ---------- v3 / v2 (legacy) per-ticket instant roll, history only ----------

/** r = u64_le(sha256(rand64 || "ticket" || ticket_le_u32)[0..8]) */
export function ticketRoll(rand64: Uint8Array, ticket: number): bigint {
  check(64, rand64, "randomness");
  return u64leAt(sha256(concat(rand64, TICKET_TAG, u32le(ticket))));
}

/** x = (r * denominator) >> 64 */
export function ticketX(rand64: Uint8Array, ticket: number, denominator: number): number {
  return Number((ticketRoll(rand64, ticket) * BigInt(denominator)) >> TWO_64);
}

/** Legacy instant result for one ticket: 0 = no win, k = tier index + 1 (first tier with x < cumulative odds). */
export function rollTicket(rand64: Uint8Array, ticket: number, denominator: number, tiers: { odds: number }[]): number {
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

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(h: string): Uint8Array {
  const s = h.replace(/^0x/, "");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
