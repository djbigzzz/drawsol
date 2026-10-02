"use client";

import { useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { decodeDrawData, fetchDraw, vaultPda, type AnyProgram } from "@/lib/chain";
import type { DrawView } from "@/lib/types";

const POLL_MS = 15_000;

/**
 * One Draw + its Vault balance, kept live with onAccountChange and a poll fallback (15 s while healthy).
 * After a failed poll the next one waits longer (30 s, then 60 s), so a rate-limited RPC isn't pushed
 * harder. `failures` counts consecutive failed polls; `lastOk` is when the draw was last read.
 */
export function useDraw(program: AnyProgram, initial: DrawView | null) {
  const [draw, setDraw] = useState<DrawView | null>(initial);
  const [vault, setVault] = useState<bigint | null>(null);
  const [failures, setFailures] = useState(0);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const addr = initial?.address.toBase58() ?? null;
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    setDraw(initialRef.current);
    setVault(null);
    setFailures(0);
    setLastOk(initialRef.current ? Math.floor(Date.now() / 1000) : null);
    if (!addr) return;
    const conn = program.provider.connection;
    const drawKey = new PublicKey(addr);
    const vaultKey = vaultPda(drawKey);
    let alive = true;
    let fails = 0;
    let t: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      clearTimeout(t);
      try {
        const [d, v] = await Promise.all([fetchDraw(program, drawKey), conn.getBalance(vaultKey, "confirmed")]);
        if (!alive) return;
        if (d) setDraw(d);
        setVault(BigInt(v));
        fails = 0;
        setFailures(0);
        setLastOk(Math.floor(Date.now() / 1000));
      } catch {
        if (!alive) return;
        fails += 1;
        setFailures(fails);
      }
      // 15 s, then 30 s and 60 s after consecutive failures
      const delay = POLL_MS * 2 ** Math.min(fails, 2);
      setNextAt(Date.now() + delay);
      t = setTimeout(poll, delay);
    };
    kick.current = () => void poll();
    poll();

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
      clearTimeout(t);
      kick.current = () => {};
      subs.forEach((s) => conn.removeAccountChangeListener(s).catch(() => {}));
    };
  }, [program, addr]);

  return { draw, vault, failures, lastOk, nextAt, pollNow: () => kick.current() };
}
