"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActions, useDrawSol, type RevealSession } from "@/hooks/context";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { phaseOf, tierAmount } from "@/lib/derive";
import { rollTicket, ticketX } from "@/lib/fairness";
import { sol, ticketNo, ticketRange, utcLabel } from "@/lib/format";
import { inkAt, ticketInk } from "@/lib/print";
import { Addr, Busy, Check, ErrorNote, ProofLink } from "./bits";
import { useBuy } from "./BuyContext";
import { andList, plural } from "./fmt";
import { Mark } from "./print/Mark";
import { MoneyTotal } from "./print/MoneyTotal";
import { ReceiptBars } from "./print/ReceiptBars";
import { Stamp } from "./print/Stamp";
import { RevealStub } from "./TicketStub";

type StepState = "done" | "busy" | "todo" | "failed";

/**
 * Bought → ORAO randomness → Revealed & paid, from the session's real stage. Once the reveal
 * transaction has confirmed, the wins are paid: the cover animation is presentation, not a request.
 */
function stepStates(s: RevealSession): StepState[] {
  if (s.stage === "failed") {
    const at = !s.buyTx && !s.vrfRequest ? 0 : s.vrfMs === undefined ? 1 : 2;
    return [0, 1, 2].map((i) => (i < at ? "done" : i === at ? "failed" : "todo"));
  }
  switch (s.stage) {
    case "confirming":
      return ["busy", "todo", "todo"];
    case "vrf":
      return ["done", "busy", "todo"];
    case "revealing":
      return ["done", "done", "busy"];
    default:
      return ["done", "done", "done"];
  }
}

const WIN_BEAT = 760;
const LOSE_BEAT = 330;
const FIRST_BEAT = 450;
const END_BEAT = 250;

/**
 * Measures the main column with a callback ref, so the observer attaches whenever the strip mounts
 * (the sheet first renders with no session, so a mount-time effect would never see the element).
 */
function useColumnWidth() {
  const [w, setW] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) return;
    const set = () => setW(Math.floor(el.getBoundingClientRect().width));
    set();
    ro.current = new ResizeObserver(set);
    ro.current.observe(el);
  }, []);
  useEffect(() => () => ro.current?.disconnect(), []);
  return { ref, w };
}

/**
 * Up to 10 stubs per row at 88–100px each. A purchase of 10 or fewer that can't sit on one row is
 * split into even rows (5 + 5, not 8 + 2); longer purchases run in rows of as many as fit.
 */
function stripLayout(w: number, count: number) {
  const fit = Math.max(1, Math.min(10, count, Math.floor(w / 88)));
  const perRow = count <= 10 ? Math.ceil(count / Math.ceil(count / fit)) : fit;
  const stubW = Math.min(100, Math.floor(w / perRow));
  return { perRow, stubW };
}

/**
 * The reveal total's size from the main column's width (the end layout is chosen by the same width
 * with a container query in globals.css): [total | detail ≥ 272 | PAID 144] with 48px gaps from 900px,
 * else the total and the stamp share a row and the winners sentence sets underneath.
 */
function totalFit(w: number, mobile: boolean, short: boolean): { size: number; maxW?: number } {
  // short screens (a 1366×768 laptop, an iPad in landscape, an iPhone SE) step the figure down, so the
  // total, the payout link and "Buy more tickets" can share the first screen with the strip
  if (mobile) return { size: short ? 80 : 96 };
  if (w >= 900) return { size: short ? 144 : 196, maxW: w - 48 - 272 - 48 - 144 };
  return { size: 144, maxW: Math.max(160, w - 24 - 144) };
}

/** A media query as state (client only; false on the prerender). */
function useMedia(q: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const set = () => setOn(mq.matches);
    set();
    mq.addEventListener?.("change", set);
    return () => mq.removeEventListener?.("change", set);
  }, [q]);
  return on;
}

export function RevealSheet() {
  const { session: s, closeSession, reveal } = useActions();
  const { myEntries, current: d, wallet, now } = useDrawSol();
  const { focusBuy, mobile } = useBuy();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const [finished, setFinished] = useState(false);
  const [replays, setReplays] = useState(0);
  const [announce, setAnnounce] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const col = useColumnWidth();
  const colW = col.w || 1000;
  const strip = stripLayout(colW, s?.count ?? 10);
  // the same breakpoints as the short-screen blocks in globals.css
  const shortScreen = useMedia(mobile ? "(max-height: 700px)" : "(max-height: 819px)");
  const fit = totalFit(colW, mobile, shortScreen);
  const slotRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const actRef = useRef<HTMLDivElement>(null);
  const userScrolled = useRef(false);
  const scrolledDuring = useRef(false);

  const entryKey = s?.entry.toBase58();
  const hasTiers = !!s?.tiers;
  const paused = s?.initialShown !== undefined && replays === 0;

  // a new session (or a replay) starts with every cover on
  useEffect(() => {
    if (!s) return;
    const start = replays === 0 && s.initialShown !== undefined ? s.initialShown : 0;
    setShown(start);
    setFinished(replays === 0 && s.initialShown !== undefined && s.initialShown >= s.count);
    setAnnounce("");
    userScrolled.current = false;
    scrolledDuring.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey, replays]);

  // tear the covers off one at a time, only once the tiers have come back from the chain
  useEffect(() => {
    if (!s || !hasTiers || paused) return;
    if (reduced) {
      setShown(s.count);
      setFinished(true);
      return;
    }
    if (shown < s.count) {
      const prevWon = shown > 0 && (s.tiers![shown - 1] ?? 0) > 0;
      const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? FIRST_BEAT : prevWon ? WIN_BEAT : LOSE_BEAT);
      return () => clearTimeout(t);
    }
    if (!finished) {
      const t = setTimeout(() => setFinished(true), END_BEAT);
      return () => clearTimeout(t);
    }
  }, [s, hasTiers, shown, finished, reduced, paused]);

  // the announcer speaks winners only, then the payout
  useEffect(() => {
    if (!s?.tiers || paused || shown === 0) return;
    const i = shown - 1;
    const t = s.tiers[i];
    if (t > 0 && !reduced) setAnnounce(`${ticketNo(s.firstTicket + i)} wins ${sol(tierAmount(s, t), 2, 4)} SOL.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => {
    if (!s || !finished || paused) return;
    const total = s.instantPaid ?? BigInt(0);
    if (total > BigInt(0)) setAnnounce(`Paid: ${sol(total, 2, 4)} SOL${wallet ? ` to ${short(wallet.address.toBase58())}` : ""}, in the reveal transaction.`);
    else setAnnounce(`All ${s.count} revealed. No instant wins this time.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // The overlay follows the reveal on short screens, only ever downwards and never against the reader:
  // once the first cover is off, just enough to bring the now-showing slot into view (never past the
  // strip's top edge: the strip is the action); once it has ended, enough to show the total and the
  // next step (never past 96px above the slot, so the total and the strip's lower edge stay in view).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const mark = () => (userScrolled.current = true);
    const keys = (e: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(e.key)) mark();
    };
    box.addEventListener("wheel", mark, { passive: true });
    box.addEventListener("touchmove", mark, { passive: true });
    box.addEventListener("keydown", keys);
    return () => {
      box.removeEventListener("wheel", mark);
      box.removeEventListener("touchmove", mark);
      box.removeEventListener("keydown", keys);
    };
  }, [entryKey]);
  useEffect(() => {
    if (!s || !hasTiers) return;
    const during = !finished && shown > 0 && !scrolledDuring.current;
    if (!during && !finished) return;
    if (during) scrolledDuring.current = true;
    const go = () => {
      const box = boxRef.current;
      const slot = slotRef.current;
      if (!box || !slot || userScrolled.current) return;
      const vh = window.innerHeight;
      const top = box.getBoundingClientRect().top;
      const target = finished ? ((actRef.current?.firstElementChild as HTMLElement | null) ?? slot) : slot;
      const need = target.getBoundingClientRect().bottom - (vh - 16);
      if (need <= 0) return;
      const room = finished
        ? slot.getBoundingClientRect().top - top - 96
        : (stripRef.current?.getBoundingClientRect().top ?? top) - top - 8;
      const by = Math.min(need + 8, Math.max(0, room));
      if (by > 0) box.scrollBy({ top: by, behavior: reduced ? "auto" : "smooth" });
    };
    // after the end layout has set (the figure fits itself to the column in a layout effect)
    const t = setTimeout(go, finished ? (reduced ? 0 : 120) : 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown > 0, finished, hasTiers, entryKey, replays]);

  // dialog: focus, Esc, focus trap, scroll lock; focus returns to whatever opened it
  useEffect(() => {
    if (!s) return;
    opener.current = document.activeElement as HTMLElement | null;
    // focus the title (announced first, no ring); the close button keeps its ring for keyboard users
    titleRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSession();
      if (e.key !== "Tab" || !boxRef.current) return;
      const f = Array.from(boxRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener.current?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey]);

  const rolls = useMemo(() => {
    if (!s?.randomness || s.randomness.length !== 64 || !d) return null;
    return Array.from({ length: s.count }, (_, i) => ticketX(s.randomness!, s.firstTicket + i, d.iwDenominator));
  }, [s?.randomness, s?.count, s?.firstTicket, d]);
  const disagrees = useMemo(() => {
    if (!s?.randomness || s.randomness.length !== 64 || !s.tiers || !d) return false;
    return s.tiers.some((t, i) => rollTicket(s.randomness!, s.firstTicket + i, d.iwDenominator, d.iwTiers) !== t);
  }, [s?.randomness, s?.tiers, s?.firstTicket, d]);

  if (!s) return null;
  const states = stepStates(s);
  const count = s.count;
  const n = d ? `Draw Nº ${d.id}` : "the draw";
  const tiers = s.tiers;
  const total = s.instantPaid ?? BigInt(0);
  const wins = tiers ? tiers.map((t, i) => ({ t, i })).filter((x) => x.t > 0) : [];
  const wonSoFar = tiers ? tiers.slice(0, shown).reduce((a, t) => a + tierAmount(s, t), BigInt(0)) : BigInt(0);
  const retryEntry = myEntries.find((e) => e.address.equals(s.entry));
  const selling = d ? phaseOf(d, now) === "selling" : false;
  const price = d ? d.ticketPrice * BigInt(count) : null;
  const inkFor = (ticket: number) => (s.randomness && s.randomness.length ? ticketInk(s.randomness, ticket) : ticketInk(s.entry.toBytes(), ticket));

  // Before any result is known, the slot says what's happening (with the busy dot) and the status row
  // stays quiet, so the stage is said once, where the eye goes after the strip (DESIGN.md §5.6).
  const waiting = !hasTiers && s.stage !== "failed";
  const wait =
    s.stage === "confirming"
      ? "Confirming your purchase on devnet…"
      : s.stage === "vrf"
        ? "The covers come off as soon as ORAO’s randomness lands, usually about 2 s."
        : s.stage === "revealing"
          ? "Approve the reveal in your wallet. It pays any wins in the same transaction."
          : "Reading the results from devnet…";
  const status =
    s.stage === "failed"
      ? "The covers stay on until the reveal goes through."
      : waiting
        ? ""
        : finished
          ? `All ${count} revealed`
          : "Tearing off the covers, one at a time";
  const canRetry = !!retryEntry && !retryEntry.revealed && !retryEntry.isFree;
  // the VRF timeout message already says the tickets are safe
  const safeNote = s.stage === "failed" && !/safe/i.test(s.error?.message ?? "");

  // cumulative thresholds for the roll key
  const key = (() => {
    if (!d) return null;
    let cum = 0;
    const parts: { under: number; amt: string }[] = [];
    d.iwTiers.forEach((t) => {
      if (t.odds <= 0 || t.amount <= BigInt(0)) return;
      cum += t.odds;
      parts.push({ under: cum, amt: sol(t.amount, 2, 4) });
    });
    if (!parts.length) return null;
    return `Demo odds, boosted: a roll under ${cum} wins. Under ${parts.map((p, i) => `${p.under} pays ${p.amt}${i === 0 ? " SOL" : ""}`).join(", under ")}. Each roll is sha256(randomness + ticket number), scaled to ${d.iwDenominator}.`;
  })();

  const revealing = s.stage === "revealed" && hasTiers && !finished && shown < count;
  const skip = () => {
    setShown(count);
    setFinished(true);
  };

  const nowIdx = shown > 0 ? shown - 1 : 0;
  const nowTier = tiers && shown > 0 ? tiers[nowIdx] : undefined;

  // one proof link per step: inline on wider screens, gathered in one 44px row on phones so
  // no two tap targets overlap on the compact 22px step lines
  const stepLinks = [
    s.buyTx ? <ProofLink tx={s.buyTx}>Purchase tx</ProofLink> : s.stage !== "confirming" ? <ProofLink account={s.entry}>Entry</ProofLink> : null,
    s.vrfRequest && s.stage !== "confirming" ? <ProofLink account={s.vrfRequest}>Request</ProofLink> : null,
    s.revealTx ? <ProofLink tx={s.revealTx}>Reveal tx</ProofLink> : null,
  ];
  const bought = (
    <>
      {count} {plural(count, "ticket", "tickets")}
      {price !== null && (
        <>
          {" "}
          · <span className="nw">{sol(price, 2, 4)} SOL</span>
        </>
      )}
    </>
  );
  // `short` is the one-line form for short phones ("Bought · ORAO 1.8 s · Revealed & paid")
  const stepDetail = [
    s.buyTx || s.stage === "confirming"
      ? { title: "Bought", short: "Bought", body: s.buyTx ? bought : "confirming…" }
      : // a later reveal (from Your tickets): what was bought, not the word twice
        { title: "Bought earlier", short: "Bought", body: bought },
    {
      title: "ORAO randomness",
      short: s.vrfMs !== undefined ? `ORAO ${(s.vrfMs / 1000).toFixed(1)} s` : "ORAO",
      body: s.vrfMs !== undefined ? `landed in ${(s.vrfMs / 1000).toFixed(1)} s` : s.stage === "confirming" ? "after the purchase" : "waiting…",
    },
    {
      title: "Revealed & paid",
      short: "Revealed & paid",
      body: "in one transaction",
    },
  ];

  const rows: number[][] = [];
  for (let i = 0; i < count; i += strip.perRow) rows.push(Array.from({ length: Math.min(strip.perRow, count - i) }, (_, k) => i + k));

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-labelledby="reveal-title" ref={boxRef}>
      <div className="page">
        <div className="rv-top">
          <div className="l">
            <Mark />
            <span className="t-ui" style={{ fontWeight: 600 }}>
              {n}
            </span>
          </div>
          <button type="button" className="tbtn" onClick={closeSession}>
            Back to the draw
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" style={{ display: "inline-block", marginLeft: 8 }}>
              <path d="M2 2 8 8M8 2 2 8" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          </button>
        </div>

        <div className="rv-grid">
          <aside className="rv-side">
            <div className="rv-h">
              <h1 className="t-sec" id="reveal-title" tabIndex={-1} ref={titleRef}>
                {count === 1 ? "Your ticket" : `Your ${count} tickets`}
              </h1>
              <p className="sub t-small">
                {/* the top bar already names the draw on phones */}
                <span className="sub-n">{n} · </span>
                <span className="nw tab">{ticketRange(s.firstTicket, count)}</span>
              </p>
            </div>
            <ol className="receipt">
              {stepDetail.map((st, i) => (
                <li key={st.title} className={states[i] === "done" ? "done" : states[i] === "busy" ? "busy-s" : states[i]}>
                  <span className="mk" aria-hidden="true">
                    {states[i] === "done" ? <Check size={11} /> : states[i] === "busy" ? <Busy /> : i + 1}
                  </span>
                  <span className="txt-s" aria-hidden="true">
                    {st.short}
                  </span>
                  <span className="txt">
                    <b>{st.title}</b>
                    <span className="d">
                      {st.body}
                      {stepLinks[i] && <span className="pl-in"> {stepLinks[i]}</span>}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {stepLinks.some(Boolean) && (
              <p className="receipt-links">
                {stepLinks.filter(Boolean).map((l, i) => (
                  <span key={i}>
                    {i > 0 && (
                      <span className="sep" aria-hidden="true">
                        ·
                      </span>
                    )}
                    {l}
                  </span>
                ))}
              </p>
            )}
            {hasTiers && key && <p className="rollkey rollkey-side t-fine">{key}</p>}
          </aside>

          <section className="rv-main" aria-label="Instant results">
            {/* phones drop the "All 10 revealed" line once it's over, so the total and the next step fit */}
            <div className={`rv-status ${finished && hasTiers ? "over" : ""}`}>
              <span className="t-voice">{status}</span>
              {/* during the reveal only; nothing on the right once it has ended */}
              {revealing && (
                <button type="button" className="tbtn skip" onClick={skip}>
                  Skip to total
                </button>
              )}
            </div>

            {s.stage === "failed" && s.error && (
              <div className="rv-fail">
                <ErrorNote>{s.error.message}</ErrorNote>
              </div>
            )}

            <div ref={col.ref}>
              <div
                ref={stripRef}
                className="rstrip"
                role="list"
                aria-label={`${count} ${plural(count, "ticket", "tickets")}`}
                // rows break where the layout says (5 + 5), not wherever the flex line runs out
                style={mobile ? undefined : { maxWidth: strip.perRow * strip.stubW }}
              >
                {(mobile ? [Array.from({ length: count }, (_, i) => i)] : rows).flatMap((row) =>
                  row.map((i, k) => {
                    const tier = tiers?.[i];
                    return (
                      <RevealStub
                        key={i}
                        ticket={s.firstTicket + i}
                        tier={tier}
                        amount={tier ? tierAmount(s, tier) : BigInt(0)}
                        shown={i < shown || (finished && hasTiers)}
                        roll={rolls ? rolls[i] : null}
                        denom={d ? d.iwDenominator : null}
                        ink={inkFor(s.firstTicket + i)}
                        rowFirst={k === 0}
                        rowLast={k === row.length - 1}
                        even={i % 2 === 1}
                        width={mobile ? undefined : strip.stubW}
                      />
                    );
                  })
                )}
              </div>
            </div>
            {disagrees && <p className="rollkey bad t-fine">Recomputed roll disagrees with the chain; the chain result stands.</p>}

            <div className="plate-rule" aria-hidden="true">
              <i className="r1" />
              <i className="r2" />
              <i className="k1" />
              <i className="k2" />
            </div>

            {/* 224px while the covers come off; once the reveal ends it grows to fit the end layout */}
            {/* failed: the slot is empty and folds away, so the one next step comes up under the strip */}
            <div className={`slot ${finished && hasTiers ? "done" : ""} ${s.stage === "failed" ? "failed" : ""}`} ref={slotRef}>
              {finished && hasTiers ? (
                total > BigInt(0) ? (
                  <div className="end fin">
                    <div className="total-col">
                      <MoneyTotal amount={sol(total, 2, 4)} mobile={mobile} size={fit.size} maxW={fit.maxW} />
                    </div>
                    <div className="detail t-body">
                      <p>
                        <strong>
                          {wins.length} winning {plural(wins.length, "ticket", "tickets")}:
                        </strong>{" "}
                        {andList(wins.map((w) => `${ticketNo(s.firstTicket + w.i)} +${sol(tierAmount(s, w.t), 2, 3)}`))}.{" "}
                        {wallet ? (
                          <>
                            Paid to <Addr k={wallet.address} /> in the reveal transaction.
                          </>
                        ) : (
                          <>Paid in the reveal transaction.</>
                        )}{" "}
                        {s.revealTx && <ProofLink tx={s.revealTx}>Payout transaction</ProofLink>}
                      </p>
                    </div>
                    <div className="paid-cell">
                      <Stamp
                        kind="paid"
                        seed={s.randomness && s.randomness.length ? inkAt(s.randomness, 0) : inkAt(s.entry.toBytes(), 24)}
                        label="Stamped: paid in the same transaction"
                        top={d ? `DRAW Nº ${d.id}` : "DRAWSOL"}
                        bottom="SAME TX"
                        baseAngle={-12}
                        padded
                      />
                    </div>
                  </div>
                ) : (
                  <div className="nowin fin">
                    <p className="t-voice">No instant wins this time.</p>
                    <p className="t-body">
                      All {count} {plural(count, "ticket is", "tickets are")} still in the grand draw{d ? ` for ${sol(d.prizeLamports, 0, 4)} SOL` : ""}.
                    </p>
                  </div>
                )
              ) : waiting ? (
                <p className="slot-wait t-voice" role="status">
                  <Busy />
                  <span>{wait}</span>
                </p>
              ) : !hasTiers || shown === 0 || nowTier === undefined ? null : (
                <div>
                  <div className="now" key={`${nowIdx}-${shown}`}>
                    {nowTier > 0 ? (
                      <>
                        <span className="t-now">{ticketNo(s.firstTicket + nowIdx)}</span>
                        <span className="t-now won">
                          +{sol(tierAmount(s, nowTier), 2, 3)}
                          <span className="u">SOL</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="t-now dim">{ticketNo(s.firstTicket + nowIdx)}</span>
                        <span className="t-voice big">no win</span>
                      </>
                    )}
                  </div>
                  <p className="tally t-ui">
                    Won so far<b className={wonSoFar > BigInt(0) ? "" : "zero"}>{sol(wonSoFar, 2, 4)} SOL</b>
                  </p>
                </div>
              )}
            </div>

            {/* phones: the actions come before the receipt slip (globals.css), so the next step is in view */}
            <div className={`rv-bottom ${finished && hasTiers ? "done" : ""}`}>
              <div className="slip receipt-slip">
                <p className="t-label">Your receipt</p>
                <ReceiptBars
                  wins={Array.from({ length: count }, (_, i) => (tiers ? Number(tierAmount(s, tiers[i] ?? 0)) / 1e9 : 0))}
                  shown={hasTiers ? (finished ? count : shown) : 0}
                  first={s.firstTicket}
                  label={
                    !hasTiers
                      ? `Receipt: ${count} ${plural(count, "ticket", "tickets")}, still sealed.`
                      : wins.length
                        ? `Receipt: ${andList(wins.map((w) => `${ticketNo(s.firstTicket + w.i)} won ${sol(tierAmount(s, w.t), 2, 3)}`))} SOL; the other ${count - wins.length} won nothing.`
                        : `Receipt: none of the ${count} tickets won an instant prize.`
                  }
                />
              </div>
              <div className="rv-act-col">
                <div className="rv-actions" ref={actRef}>
                  {s.stage === "failed" ? (
                    canRetry ? (
                      <button type="button" className="btn btn-56" onClick={() => reveal(retryEntry!)}>
                        Try the reveal again
                      </button>
                    ) : (
                      <button type="button" className="btn btn-56" onClick={closeSession}>
                        Back to {n}
                      </button>
                    )
                  ) : finished && hasTiers ? (
                    <>
                      {selling && (
                        <button
                          type="button"
                          className="btn btn-56"
                          onClick={() => {
                            closeSession();
                            focusBuy();
                          }}
                        >
                          Buy more tickets
                        </button>
                      )}
                      <button type="button" className="tbtn" onClick={closeSession}>
                        Back to {n}
                      </button>
                      {!reduced && (
                        <button
                          type="button"
                          className="tbtn"
                          onClick={() => {
                            // replay from the top: on a phone Replay sits below the fold
                            boxRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                            setReplays((r) => r + 1);
                          }}
                        >
                          Replay
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
                <div className="rv-notes t-fine">
                  {safeNote && <p className="c-ink-2">Your tickets are safe; you can reveal them later from Your tickets.</p>}
                  <p>
                    All {count} {plural(count, "ticket stays", "tickets stay")} in the grand draw{d ? <> for <span className="nw">{sol(d.prizeLamports, 0, 4)} SOL</span></> : ""}
                    {d ? (
                      <>
                        , drawn at sell-out or on <span className="nw">{utcLabel(d.closesAt)}</span>.
                      </>
                    ) : (
                      "."
                    )}
                  </p>
                  <p>Each stamp’s ink is printed from that ticket’s randomness.</p>
                  {hasTiers && key && <p className="rollkey-m">{key}</p>}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
