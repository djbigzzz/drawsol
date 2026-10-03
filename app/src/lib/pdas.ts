/** DrawSol PDAs (SPEC-v3 §2.1). Kept free of the IDL so scripts can import it. */
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

// ---------- v3 PDAs ----------
const pda = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const configPda = () => pda([enc.encode("config")]);
export const drawPda = (id: number) => pda([enc.encode("draw3"), u64le(id)]);
export const vaultPda = (draw: PublicKey) => pda([enc.encode("vault3"), draw.toBytes()]);
export const playerPda = (draw: PublicKey, wallet: PublicKey) =>
  pda([enc.encode("player3"), draw.toBytes(), wallet.toBytes()]);
export const entryPda = (draw: PublicKey, seq: number) =>
  pda([enc.encode("entry3"), draw.toBytes(), u32le(seq)]);
export const profilePda = (wallet: PublicKey) => pda([enc.encode("profile"), wallet.toBytes()]);

// ---------- v2 (legacy, read-only history: draws #0 and #1) ----------
export const legacyDrawPda = (id: number) => pda([enc.encode("draw"), u64le(id)]);
export const legacyVaultPda = (draw: PublicKey) => pda([enc.encode("vault"), draw.toBytes()]);
export const legacyPlayerPda = (draw: PublicKey, wallet: PublicKey) =>
  pda([enc.encode("player"), draw.toBytes(), wallet.toBytes()]);
export const legacyEntryPda = (draw: PublicKey, seq: number) =>
  pda([enc.encode("entry"), draw.toBytes(), u32le(seq)]);
