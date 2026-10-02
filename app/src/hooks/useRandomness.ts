"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { fetchRandomness } from "@/lib/orao";
import type { RandomnessView } from "@/lib/types";

/** Polls an ORAO request account until it is fulfilled. */
export function useRandomness(connection: Connection, address: PublicKey | null, enabled: boolean) {
  const [r, setR] = useState<RandomnessView | null>(null);
  const a = address && !address.equals(PublicKey.default) ? address.toBase58() : null;

  useEffect(() => {
    setR(null);
    if (!a || !enabled) return;
    let alive = true;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const v = await fetchRandomness(connection, new PublicKey(a));
        if (!alive) return;
        setR(v);
        if (v?.fulfilled) return;
      } catch {
        /* retry */
      }
      t = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [connection, a, enabled]);

  return r;
}

/** One-shot wait used by the reveal flow. */
export async function waitForRandomness(
  connection: Connection,
  address: PublicKey,
  timeoutMs = 90_000
): Promise<Uint8Array> {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fetchRandomness(connection, address);
      if (v?.fulfilled && v.randomness) return v.randomness;
    } catch {
      /* not created yet / transient */
    }
    if (Date.now() - start > timeoutMs) throw new Error("ORAO hasn't fulfilled yet");
    await new Promise((res) => setTimeout(res, 1000));
  }
}
