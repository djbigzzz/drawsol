"use client";

/**
 * FIXTURE MODE — only compiled into builds made with NEXT_PUBLIC_FIXTURES=1.
 * Pick a scenario with ?fx=<name> (see data.ts). Transactions are never sent.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PublicKey } from "@solana/web3.js";
import { ActionsContext, DataContext, type ActionKey, type Actions, type DrawSolData } from "@/hooks/context";
import { useNow } from "@/hooks/useNow";
import { scenario, type Scenario } from "./data";

const NOTE = { message: "Fixture build — nothing is sent to devnet." };

export function FixtureProvider({ children }: { children: ReactNode }) {
  const now = useNow();
  const [name, setName] = useState<Scenario>("loading");
  const [anchorNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    // pick the scenario after mount so the prerendered HTML (a loading board) hydrates cleanly
    const p = new URLSearchParams(window.location.search).get("fx") as Scenario | null;
    setName(p ?? "open");
  }, []);
  const fx = useMemo(() => scenario(name, anchorNow), [name, anchorNow]);
  const [session, setSession] = useState(fx.session);
  useEffect(() => setSession(fx.session), [fx]);
  const [errors, setErrors] = useState<Actions["errors"]>({});

  const data: DrawSolData = {
    load:
      fx.load === "ready"
        ? { kind: "ready" }
        : fx.load === "loading"
          ? { kind: "loading" }
          : fx.load === "error"
            ? { kind: "error", message: "fixture" }
            : { kind: "nodraw", reason: "no-program" },
    config: null,
    draws: fx.draws,
    current: fx.current,
    vaultLamports: fx.vault,
    entries: fx.entries,
    entriesState: "ready",
    wallet: fx.wallet,
    player: fx.player,
    myEntries: fx.mine,
    drawRandomness: fx.drawRandomness,
    costs: { oraoFee: BigInt(500_000), entryRent: BigInt(2_276_160), playerRent: BigInt(1_545_600) },
    now,
    refresh: () => {},
    findSettleTx: async (d) => fx.settleTx.get(d.address.toBase58()) ?? null,
    readOrao: async (addr: PublicKey) => (fx.current && addr.equals(fx.current.drawVrfRequest) ? fx.current.randomness : fx.draws.find((d) => d.drawVrfRequest.equals(addr))?.randomness ?? null),
  };

  const fail = (k: ActionKey) => () => setErrors((e) => ({ ...e, [k]: NOTE }));
  const actions: Actions = {
    phase: {},
    errors,
    lastSig: {},
    buy: fail("buy"),
    claimFree: fail("free"),
    runDraw: fail("run"),
    settle: fail("settle"),
    cancel: fail("cancel"),
    refund: (e) => fail(`refund:${e.address.toBase58()}`)(),
    reveal: (e) => fail(`refund:${e.address.toBase58()}`)(),
    session,
    closeSession: () => setSession(null),
    clearError: (k) => setErrors((e) => ({ ...e, [k]: null })),
    disabledReason: null,
  };

  return (
    <DataContext.Provider value={data}>
      <ActionsContext.Provider value={actions}>
        {children}
        <div className="fixture-badge" role="note">
          <span>FIXTURE DATA</span> NOT ON-CHAIN · ?fx={name}
        </div>
      </ActionsContext.Provider>
    </DataContext.Provider>
  );
}
