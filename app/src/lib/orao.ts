import { Connection, PublicKey } from "@solana/web3.js";
import { ORAO_NETWORK_STATE, ORAO_PROGRAM_ID } from "./config";
import type { RandomnessView } from "./types";

const RANDOMNESS_V2_DISC = "8befb8d7e356bfe2";

export interface OraoNetwork {
  treasury: PublicKey;
  /** request fee in lamports, if readable */
  fee: bigint | null;
}

let cached: Promise<OraoNetwork> | null = null;

/** Reads the ORAO network-state account; treasury is at byte offset 40, fee (u64) right after. */
export function fetchOraoNetwork(connection: Connection): Promise<OraoNetwork> {
  if (!cached) {
    cached = connection.getAccountInfo(ORAO_NETWORK_STATE).then((info) => {
      if (!info || info.data.length < 72) {
        cached = null;
        throw new Error("ORAO network state not found");
      }
      const treasury = new PublicKey(info.data.subarray(40, 72));
      let fee: bigint | null = null;
      if (info.data.length >= 80) {
        fee = new DataView(info.data.buffer, info.data.byteOffset + 72, 8).getBigUint64(0, true);
      }
      return { treasury, fee };
    });
  }
  return cached;
}

/**
 * Parses an ORAO RandomnessV2 account.
 * [0..8] disc, [8] tag (0 pending / 1 fulfilled), [9..41] client, [41..73] seed, [73..137] randomness.
 */
export function parseRandomness(address: PublicKey, data: Uint8Array, owner: PublicKey): RandomnessView {
  if (!owner.equals(ORAO_PROGRAM_ID)) throw new Error("Randomness account is not owned by ORAO");
  const disc = Array.from(data.subarray(0, 8), (x) => x.toString(16).padStart(2, "0")).join("");
  if (disc !== RANDOMNESS_V2_DISC) throw new Error("Not an ORAO RandomnessV2 account");
  const fulfilled = data[8] === 1 && data.length >= 137;
  return {
    address,
    fulfilled,
    randomness: fulfilled ? new Uint8Array(data.subarray(73, 137)) : null,
  };
}

export async function fetchRandomness(
  connection: Connection,
  address: PublicKey
): Promise<RandomnessView | null> {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) return null;
  return parseRandomness(address, info.data, info.owner);
}
