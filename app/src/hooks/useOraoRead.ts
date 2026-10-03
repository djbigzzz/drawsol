"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { useDrawSol } from "./context";

export type Orao =
  | { kind: "none" }
  | { kind: "reading" }
  | { kind: "error" }
  /** the request account exists but ORAO hasn't written the randomness yet */
  | { kind: "pending" }
  | { kind: "fulfilled"; bytes: Uint8Array };

type Slot = { o: Orao; subs: Set<(o: Orao) => void>; busy: boolean };

/**
 * One read of each ORAO request account per page, shared by every component that shows it (the draw
 * record's "Randomness fulfilled" row and the carbon slip), so the two can never disagree. A fulfilled
 * result is final and never re-read; a failed read is tried twice more (2 s, then 4 s) before it reports
 * an error, the same as the draws load, because public devnet answers 429 routinely.
 */
const slots = new Map<string, Slot>();

function slotFor(key: string): Slot {
  let s = slots.get(key);
  if (!s) {
    s = { o: { kind: "reading" }, subs: new Set(), busy: false };
    slots.set(key, s);
  }
  return s;
}

function publish(s: Slot, o: Orao) {
  s.o = o;
  s.subs.forEach((f) => f(o));
}

async function read(s: Slot, address: PublicKey, readOrao: (a: PublicKey) => Promise<Uint8Array | null>) {
  if (s.busy || s.o.kind === "fulfilled") return;
  s.busy = true;
  publish(s, { kind: "reading" });
  try {
    for (let i = 0; ; i++) {
      try {
        const r = await readOrao(address);
        publish(s, r ? { kind: "fulfilled", bytes: r } : { kind: "pending" });
        return;
      } catch {
        if (i >= 2) {
          publish(s, { kind: "error" });
          return;
        }
        await new Promise((res) => setTimeout(res, 2000 * 2 ** i));
      }
    }
  } finally {
    s.busy = false;
  }
}

/**
 * The randomness in an ORAO request account, read in this browser. `address` null: there is no request.
 * `enabled` false: don't read until asked (the carbon slip reads on Recompute). `again` changes (a draw's
 * status, say) re-read a request that was still pending.
 */
export function useOraoRead(address: PublicKey | null, { enabled = true, again }: { enabled?: boolean; again?: unknown } = {}) {
  const { readOrao } = useDrawSol();
  const key = address ? address.toBase58() : null;
  const [o, setO] = useState<Orao>(() => (key ? (slots.get(key)?.o ?? { kind: "reading" }) : { kind: "none" }));
  const [on, setOn] = useState(enabled);
  useEffect(() => setOn((v) => v || enabled), [enabled]);

  useEffect(() => {
    if (!key || !address) return setO({ kind: "none" });
    const s = slotFor(key);
    setO(s.o);
    s.subs.add(setO);
    if (on && (s.o.kind === "reading" || s.o.kind === "pending")) void read(s, address, readOrao);
    return () => {
      s.subs.delete(setO);
    };
    // address is keyed by its base58 form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on, readOrao, again]);

  const retry = useCallback(() => {
    setOn(true);
    if (!key || !address) return;
    const s = slotFor(key);
    if (s.o.kind !== "fulfilled") void read(s, address, readOrao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readOrao]);

  return { o: key && !on && o.kind === "reading" ? ({ kind: "idle" } as const) : o, retry };
}
