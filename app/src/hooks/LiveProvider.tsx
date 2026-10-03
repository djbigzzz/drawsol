"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { PublicKey } from "@solana/web3.js";
import { AIRDROP_LAMPORTS, ENTRY_SPACE, PLAYER_SPACE, PROFILE_SPACE } from "@/lib/config";
import {
  drawRolls,
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
import { cancelsAtRequest, featuredDraw } from "@/lib/derive";
import { drawSeed, entrySeed, oraoRandomnessPda, winningTicket } from "@/lib/fairness";
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
  type Done,
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
    () => (selectedId !== null ? draws.find((d) => d.id === selectedId) : undefined) ?? featuredDraw(draws),
    [draws, selectedId]
  );
  const solUsd = useSolPrice();
  const { draw: current, vault, failures, lastOk, nextAt, pollNow } = useDraw(program, listed);
  const { entries, state: entriesState } = useEntries(program, current, nonce);
  const pk = walletCtx.publicKey;
  const { myEntries, player, state: myState } = useMyEntries(program, current, pk, nonce);
  const { profile, state: profileState } = useProfile(program, current, pk, nonce);
  const balance = useBalance(connection, pk, nonce);
  const drawRandomness = useRandomness(
    connection,
    current?.status === "drawing" ? current.drawVrfRequest : null,
    current?.status === "drawing"
  );

  const [costs, setCosts] = useState<Costs>({ oraoFee: null, entryRent: null, playerRent: null, profileRent: null });
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      fetchOraoNetwork(connection),
      connection.getMinimumBalanceForRentExemption(ENTRY_SPACE),
      connection.getMinimumBalanceForRentExemption(PLAYER_SPACE),
      connection.getMinimumBalanceForRentExemption(PROFILE_SPACE),
    ]).then(([o, e, p, f]) => {
      if (!alive) return;
      setCosts({
        oraoFee: o.status === "fulfilled" ? o.value.fee : null,
        entryRent: e.status === "fulfilled" ? BigInt(e.value) : null,
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

  // After two failed polls the page keeps the draw it last read, marked stale with that time, instead of
  // blanking; the load itself failing (nothing read yet) is still the error state.
  // one failed poll is enough to mark the figures: a poll only fails after web3.js's own 429 retries
  const staleSince = load.kind === "ready" && failures >= 1 && lastOk !== null ? lastOk : null;
  const retryIn = staleSince !== null && nextAt !== null ? Math.max(0, Math.ceil(nextAt / 1000 - now)) : null;
  const all = useAllEntries(program, draws, nonce);
  const fetchDrawEntries = useCallback(
    (draw: DrawView) => (draw.kind === "v2" ? fetchLegacyEntries(legacy, draw.address) : fetchEntries(program, draw.address)),
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
    draws: current ? draws.map((d) => (d.address.equals(current.address) ? current : d)) : draws,
    legacyDraws,
    current,
    select,
    solUsd,
    vaultLamports: vault,
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
  const [done, setDone] = useState<Done | null>(null);

  const patchSession = (entry: PublicKey, p: Partial<RevealSession>) =>
    setSession((s) => (s && s.entry.equals(entry) ? { ...s, ...p } : s));

  const currentRef = useRef(current);
  currentRef.current = current;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  /** Shared runner: guards wallet, tracks phase, decodes errors. */
  const run = useCallback(
    async (key: ActionKey, build: (wallet: PublicKey) => Promise<Parameters<typeof sendIxs>[3]>, onPhase?: (p: TxPhase) => void) => {
      const wallet = walletCtx.publicKey;
      if (!wallet) {
        setVisible(true);
        return { sig: null, error: { message: "Connect a wallet first." } as HumanError };
      }
      setErrors((e) => ({ ...e, [key]: null }));
      try {
        setPhase((p) => ({ ...p, [key]: "simulating" }));
        const ixs = await build(wallet);
        const sig = await sendIxs(connection, walletCtx, wallet, ixs, (ph) => {
          setPhase((p) => ({ ...p, [key]: ph }));
          onPhase?.(ph);
        });
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

  /** VRF wait → auto reveal tx → read tiers back from the Entry account. */
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
        patchSession(entry.address, { stage: "revealed", tiers: fresh.tiers, solPaid: fresh.solPaid, creditsWon: fresh.creditsWon, poolSnapshot: fresh.poolSnapshot });
        refresh();
        return;
      }
      patchSession(entry.address, { stage: "revealing" });
      const key: ActionKey = `reveal:${entry.address.toBase58()}`;
      const { sig, error } = await run(key, async () => [await ixRevealEntry(program, drawKey, entry)]);
      if (!sig) {
        patchSession(entry.address, { stage: "failed", error: error ?? { message: "Reveal failed." } });
        return;
      }
      const after = await fetchEntry(program, entry.address).catch(() => null);
      if (after?.revealed) {
        patchSession(entry.address, {
          stage: "revealed",
          tiers: after.tiers,
          solPaid: after.solPaid,
          creditsWon: after.creditsWon,
          poolSnapshot: after.poolSnapshot,
          revealTx: sig,
        });
      } else {
        patchSession(entry.address, { stage: "failed", revealTx: sig, error: { message: "Reveal confirmed but the entry hasn't updated yet. Refresh in a moment." } });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, program, run, refresh]
  );

  const tierSpecs = () => currentRef.current?.iwTiers ?? [];

  /**
   * One flow for a purchase and a free entry: send it, then (pot draws with instant tiers) open the reveal
   * session for the new entry, wait for ORAO and reveal. A draw without an instant roll just refreshes.
   */
  const enter = useCallback(
    async (key: "buy" | "free", quantity: number, useCredits: number) => {
      const draw = currentRef.current;
      if (!draw) return;
      const rolls = drawRolls(draw);
      let entryKey: PublicKey | null = null;
      const { sig } = await run(
        key,
        async (wallet) => {
          const nonceBytes = randomNonce();
          const vrfRequest = rolls ? oraoRandomnessPda(entrySeed(draw.address, wallet, draw.entryCount, nonceBytes)) : null;
          const built =
            key === "buy"
              ? await ixBuyTickets(program, { draw, buyer: wallet, quantity, useCredits, nonce: nonceBytes, vrfRequest })
              : await ixClaimFree(program, { draw, wallet, nonce: nonceBytes, vrfRequest });
          entryKey = built.entry;
          return [built.ix];
        },
        (ph) => {
          if (ph === "confirming" && entryKey && rolls) {
            setSession({
              entry: entryKey,
              firstTicket: draw.nextTicket,
              count: quantity,
              stage: "confirming",
              free: key === "free",
              tierSpecs: tierSpecs(),
            });
          }
        }
      );
      if (!rolls) {
        // no instant roll (headline draws): the success state is the entry as read back from chain
        if (!sig || !entryKey) return;
        const landed = await fetchEntry(program, entryKey).catch(() => null);
        setDone({
          kind: key,
          sig,
          entry: landed,
          firstTicket: landed?.firstTicket ?? draw.nextTicket,
          count: landed?.count ?? quantity,
        });
        return;
      }
      if (!sig || !entryKey) {
        setSession((s) => (s && entryKey && s.entry.equals(entryKey) && s.stage === "confirming" ? null : s));
        return;
      }
      const entry = await fetchEntry(program, entryKey).catch(() => null);
      if (!entry) {
        patchSession(entryKey, { stage: "failed", buyTx: sig, error: { message: "Confirmed, but the entry couldn’t be read yet. It will appear in Your tickets." } });
        return;
      }
      patchSession(entryKey, { buyTx: sig, firstTicket: entry.firstTicket, count: entry.count, poolSnapshot: entry.poolSnapshot });
      await revealFlow(entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [program, run, revealFlow]
  );

  const buy = useCallback((quantity: number, useCredits: number) => void enter("buy", quantity, useCredits), [enter]);
  const claimFree = useCallback(() => void enter("free", 1, 0), [enter]);

  const reveal = useCallback(
    (entry: EntryView) => {
      setSession({
        entry: entry.address,
        firstTicket: entry.firstTicket,
        count: entry.count,
        stage: "vrf",
        vrfRequest: entry.vrfRequest,
        poolSnapshot: entry.poolSnapshot,
        free: entry.isFree,
        tierSpecs: tierSpecs(),
      });
      revealFlow(entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revealFlow]
  );

  const setLimit = useCallback(
    (lamports: bigint) => void run("limit", async (wallet) => [await ixSetLimit(program, wallet, lamports)]),
    [program, run]
  );
  const selfExclude = useCallback(
    (until: number) => void run("exclude", async (wallet) => [await ixSelfExclude(program, wallet, until)]),
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
    if (!draw) return;
    run("run", async (wallet) => {
      const n = randomNonce();
      // a request that cancels (nothing sold, or a headline draw below its minimum) makes no ORAO request
      const vrfRequest = cancelsAtRequest(draw) ? null : oraoRandomnessPda(drawSeed(draw.address, draw.nextTicket, n));
      return [await ixRequestDraw(program, { draw, caller: wallet, nonce: n, vrfRequest })];
    });
  }, [program, run]);

  const settle = useCallback(() => {
    const draw = currentRef.current;
    if (!draw) return;
    run("settle", async () => {
      const rand = await waitForRandomness(connection, draw.drawVrfRequest, 5_000);
      const w = winningTicket(rand, draw.nextTicket);
      let list = entriesRef.current;
      let hit = list.find((e) => e.firstTicket <= w && w < e.firstTicket + e.count);
      if (!hit) {
        list = await fetchEntries(program, draw.address);
        hit = list.find((e) => e.firstTicket <= w && w < e.firstTicket + e.count);
      }
      if (!hit) throw new TxError({ message: `No entry holds ticket ${w}. Refresh and try again.` });
      return [await ixSettle(program, draw, hit)];
    });
  }, [connection, program, run]);

  const cancel = useCallback(() => {
    const draw = currentRef.current;
    if (!draw) return;
    run("cancel", async () => [await ixCancel(program, draw)]);
  }, [program, run]);

  const refund = useCallback(
    (entry: EntryView) => {
      run(`refund:${entry.address.toBase58()}`, async () => [await ixRefund(program, entry.draw, entry)]);
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
    done,
    clearDone: () => setDone(null),
    clearError: (k) => setErrors((e) => ({ ...e, [k]: null })),
    disabledReason: null,
  };

  return (
    <DataContext.Provider value={data}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </DataContext.Provider>
  );
}
