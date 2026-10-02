"use client";

import { useEffect, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { fetchEntries, fetchPlayer, type AnyProgram } from "@/lib/chain";
import type { DrawView, EntryView, PlayerView } from "@/lib/types";

/** Change-detector for a draw: refetch entries whenever any of these move. */
function drawKey(d: DrawView | null) {
  return d
    ? `${d.address.toBase58()}:${d.entryCount}:${d.revealedEntries}:${d.status}:${d.refundedLamports}`
    : "";
}

/** All Entry accounts of a draw (memcmp on Entry.draw at offset 8). */
export function useEntries(program: AnyProgram, draw: DrawView | null, nonce = 0) {
  const [entries, setEntries] = useState<EntryView[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const key = drawKey(draw);

  useEffect(() => {
    if (!draw) return;
    let alive = true;
    fetchEntries(program, draw.address)
      .then((e) => {
        if (!alive) return;
        setEntries(e);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, key, nonce]);

  return { entries, state };
}

/** This wallet's entries + Player account in a draw. */
export function useMyEntries(
  program: AnyProgram,
  draw: DrawView | null,
  wallet: PublicKey | null,
  nonce = 0
) {
  const [myEntries, setMine] = useState<EntryView[]>([]);
  const [player, setPlayer] = useState<PlayerView | null>(null);
  const key = drawKey(draw);
  const w = wallet?.toBase58() ?? "";

  useEffect(() => {
    setMine([]);
    setPlayer(null);
  }, [w]);

  useEffect(() => {
    if (!draw || !wallet) return;
    let alive = true;
    Promise.all([fetchEntries(program, draw.address, wallet), fetchPlayer(program, draw.address, wallet)])
      .then(([e, p]) => {
        if (!alive) return;
        setMine(e);
        setPlayer(p);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, key, w, nonce]);

  return { myEntries, player };
}
