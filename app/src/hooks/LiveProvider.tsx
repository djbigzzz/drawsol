"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { PublicKey } from "@solana/web3.js";
import { AIRDROP_LAMPORTS, PLAYER_SPACE, PROFILE_SPACE, entrySpace, revealCuLimit } from "@/lib/config";
import {
  fetchEntries,
  fetchEntry,
  fetchLegacyEntries,
  ixBuyTickets,
  ixCancel,
  ixClaimFree,
  ixRefund,
  ixRequestDraw,
  ixRevealEntry,
  ixSelfExclude,
  ixSetLimit,
  ixSettle,
  makeLegacyProgram,
} from "@/lib/chain";
import { cancelsAtRequest, entryAtPosition, featuredDraw } from "@/lib/derive";
import { drawSeed, entrySeed, oraoRandomnessPda, winningPosition } from "@/lib/fairness";
import { fetchOraoNetwork, fetchRandomness } from "@/lib/orao";
import { randomNonce, sendIxs, TxError, type TxPhase } from "@/lib/tx";
import { airdropHuman, type HumanError } from "@/lib/errors";
import type { DrawView, EntryView } from "@/lib/types";
import {
  ActionsContext,
  DataContext,
  type ActionKey,
  type Actions,
  type Costs,
  type DrawSolData,
  type RevealSession,
} from "./context";
import { useProgram } from "./useProgram";
import { useDraws } from "./useDraws";
import { useDraw } from "./useDraw";
import { useAllEntries, useEntries, useMyEntries, useProfile } from "./useEntries";
import { useBalance } from "./useBalance";
import { useNow } from "./useNow";
import { useRandomness, waitForRandomness } from "./useRandomness";
import { useSolPrice } from "./useSolPrice";

/** The transaction's compute-unit limit when no instruction asks for more (buy, request, settle, refund…). */
const DEFAULT_CU = 400_000;

export function LiveProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const walletCtx = useWallet();
  const { setVisible } = useWalletModal();
  const program = useProgram();
  const now = useNow();
  const [nonce, setNonce] = useState(0);

  const legacy = useMemo(() => makeLegacyProgram(connection), [connection]);
  const { load, config, draws, legacyDraws, refresh: refreshDraws } = useDraws(program, legacy);
  const [selectedId, select] = useState<number | null>(null);
  const listed = useMemo(
    () => (selectedId !== null ? [...draws, ...legacyDraws].find((d) => d.id === selectedId) : undefined) ?? featuredDraw(draws),
    [draws, legacyDraws, selectedId]
  );
  const solUsd = useSolPrice();
  const { draw: current, vault, poolRemaining, failures, lastOk, nextAt, pollNow } = useDraw(program, legacy, listed);
  const { entries, state: entriesState } = useEntries(program, legacy, current, nonce);
  const pk = walletCtx.publicKey;
  const { myEntries, player, state: myState } = useMyEntries(program, legacy, current, pk, nonce);
  const { profile, state: profileState } = useProfile(program, current, pk, nonce);
  const balance = useBalance(connection, pk, nonce);
  const drawRandomness = useRandomness(
    connection,
    current?.status === "drawing" ? current.drawVrfRequest : null,
    current?.status === "drawing"
  );

  const [costs, setCosts] = useState<Costs>({ oraoFee: null, entryRentBase: null, entryRentPerTicket: null, playerRent: null, profileRent: null });
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      fetchOraoNetwork(connection),
      connection.getMinimumBalanceForRentExemption(entrySpace(1)),
      connection.getMinimumBalanceForRentExemption(entrySpace(2)),
      connection.getMinimumBalanceForRentExemption(PLAYER_SPACE),
      connection.getMinimumBalanceForRentExemption(PROFILE_SPACE),
    ]).then(([o, e1, e2, p, f]) => {
      if (!alive) return;
      const base = e1.status === "fulfilled" ? BigInt(e1.value) : null;
      const two = e2.status === "fulfilled" ? BigInt(e2.value) : null;
      setCosts({
        oraoFee: o.status === "fulfilled" ? o.value.fee : null,
        entryRentBase: base,
        entryRentPerTicket: base !== null && two !== null ? two - base : null,
        playerRent: p.status === "fulfilled" ? BigInt(p.value) : null,
        profileRent: f.status === "fulfilled" ? BigInt(f.value) : null,
      });
    });
    return () => {
      alive = false;
    };
  }, [connection]);

  const refresh = useCallback(() => {
    refreshDraws();
    pollNow();
    setNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshDraws]);

  // After a failed poll the page keeps the draw it last read, marked stale with that time, instead of
  // blanking; the load itself failing (nothing read yet) is still the error state. One failed poll is
  // enough: a poll only fails after web3.js's own 429 retries.
  const staleSince = load.kind === "ready" && failures >= 1 && lastOk !== null ? lastOk : null;
  const retryIn = staleSince !== null && nextAt !== null ? Math.max(0, Math.ceil(nextAt / 1000 - now)) : null;
  const all = useAllEntries(program, legacy, draws, legacyDraws, nonce);
  const fetchDrawEntries = useCallback(
    (draw: DrawView) => (draw.legacy ? fetchLegacyEntries(legacy, draw.address) : fetchEntries(program, draw.address)),
    [program, legacy]
  );

  const findSettleTx = useCallback(
    async (draw: { address: PublicKey; settledAt: number }) => {
      // The settle tx touches the draw account and lands in the block whose time the program stored.
      // Page back through the draw account's history (newest first) until it is older than settledAt.
      let before: string | undefined;
      for (let page = 0; page < 20; page++) {
        const sigs = await connection.getSignaturesForAddress(draw.address, { limit: 100, before }, "confirmed");
        const near = sigs.filter((s) => !s.err && s.blockTime !== null && Math.abs((s.blockTime ?? 0) - draw.settledAt) <= 2);
        for (const s of near) {
          const tx = await connection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
          if (tx?.meta?.logMessages?.some((l) => l.includes("Instruction: SettleDraw"))) return s.signature;
        }
        const last = sigs[sigs.length - 1];
        if (sigs.length < 100 || !last || (last.blockTime !== null && last.blockTime !== undefined && last.blockTime < draw.settledAt - 2)) return null;
        before = last.signature;
      }
      return null;
    },
    [connection]
  );
  const readOrao = useCallback(
    async (address: PublicKey) => (await fetchRandomness(connection, address))?.randomness ?? null,
    [connection]
  );

  const data: DrawSolData = {
    load,
    config,
    draws: current && !current.legacy ? draws.map((d) => (d.address.equals(current.address) ? current : d)) : draws,
    legacyDraws: current && current.legacy ? legacyDraws.map((d) => (d.address.equals(current.address) ? current : d)) : legacyDraws,
    current,
    select,
    solUsd,
    vaultLamports: vault,
    poolRemaining,
    entries,
    entriesState,
    wallet: pk ? { address: pk, balance } : null,
    player,
    profile,
    profileState,
    myEntries,
    myState,
    drawRandomness,
    costs,
    now,
    refresh,
    staleSince,
    retryIn,
    allEntries: all.entries,
    allEntriesState: all.state,
    fetchDrawEntries,
    findSettleTx,
    readOrao,
  };

  // ---------------- actions ----------------
  const [phase, setPhase] = useState<Actions["phase"]>({});
  const [errors, setErrors] = useState<Actions["errors"]>({});
  const [lastSig, setLastSig] = useState<Actions["lastSig"]>({});
  const [session, setSession] = useState<RevealSession | null>(null);
  const sessionRef = useRef<RevealSession | null>(null);
  sessionRef.current = session;

  const patchSession = (entry: PublicKey, p: Partial<RevealSession>) =>
    setSession((s) => (s && s.entry.equals(entry) ? { ...s, ...p } : s));

  const currentRef = useRef(current);
  currentRef.current = current;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  /** Shared runner: guards wallet, tracks phase, decodes errors. `computeUnits` is the transaction's limit. */
  const run = useCallback(
    async (
      key: ActionKey,
      build: (wallet: PublicKey) => Promise<{ ixs: Parameters<typeof sendIxs>[3]; computeUnits?: number }>,
      onPhase?: (p: TxPhase) => void
    ) => {
      const wallet = walletCtx.publicKey;
      if (!wallet) {
        setVisible(true);
        return { sig: null, error: { message: "Connect a wallet first." } as HumanError };
      }
      setErrors((e) => ({ ...e, [key]: null }));
      try {
        setPhase((p) => ({ ...p, [key]: "simulating" }));
        const { ixs, computeUnits } = await build(wallet);
        const sig = await sendIxs(
          connection,
          walletCtx,
          wallet,
          ixs,
          (ph) => {
            setPhase((p) => ({ ...p, [key]: ph }));
            onPhase?.(ph);
          },
          computeUnits ?? DEFAULT_CU
        );
        setLastSig((s) => ({ ...s, [key]: sig }));
        setPhase((p) => ({ ...p, [key]: "idle" }));
        refresh();
        return { sig, error: null as HumanError | null };
      } catch (e) {
        const human: HumanError = e instanceof TxError ? e.human : { message: (e as Error).message };
        setErrors((x) => ({ ...x, [key]: human }));
        setPhase((p) => ({ ...p, [key]: "failed" }));
        if (human.code === "WrongStatus") refresh();
        return { sig: null, error: human };
      }
    },
    [connection, walletCtx, setVisible, refresh]
  );

  /** VRF wait → reveal tx (with its compute budget) → read the tickets and prizes back from the Entry account. */
  const revealFlow = useCallback(
    async (entry: EntryView) => {
      const drawKey = entry.draw;
      patchSession(entry.address, { stage: "vrf", vrfRequest: entry.vrfRequest, vrfStartedAt: Date.now(), error: undefined });
      try {
        const t0 = Date.now();
        const randomness = await waitForRandomness(connection, entry.vrfRequest);
        patchSession(entry.address, { vrfMs: Date.now() - t0, randomness });
      } catch {
        patchSession(entry.address, {
          stage: "failed",
          error: { message: "ORAO hasn't delivered randomness yet. Your tickets are safe; reveal them later from Your tickets." },
        });
        return;
      }
      const fresh = await fetchEntry(program, entry.address).catch(() => null);
      if (fresh?.revealed) {
        patchSession(entry.address, { stage: "revealed", tickets: fresh.tickets, prizes: fresh.prizes, instantPaid: fresh.instantPaid });
        refresh();
        return;
      }
      patchSession(entry.address, { stage: "revealing" });
      const key: ActionKey = `reveal:${entry.address.toBase58()}`;
      const { sig, error } = await run(key, async () => {
        const { ix, computeUnits } = await ixRevealEntry(program, drawKey, entry);
        return { ixs: [ix], computeUnits };
      });
      if (!sig) {
        patchSession(entry.address, { stage: "failed", error: error ?? { message: "Reveal failed." } });
        return;
      }
      const after = await fetchEntry(program, entry.address).catch(() => null);
      if (after?.revealed) {
        patchSession(entry.address, { stage: "revealed", tickets: after.tickets, prizes: after.prizes, instantPaid: after.instantPaid, revealTx: sig });
      } else {
        patchSession(entry.address, { stage: "failed", revealTx: sig, error: { message: "Reveal confirmed but the entry hasn't updated yet. Refresh in a moment." } });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, program, run, refresh]
  );

  /**
   * One flow for a purchase and a free entry: send it, then open the reveal session for the new entry, wait
   * for ORAO and reveal (every v4 entry rolls: the roll assigns its ticket numbers).
   */
  const enter = useCallback(
    async (key: "buy" | "free", quantity: number) => {
      const draw = currentRef.current;
      if (!draw || draw.legacy) return;
      let entryKey: PublicKey | null = null;
      const { sig } = await run(
        key,
        async (wallet) => {
          const nonceBytes = randomNonce();
          const vrfRequest = oraoRandomnessPda(entrySeed(draw.address, wallet, draw.entryCount, nonceBytes));
          const built =
            key === "buy"
              ? await ixBuyTickets(program, { draw, buyer: wallet, quantity, nonce: nonceBytes, vrfRequest })
              : await ixClaimFree(program, { draw, wallet, nonce: nonceBytes, vrfRequest });
          entryKey = built.entry;
          return { ixs: [built.ix] };
        },
        (ph) => {
          if (ph === "confirming" && entryKey) {
            setSession({
              entry: entryKey,
              firstPos: draw.nextPos,
              count: quantity,
              stage: "confirming",
              free: key === "free",
            });
          }
        }
      );
      if (!sig || !entryKey) {
        setSession((s) => (s && entryKey && s.entry.equals(entryKey) && s.stage === "confirming" ? null : s));
        return;
      }
      const entry = await fetchEntry(program, entryKey).catch(() => null);
      if (!entry) {
        patchSession(entryKey, { stage: "failed", buyTx: sig, error: { message: "Confirmed, but the entry couldn’t be read yet. It will appear in Your tickets." } });
        return;
      }
      patchSession(entryKey, { buyTx: sig, firstPos: entry.firstPos, count: entry.count });
      await revealFlow(entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [program, run, revealFlow]
  );

  const buy = useCallback((quantity: number) => void enter("buy", quantity), [enter]);
  const claimFree = useCallback(() => void enter("free", 1), [enter]);

  const reveal = useCallback(
    (entry: EntryView) => {
      setSession({
        entry: entry.address,
        firstPos: entry.firstPos,
        count: entry.count,
        stage: "vrf",
        vrfRequest: entry.vrfRequest,
        free: entry.isFree,
      });
      revealFlow(entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revealFlow]
  );

  const setLimit = useCallback(
    (lamports: bigint) => void run("limit", async (wallet) => ({ ixs: [await ixSetLimit(program, wallet, lamports)] })),
    [program, run]
  );
  const selfExclude = useCallback(
    (until: number) => void run("exclude", async (wallet) => ({ ixs: [await ixSelfExclude(program, wallet, until)] })),
    [program, run]
  );

  /**
   * Devnet only: ask the public faucet for SOL straight from this browser (the visitor's own IP and rate
   * limit, no server of ours), wait for it to confirm, then re-read the balance. Nothing is signed.
   */
  const airdrop = useCallback(async () => {
    const wallet = walletCtx.publicKey;
    if (!wallet) {
      setVisible(true);
      return;
    }
    setErrors((e) => ({ ...e, airdrop: null }));
    setPhase((p) => ({ ...p, airdrop: "simulating" }));
    try {
      const sig = await connection.requestAirdrop(wallet, AIRDROP_LAMPORTS);
      setPhase((p) => ({ ...p, airdrop: "confirming" }));
      const bh = await connection.getLatestBlockhash("confirmed");
      const res = await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      if (res.value.err) throw new Error("The faucet's transfer failed on devnet");
      setLastSig((s) => ({ ...s, airdrop: sig }));
      setPhase((p) => ({ ...p, airdrop: "done" }));
      refresh();
    } catch (e) {
      setErrors((x) => ({ ...x, airdrop: airdropHuman(e) }));
      setPhase((p) => ({ ...p, airdrop: "failed" }));
    }
  }, [connection, walletCtx.publicKey, setVisible, refresh]);

  const runDraw = useCallback(() => {
    const draw = currentRef.current;
    if (!draw || draw.legacy) return;
    run("run", async (wallet) => {
      const n = randomNonce();
      // a request that cancels (nothing sold) makes no ORAO request
      const vrfRequest = cancelsAtRequest(draw) ? null : oraoRandomnessPda(drawSeed(draw.address, draw.nextPos, n));
      return { ixs: [await ixRequestDraw(program, { draw, caller: wallet, nonce: n, vrfRequest })] };
    });
  }, [program, run]);

  /**
   * settle_draw: the winning position from ORAO's randomness, the entry that holds it, and the settle. The
   * program requires that entry to be revealed first (SPEC-v4 §6); when it isn't and its own randomness has
   * landed, the reveal goes in the same transaction, ahead of the settle.
   */
  const settle = useCallback(() => {
    const draw = currentRef.current;
    if (!draw || draw.legacy) return;
    run("settle", async () => {
      const rand = await waitForRandomness(connection, draw.drawVrfRequest, 5_000);
      const pos = winningPosition(rand, draw.nextPos);
      let hit = entryAtPosition(entriesRef.current, pos);
      if (!hit) hit = entryAtPosition(await fetchEntries(program, draw.address), pos);
      if (!hit) throw new TxError({ message: `No entry holds position ${pos}. Refresh and try again.` });
      if (hit.revealed) return { ixs: [await ixSettle(program, draw, hit)] };
      try {
        await waitForRandomness(connection, hit.vrfRequest, 5_000);
      } catch {
        throw new TxError({ message: `The entry holding the winning position (entry ${hit.seq}) hasn’t been revealed and ORAO hasn’t answered its request yet. Try again in a moment.` });
      }
      const { ix } = await ixRevealEntry(program, draw.address, hit);
      return { ixs: [ix, await ixSettle(program, draw, hit)], computeUnits: Math.min(1_400_000, revealCuLimit(hit.count) + 100_000) };
    });
  }, [connection, program, run]);

  const cancel = useCallback(() => {
    const draw = currentRef.current;
    if (!draw || draw.legacy) return;
    run("cancel", async (wallet) => ({ ixs: [await ixCancel(program, draw, wallet)] }));
  }, [program, run]);

  const refund = useCallback(
    (entry: EntryView) => {
      run(`refund:${entry.address.toBase58()}`, async () => ({ ixs: [await ixRefund(program, entry.draw, entry)] }));
    },
    [program, run]
  );

  const actions: Actions = {
    phase,
    errors,
    lastSig,
    buy,
    claimFree,
    setLimit,
    selfExclude,
    airdrop,
    runDraw,
    settle,
    cancel,
    refund,
    reveal,
    session,
    closeSession: () => setSession(null),
    clearError: (k) => setErrors((e) => ({ ...e, [k]: null })),
    disabledReason: null,
  };

  return (
    <DataContext.Provider value={data}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </DataContext.Provider>
  );
}
