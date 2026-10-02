"use client";

/**
 * FIXTURE MODE — only compiled into builds made with NEXT_PUBLIC_FIXTURES=1.
 * Pick a scenario with ?fx=<name> (see data.ts). Transactions are never sent.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PublicKey } from "@solana/web3.js";
import { ActionsContext, DataContext, type ActionKey, type Actions, type DrawSolData, type RevealSession } from "@/hooks/context";
import { useNow } from "@/hooks/useNow";
import { revealSessionFor, scenario, SCENARIOS, type Scenario } from "./data";

const NOTE = { message: "Fixture build — nothing is sent to devnet." };

/**
 * The fixture clock starts at a fixed instant (Thu 1 Oct 2026, 22:41:48 UTC) so every shot shows the same
 * close time (Sun 4 Oct, 04:13 UTC) and countdown (2 d 5 h 31 min), then ticks for real from page load.
 */
const FIXED_NOW = Math.floor(Date.UTC(2026, 9, 1, 22, 41, 48) / 1000);

export function FixtureProvider({ children }: { children: ReactNode }) {
  const realNow = useNow();
  const [offset] = useState(() => FIXED_NOW - Math.floor(Date.now() / 1000));
  const now = realNow + offset;
  const [name, setName] = useState<Scenario>("loading");
  const [raw, setRaw] = useState("open");
  // &my=loading|error: this wallet's accounts not read yet / failed, as the live provider reports them
  const [my, setMy] = useState<DrawSolData["myState"]>("ready");
  useEffect(() => {
    // pick the scenario after mount so the prerendered HTML (a loading ticket) hydrates cleanly
    const q = new URLSearchParams(window.location.search);
    const p = q.get("fx") ?? "open";
    setRaw(p);
    setName((SCENARIOS as string[]).includes(p) ? (p as Scenario) : "open");
    const m = q.get("my");
    if (m === "loading" || m === "error") setMy(m);
  }, []);
  const fx = useMemo(() => scenario(name, FIXED_NOW), [name]);
  const [session, setSession] = useState<RevealSession | null>(fx.session);
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
    player: my === "ready" ? fx.player : null,
    myEntries: my === "ready" ? fx.mine : [],
    myState: my,
    drawRandomness: fx.drawRandomness,
    costs: { oraoFee: BigInt(500_000), entryRent: BigInt(2_276_160), playerRent: BigInt(1_545_600) },
    now,
    refresh: () => {},
    findSettleTx: async (d) => fx.settleTx.get(d.address.toBase58()) ?? null,
    readOrao: async (addr: PublicKey) =>
      fx.current && addr.equals(fx.current.drawVrfRequest)
        ? fx.current.randomness
        : fx.draws.find((d) => d.drawVrfRequest.equals(addr))?.randomness ?? null,
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
    // open a session for THAT entry; tiers recomputed with fairness.ts from its (fixture) randomness
    reveal: (e) => {
      const rand = fx.entryRandomness.get(e.address.toBase58());
      if (!fx.current || !rand || e.isFree) return fail(`reveal:${e.address.toBase58()}`)();
      setSession(revealSessionFor(e, fx.current, rand, String(e.seq)));
    },
    session,
    closeSession: () => setSession(null),
    clearError: (k) => setErrors((e) => ({ ...e, [k]: null })),
    disabledReason: null,
  };

  return (
    <DataContext.Provider value={data}>
      <ActionsContext.Provider value={actions}>
        {children}
        <FxBadge name={raw} />
      </ActionsContext.Provider>
    </DataContext.Provider>
  );
}

const CODES: Record<string, string> = {
  open: "op",
  confirm: "cf",
  due: "du",
  drawing: "dr",
  settled: "st",
  cancelled: "cx",
  nodraw: "nd",
  reveal: "rv",
  loading: "ld",
  error: "er",
  empty: "em",
};

/** Sits inside the devnet strip's right end (z 101), never over page content. */
function FxBadge({ name }: { name: string }) {
  // at 360px and below a 2–3 letter code ("Fx rd"), so the honesty marker beside it is never covered;
  // single words get a fixed code (slicing "open" to "ope" read as a typo), hyphenated ones their initials
  const code = CODES[name] ?? (name.includes("-") ? name.split("-").map((p) => p[0]).join("") : name.slice(0, 2));
  return (
    <div
      role="note"
      className="fxb"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        zIndex: 101,
        height: "var(--strip-h)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        background: "var(--ink)",
        color: "var(--stock)",
        fontFamily: "var(--grot)",
        fontStretch: "88%",
        fontWeight: 700,
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      <span className="fxb-long">Fixture data · ?fx={name}</span>
      <span className="fxb-short">Fixture · {name}</span>
      <span className="fxb-tiny" aria-label={`Fixture ${name}`}>
        Fx {code}
      </span>
      <style>{`.fxb-short,.fxb-tiny{display:none}@media (max-width:760px){.fxb-long{display:none}.fxb-short{display:inline}}@media (max-width:360px){.fxb-short{display:none}.fxb-tiny{display:inline}.fxb{padding:0 8px!important}}`}</style>
    </div>
  );
}
