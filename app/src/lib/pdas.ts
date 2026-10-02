/** DrawSol PDAs (SPEC §2.2). Kept free of the IDL so scripts can import it. */
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

// ---------- PDAs ----------
const pda = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const configPda = () => pda([enc.encode("config")]);
export const drawPda = (id: number) => pda([enc.encode("draw"), u64le(id)]);
export const vaultPda = (draw: PublicKey) => pda([enc.encode("vault"), draw.toBytes()]);
export const playerPda = (draw: PublicKey, wallet: PublicKey) =>
  pda([enc.encode("player"), draw.toBytes(), wallet.toBytes()]);
export const entryPda = (draw: PublicKey, seq: number) =>
  pda([enc.encode("entry"), draw.toBytes(), u32le(seq)]);

