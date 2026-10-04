"use client";

import { useEffect, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { fetchAllEntries, fetchEntries, fetchLegacyEntries, fetchPlayer, fetchProfile, type AnyProgram } from "@/lib/chain";
import type { DrawView, EntryView, PlayerView, ProfileView } from "@/lib/types";

/** Change-detector for a draw: refetch entries whenever any of these move. */
function drawKey(d: DrawView | null) {
  return d
    ? `${d.address.toBase58()}:${d.entryCount}:${d.revealedEntries}:${d.status}:${d.refundedLamports}:${d.instantsPaid}`
    : "";
}

/** All Entry accounts of a draw (memcmp on Entry.draw at offset 8); legacy v3 draws through the v3 IDL. */
export function useEntries(program: AnyProgram, legacy: AnyProgram, draw: DrawView | null, nonce = 0) {
  const [entries, setEntries] = useState<EntryView[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const key = drawKey(draw);

  useEffect(() => {
    if (!draw) return;
    let alive = true;
    (draw.legacy ? fetchLegacyEntries(legacy, draw.address) : fetchEntries(program, draw.address))
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
  }, [program, legacy, key, nonce]);

  return { entries, state };
}

/**
 * This wallet's entries + Player account in a draw. `state` is "ready" only once both have been read
 * for this wallet and draw: until then (or after a failed read) the UI shows no counts for the wallet.
 * Legacy draws: the wallet's v3 entries, no player record.
 */
export function useMyEntries(
  program: AnyProgram,
  legacy: AnyProgram,
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
    const read = draw.legacy
      ? fetchLegacyEntries(legacy, draw.address).then((all) => [all.filter((e) => e.owner.equals(wallet)), null] as const)
      : Promise.all([fetchEntries(program, draw.address, wallet), fetchPlayer(program, draw.address, wallet)]);
    read
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
  }, [program, legacy, key, w, nonce]);

  return { myEntries, player, state };
}

/**
 * Every Entry account of the program (all v4 draws, plus the entries of the v3 draws still on chain), for
 * the winners feed and its counters. Refetched when any draw's entry or reveal count moves. A failed refetch
 * keeps the last good read; "error" only when nothing has been read yet, so the feed never shows a number it
 * didn't read.
 */
export function useAllEntries(program: AnyProgram, legacy: AnyProgram, draws: DrawView[], legacyDraws: DrawView[], nonce = 0) {
  const [entries, setEntries] = useState<EntryView[]>([]);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const key = [...draws, ...legacyDraws].map(drawKey).join("|");

  useEffect(() => {
    if (!key) return;
    let alive = true;
    Promise.all([fetchAllEntries(program), ...legacyDraws.map((d) => fetchLegacyEntries(legacy, d.address))])
      .then((lists) => {
        if (!alive) return;
        setEntries(lists.flat().sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq));
        setState("ready");
      })
      .catch(() => alive && setState((s) => (s === "ready" ? s : "error")));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, legacy, key, nonce]);

  return { entries, state };
}

/**
 * The wallet's global Profile (play limits). Re-read whenever the current draw's entries move (a purchase
 * spends limit) and on refresh. null = never created.
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
