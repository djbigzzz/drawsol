"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { PublicKey } from "@solana/web3.js";
import { ENTRY_SPACE, PLAYER_SPACE } from "@/lib/config";
import {
  fetchEntries,
  fetchEntry,
  ixBuyTickets,
  ixCancel,
  ixClaimFree,
  ixRefund,
  ixRequestDraw,
  ixRevealEntry,
  ixSettle,
} from "@/lib/chain";
import { drawSeed, entrySeed, oraoRandomnessPda, winningTicket } from "@/lib/fairness";
import { fetchOraoNetwork, fetchRandomness } from "@/lib/orao";
import { randomNonce, sendIxs, TxError, type TxPhase } from "@/lib/tx";
import type { HumanError } from "@/lib/errors";
import type { EntryView } from "@/lib/types";
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
import { pickCurrent, useDraws } from "./useDraws";
import { useDraw } from "./useDraw";
import { useEntries, useMyEntries } from "./useEntries";
import { useBalance } from "./useBalance";
import { useNow } from "./useNow";
import { useRandomness, waitForRandomness } from "./useRandomness";

export function LiveProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const walletCtx = useWallet();
  const { setVisible } = useWalletModal();
  const program = useProgram();
  const now = useNow();
  const [nonce, setNonce] = useState(0);

  const { load, config, draws, refresh: refreshDraws } = useDraws(program);
  const listed = useMemo(() => pickCurrent(draws), [draws]);
  const { draw: current, vault, failures } = useDraw(program, listed);
  const { entries, state: entriesState } = useEntries(program, current, nonce);
  const pk = walletCtx.publicKey;
  const { myEntries, player, state: myState } = useMyEntries(program, current, pk, nonce);
  const balance = useBalance(connection, pk, nonce);
  const drawRandomness = useRandomness(
    connection,
    current?.status === "drawing" ? current.drawVrfRequest : null,
    current?.status === "drawing"
  );

  const [costs, setCosts] = useState<Costs>({ oraoFee: null, entryRent: null, playerRent: null });
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      fetchOraoNetwork(connection),
      connection.getMinimumBalanceForRentExemption(ENTRY_SPACE),
      connection.getMinimumBalanceForRentExemption(PLAYER_SPACE),
    ]).then(([o, e, p]) => {
      if (!alive) return;
      setCosts({
        oraoFee: o.status === "fulfilled" ? o.value.fee : null,
        entryRent: e.status === "fulfilled" ? BigInt(e.value) : null,
        playerRent: p.status === "fulfilled" ? BigInt(p.value) : null,
      });
    });
    return () => {
      alive = false;
    };
  }, [connection]);

  const refresh = useCallback(() => {
    refreshDraws();
    setNonce((n) => n + 1);
  }, [refreshDraws]);

  const effectiveLoad = failures >= 2 ? { kind: "error" as const, message: "Lost connection to devnet" } : load;

  const findSettleTx = useCallback(
    async (draw: { address: PublicKey; settledAt: number }) => {
      // The settle tx touches the draw account and lands in the block whose time the program stored.
      const sigs = await connection.getSignaturesForAddress(draw.address, { limit: 100 }, "confirmed");
      const near = sigs.filter((s) => !s.err && s.blockTime !== null && Math.abs((s.blockTime ?? 0) - draw.settledAt) <= 2);
      for (const s of near) {
        const tx = await connection.getTransaction(s.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
        if (tx?.meta?.logMessages?.some((l) => l.includes("Instruction: SettleDraw"))) return s.signature;
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
    load: effectiveLoad,
    config,
    draws: current ? draws.map((d) => (d.address.equals(current.address) ? current : d)) : draws,
    current,
    vaultLamports: vault,
    entries,
    entriesState,
    wallet: pk ? { address: pk, balance } : null,
    player,
    myEntries,
    myState,
    drawRandomness,
    costs,
    now,
    refresh,
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
        patchSession(entry.address, { stage: "revealed", tiers: fresh.tiers, instantPaid: fresh.instantPaid });
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
        patchSession(entry.address, { stage: "revealed", tiers: after.tiers, instantPaid: after.instantPaid, revealTx: sig });
      } else {
        patchSession(entry.address, { stage: "failed", revealTx: sig, error: { message: "Reveal confirmed but the entry hasn't updated yet. Refresh in a moment." } });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, program, run, refresh]
  );

  const tierAmounts = () => currentRef.current?.iwTiers.map((t) => t.amount) ?? [];

  const buy = useCallback(
    async (quantity: number) => {
      const draw = currentRef.current;
      if (!draw) return;
      let entryKey: PublicKey | null = null;
      const { sig } = await run(
        "buy",
        async (wallet) => {
          const nonceBytes = randomNonce();
          const seed = entrySeed(draw.address, wallet, draw.entryCount, nonceBytes);
          const vrfRequest = oraoRandomnessPda(seed);
          const { ix, entry } = await ixBuyTickets(program, { draw, buyer: wallet, quantity, nonce: nonceBytes, vrfRequest });
          entryKey = entry;
          return [ix];
        },
        (ph) => {
          if (ph === "confirming" && entryKey) {
            setSession({
              entry: entryKey,
              firstTicket: draw.nextTicket,
              count: quantity,
              stage: "confirming",
              tierAmounts: tierAmounts(),
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
        patchSession(entryKey, { stage: "failed", buyTx: sig, error: { message: "Purchase confirmed, but the entry couldn't be read yet. It will appear in Your tickets." } });
        return;
      }
      patchSession(entryKey, { buyTx: sig, firstTicket: entry.firstTicket, count: entry.count });
      await revealFlow(entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [program, run, revealFlow]
  );

  const reveal = useCallback(
    (entry: EntryView) => {
      setSession({
        entry: entry.address,
        firstTicket: entry.firstTicket,
        count: entry.count,
        stage: "vrf",
        vrfRequest: entry.vrfRequest,
        tierAmounts: tierAmounts(),
      });
      revealFlow(entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revealFlow]
  );

  const claimFree = useCallback(() => {
    const draw = currentRef.current;
    if (!draw) return;
    run("free", async (wallet) => [await ixClaimFree(program, draw, wallet)]);
  }, [program, run]);

  const runDraw = useCallback(() => {
    const draw = currentRef.current;
    if (!draw) return;
    run("run", async (wallet) => {
      const n = randomNonce();
      const vrfRequest = oraoRandomnessPda(drawSeed(draw.address, draw.nextTicket, n));
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
