"use client";

/**
 * FIXTURE MODE — only compiled into builds made with NEXT_PUBLIC_FIXTURES=1.
 * Pick a scenario with ?fx=<name> (see data.ts). Transactions are never sent.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PublicKey } from "@solana/web3.js";
import { ActionsContext, DataContext, type ActionKey, type Actions, type DrawSolData, type RevealSession } from "@/hooks/context";
import { useNow } from "@/hooks/useNow";
import { defaultDraw, liveDraw } from "@/lib/derive";
import { FIXED_NOW, playerOf, revealSessionFor, scenario, SCENARIOS, type Scenario } from "./data";

const NOTE = { message: "Fixture build — nothing is sent to devnet." };

/**
 * The fixture clock starts at a fixed instant (Sat 3 Oct 2026, 16:28:48 UTC: tonight's pot draw is 5 h 31 min
 * away) so every shot shows the same times, then ticks for real from page load.
 */
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
  const [selectedId, select] = useState<number | null>(null);
  useEffect(() => select(fx.selected), [fx]);
  const [session, setSession] = useState<RevealSession | null>(fx.session);
  useEffect(() => setSession(fx.session), [fx]);
  const [errors, setErrors] = useState<Actions["errors"]>({});
  useEffect(() => setErrors(fx.errors ?? {}), [fx]);

  // /live scenarios open on the next draw to be drawn, as the live page does
  const fallback = name.startsWith("live-") ? liveDraw(fx.draws, now) : defaultDraw(fx.draws);
  const current = (selectedId !== null ? fx.draws.find((d) => d.id === selectedId) : undefined) ?? fallback;
  const world = current ? fx.worlds.get(current.address.toBase58()) : undefined;
  const wallet = fx.wallet;
  const mine = world && wallet ? world.entries.filter((e) => e.owner.equals(wallet.address)) : [];
  const player = world && wallet ? playerOf(world, wallet.address) : null;
  const vault = current
    ? current.kind === "pot"
      ? current.status === "settled"
        ? current.houseLamports - current.houseWithdrawn
        : current.houseLamports + current.potLamports + current.instantPoolLamports - current.refundedLamports
      : current.revenueLamports - current.refundedLamports + (current.prizePaid ? BigInt(0) : current.prizeLamports)
    : null;

  const data: DrawSolData = {
    load:
      fx.load === "ready"
        ? { kind: "ready" }
        : fx.load === "loading"
          ? { kind: "loading" }
          : fx.load === "error"
            ? { kind: "error", message: "fixture" }
            : { kind: "nodraw", reason: name === "nodraw-legacy" ? "no-draws" : "no-program" },
    config: fx.load === "ready" || name === "nodraw-legacy" ? { admin: fx.draws[0]?.authority ?? PublicKey.default, keeper: PublicKey.default, nextDrawId: fx.nextDrawId } : null,
    draws: fx.draws,
    legacyDraws: fx.legacyDraws,
    current: current ?? null,
    select,
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
    // open a session for THAT entry; tiers recomputed with fairness.ts from its (fixture) randomness
    reveal: (e) => {
      const rand = fx.entryRandomness.get(e.address.toBase58());
      if (!current || !rand || !e.needsReveal) return fail(`reveal:${e.address.toBase58()}`)();
      setSession(revealSessionFor(e, current, rand, String(e.seq)));
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
  stale: "sl",
  credits: "cr",
  limit: "lm",
  excluded: "ex",
  headline: "hl",
  nodraw: "nd",
  reveal: "rv",
  loading: "ld",
  error: "er",
};

/** Sits inside the devnet strip's right end (z 101), never over page content. */
function FxBadge({ name }: { name: string }) {
  // on phones a 2–3 letter code ("Fx rd"): the badge gives way, never the honesty marker beside it;
  // single words get a fixed code (slicing "open" to "ope" read as a typo), hyphenated ones their initials
  const code = CODES[name] ?? (name.includes("-") ? name.split("-").map((p) => p[0]).join("") : name.slice(0, 2));
  // the strip's text stops (and truncates) before the badge, so the badge never covers the honesty line
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
      <span className="fxb-short">Fx · {name}</span>
      <span className="fxb-tiny" aria-label={`Fixture ${name}`}>
        Fx {code}
      </span>
      <style>{`.strip-in{padding-right:var(--fxb-w,0px)}.fxb-short,.fxb-tiny{display:none}@media (max-width:760px){.fxb-long{display:none}.fxb-tiny{display:inline}.fxb{padding:0 8px!important}}`}</style>
    </div>
  );
}
