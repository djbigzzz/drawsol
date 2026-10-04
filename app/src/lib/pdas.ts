/** DrawSol PDAs (SPEC-v4 §2). Kept free of the IDL so scripts can import it. */
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./config";

const enc = new TextEncoder();

function u64le(n: number | bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
}
function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

// ---------- v4 PDAs ----------
const pda = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const configPda = () => pda([enc.encode("config")]);
export const drawPda = (id: number) => pda([enc.encode("draw4"), u64le(id)]);
export const vaultPda = (draw: PublicKey) => pda([enc.encode("vault4"), draw.toBytes()]);
/** `disc[8] | remaining u32 | u32[cap]`: the ticket numbers not yet handed out */
export const poolPda = (draw: PublicKey) => pda([enc.encode("pool"), draw.toBytes()]);
/** `disc[8] | u8[cap]`: 0 = no prize, t + 1 = tier t, bit 7 = won */
export const schedulePda = (draw: PublicKey) => pda([enc.encode("schedule"), draw.toBytes()]);
export const playerPda = (draw: PublicKey, wallet: PublicKey) =>
  pda([enc.encode("player4"), draw.toBytes(), wallet.toBytes()]);
export const entryPda = (draw: PublicKey, seq: number) =>
  pda([enc.encode("entry4"), draw.toBytes(), u32le(seq)]);
export const profilePda = (wallet: PublicKey) => pda([enc.encode("profile"), wallet.toBytes()]);

// ---------- v3 (legacy, read-only history: the v3 draws still on chain, Nº 2 and Nº 3) ----------
export const legacyDrawPda = (id: number) => pda([enc.encode("draw3"), u64le(id)]);
export const legacyVaultPda = (draw: PublicKey) => pda([enc.encode("vault3"), draw.toBytes()]);
export const legacyPlayerPda = (draw: PublicKey, wallet: PublicKey) =>
  pda([enc.encode("player3"), draw.toBytes(), wallet.toBytes()]);
export const legacyEntryPda = (draw: PublicKey, seq: number) =>
  pda([enc.encode("entry3"), draw.toBytes(), u32le(seq)]);
