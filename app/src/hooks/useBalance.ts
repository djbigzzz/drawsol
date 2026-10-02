"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

/** Wallet SOL balance in lamports, live. */
export function useBalance(connection: Connection, wallet: PublicKey | null, nonce = 0) {
  const [bal, setBal] = useState<bigint | null>(null);
  const w = wallet?.toBase58() ?? null;
  useEffect(() => {
    setBal(null);
    if (!w) return;
    const key = new PublicKey(w);
    let alive = true;
    connection.getBalance(key, "confirmed").then((b) => alive && setBal(BigInt(b))).catch(() => {});
    let sub: number | null = null;
    try {
      sub = connection.onAccountChange(key, (i) => setBal(BigInt(i.lamports)), { commitment: "confirmed" });
    } catch {
      /* no websocket */
    }
    return () => {
      alive = false;
      if (sub !== null) connection.removeAccountChangeListener(sub).catch(() => {});
    };
  }, [connection, w, nonce]);
  return bal;
}
