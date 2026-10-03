"use client";

/**
 * FIXTURE MODE — only compiled into builds made with NEXT_PUBLIC_FIXTURES=1.
 * Pick a scenario with ?fx=<name> (see data.ts). Transactions are never sent.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PublicKey } from "@solana/web3.js";
import { ActionsContext, DataContext, type ActionKey, type Actions, type Done, type DrawSolData, type RevealSession } from "@/hooks/context";
import { useNow } from "@/hooks/useNow";
import { featuredDraw } from "@/lib/derive";
import { FIXED_NOW, playerOf, revealSessionFor, scenario, SCENARIOS, SOL_USD, type Scenario } from "./data";

const NOTE = { message: "Fixture build — nothing is sent to devnet." };

/** The fixture clock starts at a fixed instant so every shot shows the same times, then ticks for real. */
export function FixtureProvider({ children }: { children: ReactNode }) {
  const realNow = useNow();
  const [offset] = useState(() => FIXED_NOW - Math.floor(Date.now() / 1000));
  const now = realNow + offset;
  const [name, setName] = useState<Scenario>("loading");
  const [raw, setRaw] = useState("open");
  const [my, setMy] = useState<DrawSolData["myState"]>("ready");
  const [noUsd, setNoUsd] = useState(false);
  useEffect(() => {
    // pick the scenario after mount so the prerendered HTML (the loading card) hydrates cleanly
    const q = new URLSearchParams(window.location.search);
    const p = q.get("fx") ?? "open";
    setRaw(p);
    setName((SCENARIOS as string[]).includes(p) ? (p as Scenario) : "open");
    const m = q.get("my");
    if (m === "loading" || m === "error") setMy(m);
    // &usd=0: no live quote (the page shows SOL only)
    if (q.get("usd") === "0") setNoUsd(true);
  }, []);
  const fx = useMemo(() => scenario(name, FIXED_NOW), [name]);
  const [selectedId, select] = useState<number | null>(null);
  useEffect(() => select(fx.selected), [fx]);
  const [session, setSession] = useState<RevealSession | null>(fx.session);
  useEffect(() => setSession(fx.session), [fx]);
  const [done, setDone] = useState<Done | null>(fx.done);
  useEffect(() => setDone(fx.done), [fx]);
  const [errors, setErrors] = useState<Actions["errors"]>({});
  useEffect(() => setErrors(fx.errors ?? {}), [fx]);

  const current = (selectedId !== null ? fx.draws.find((d) => d.id === selectedId) : undefined) ?? featuredDraw(fx.draws);
  const world = current ? fx.worlds.get(current.address.toBase58()) : undefined;
  const wallet = fx.wallet;
  const mine = world && wallet ? world.entries.filter((e) => e.owner.equals(wallet.address)) : [];
  const player = world && wallet ? playerOf(world, wallet.address) : null;
  const vault = current
    ? current.kind === "pot"
      ? current.status === "settled"
        ? current.houseLamports - current.houseWithdrawn
        : current.houseLamports + current.potLamports + current.instantPoolLamports - current.refundedLamports
      : current.revenueLamports - current.refundedLamports + (current.prizePaid ? BigInt(0) : current.prizeLamports) - world!.entries.reduce((s, e) => s + e.solPaid, BigInt(0))
    : null;

  const data: DrawSolData = {
    load: fx.load === "ready" ? { kind: "ready" } : fx.load === "loading" ? { kind: "loading" } : fx.load === "error" ? { kind: "error", message: "fixture" } : { kind: "nodraw", reason: "no-draws" },
    config: fx.load === "ready" ? { admin: fx.draws[0]?.authority ?? PublicKey.default, keeper: PublicKey.default, nextDrawId: fx.nextDrawId } : null,
    draws: fx.draws,
    legacyDraws: fx.legacyDraws,
    current: current ?? null,
    select,
    solUsd: noUsd ? null : SOL_USD,
    vaultLamports: vault,
    entries: world?.entries ?? [],
    entriesState: "ready",
    wallet,
    player: my === "ready" ? player : null,
    profile: my === "ready" && wallet ? fx.profile : null,
    profileState: my,
    myEntries: my === "ready" ? mine : [],
    myState: my,
    drawRandomness: current ? fx.drawRandomness.get(current.address.toBase58()) ?? null : null,
    costs: { oraoFee: BigInt(500_000), entryRent: BigInt(2_394_480), playerRent: BigInt(1_573_440), profileRent: BigInt(1_538_640) },
    now,
    refresh: () => {},
    staleSince: fx.staleSince ?? null,
    retryIn: fx.staleSince ? 60 - ((now - FIXED_NOW) % 60) : null,
    allEntries: fx.allEntries,
    allEntriesState: "ready",
    fetchDrawEntries: async (d) => fx.entriesByDraw.get(d.address.toBase58()) ?? [],
    findSettleTx: async (d) => fx.settleTx.get(d.address.toBase58()) ?? null,
    stillRoll: fx.liveRollAt,
    readOrao: async (addr: PublicKey) => {
      for (const r of Array.from(fx.drawRandomness.values())) if (r.address.equals(addr)) return r.randomness;
      return [...fx.draws, ...fx.legacyDraws].find((d) => d.drawVrfRequest.equals(addr))?.randomness ?? null;
    },
  };

  const fail = (k: ActionKey) => () => setErrors((e) => ({ ...e, [k]: NOTE }));
  const actions: Actions = {
    phase: fx.phase ?? {},
    errors,
    lastSig: fx.lastSig ?? {},
    buy: () => fail("buy")(),
    claimFree: fail("free"),
    setLimit: () => fail("limit")(),
    selfExclude: () => fail("exclude")(),
    airdrop: fail("airdrop"),
    runDraw: fail("run"),
    settle: fail("settle"),
    cancel: fail("cancel"),
    refund: (e) => fail(`refund:${e.address.toBase58()}`)(),
    // open a session for THAT entry as the fixture world holds it
    reveal: (e) => {
      const rand = fx.entryRandomness.get(e.address.toBase58());
      if (!current || !rand || !e.needsReveal) return fail(`reveal:${e.address.toBase58()}`)();
      setSession(revealSessionFor(e, current, rand, String(e.seq)));
    },
    session,
    closeSession: () => setSession(null),
    done,
    clearDone: () => setDone(null),
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

/** Sits inside the devnet bar's right end, never over page content. */
function FxBadge({ name }: { name: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--fxb-w", `${el.offsetWidth + 8}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      role="note"
      className="fxb"
      style={{ position: "fixed", top: 0, right: 0, zIndex: 101, height: "var(--devbar-h)", display: "flex", alignItems: "center", padding: "0 12px", background: "#0B1220", color: "#fff", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}
    >
      <span className="fxb-long">Fixture · ?fx={name}</span>
      <span className="fxb-short">Fx</span>
      <style>{`.devbar-in{padding-right:var(--fxb-w,0px)}.fxb-short{display:none}@media (max-width:760px){.fxb-long{display:none}.fxb-short{display:inline}}`}</style>
    </div>
  );
}
