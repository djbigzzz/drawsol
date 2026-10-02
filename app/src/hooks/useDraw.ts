"use client";

import { useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { decodeDrawData, fetchDraw, vaultPda, type AnyProgram } from "@/lib/chain";
import type { DrawView } from "@/lib/types";

const POLL_MS = 15_000;

/**
 * One Draw + its Vault balance, kept live with onAccountChange and a 15 s poll fallback.
 * `failures` counts consecutive failed polls so the UI can drop to the error state.
 */
export function useDraw(program: AnyProgram, initial: DrawView | null) {
  const [draw, setDraw] = useState<DrawView | null>(initial);
  const [vault, setVault] = useState<bigint | null>(null);
  const [failures, setFailures] = useState(0);
  const addr = initial?.address.toBase58() ?? null;
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useEffect(() => {
    setDraw(initialRef.current);
    setVault(null);
    if (!addr) return;
    const conn = program.provider.connection;
    const drawKey = new PublicKey(addr);
    const vaultKey = vaultPda(drawKey);
    let alive = true;

    const poll = async () => {
      try {
        const [d, v] = await Promise.all([fetchDraw(program, drawKey), conn.getBalance(vaultKey, "confirmed")]);
        if (!alive) return;
        if (d) setDraw(d);
        setVault(BigInt(v));
        setFailures(0);
      } catch {
        if (alive) setFailures((f) => f + 1);
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);

    const subs: number[] = [];
    try {
      subs.push(
        conn.onAccountChange(
          drawKey,
          (info) => {
            try {
              setDraw(decodeDrawData(program, drawKey, info.data));
            } catch {
              /* ignore undecodable */
            }
          },
          { commitment: "confirmed" }
        )
      );
      subs.push(conn.onAccountChange(vaultKey, (info) => setVault(BigInt(info.lamports)), { commitment: "confirmed" }));
    } catch {
      /* websocket unavailable: poll covers it */
    }

    return () => {
      alive = false;
      clearInterval(t);
      subs.forEach((s) => conn.removeAccountChangeListener(s).catch(() => {}));
    };
  }, [program, addr]);

  return { draw, vault, failures };
}
