"use client";

import { useEffect, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { fetchAllEntries, fetchEntries, fetchPlayer, fetchProfile, type AnyProgram } from "@/lib/chain";
import type { DrawView, EntryView, PlayerView, ProfileView } from "@/lib/types";

/** Change-detector for a draw: refetch entries whenever any of these move. */
function drawKey(d: DrawView | null) {
  return d
    ? `${d.address.toBase58()}:${d.entryCount}:${d.revealedEntries}:${d.status}:${d.refundedLamports}:${d.instantPoolLamports}`
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

/**
 * This wallet's entries + Player account in a draw. `state` is "ready" only once both have been read
 * for this wallet and draw: until then (or after a failed read) the UI shows no counts for the wallet.
 */
export function useMyEntries(
  program: AnyProgram,
  draw: DrawView | null,
  wallet: PublicKey | null,
  nonce = 0
) {
  const [myEntries, setMine] = useState<EntryView[]>([]);
  const [player, setPlayer] = useState<PlayerView | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const key = drawKey(draw);
  const w = wallet?.toBase58() ?? "";
  const scope = `${w}:${draw?.address.toBase58() ?? ""}`;

  useEffect(() => {
    setMine([]);
    setPlayer(null);
    setState("loading");
  }, [scope]);

  useEffect(() => {
    if (!draw || !wallet) return;
    let alive = true;
    Promise.all([fetchEntries(program, draw.address, wallet), fetchPlayer(program, draw.address, wallet)])
      .then(([e, p]) => {
        if (!alive) return;
        setMine(e);
        setPlayer(p);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, key, w, nonce]);

  return { myEntries, player, state };
}

/**
 * Every Entry account of the program (all draws), for the winners feed and its counters. Refetched when
 * any draw's entry or reveal count moves. A failed refetch keeps the last good read; "error" only when
 * nothing has been read yet, so the feed never shows a number it didn't read.
 */
export function useAllEntries(program: AnyProgram, draws: DrawView[], nonce = 0) {
  const [entries, setEntries] = useState<EntryView[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const key = draws.map(drawKey).join("|");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetchAllEntries(program)
      .then((e) => {
        if (!alive) return;
        setEntries(e);
        setState("ready");
      })
      .catch(() => alive && setState((s) => (s === "ready" ? s : "error")));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, key, nonce]);

  return { entries, state };
}

/**
 * The wallet's global Profile (credits and play limits). Re-read whenever the current draw's entries move
 * (a purchase spends credits and limit; a reveal may win credits) and on refresh. null = never created.
 */
export function useProfile(program: AnyProgram, draw: DrawView | null, wallet: PublicKey | null, nonce = 0) {
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const w = wallet?.toBase58() ?? "";
  const key = drawKey(draw);

  useEffect(() => {
    setProfile(null);
    setState("loading");
  }, [w]);

  useEffect(() => {
    if (!wallet) return;
    let alive = true;
    fetchProfile(program, wallet)
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        setState("ready");
      })
      .catch(() => alive && setState((s) => (s === "ready" ? s : "error")));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, w, key, nonce]);

  return { profile, state };
}
