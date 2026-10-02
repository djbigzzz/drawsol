"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

/** Measures the strip so up to 10 stubs fit per row (88–100px each). */
function useStripLayout(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1000);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.floor(el.getBoundingClientRect().width));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const perRow = Math.max(1, Math.min(10, count, Math.floor(w / 88)));
  const stubW = Math.min(100, Math.floor(w / perRow));
  return { ref, perRow, stubW };
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
  const strip = useStripLayout(s?.count ?? 10);

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

  const status =
    s.stage === "confirming"
      ? "Confirming your purchase on devnet…"
      : s.stage === "vrf"
        ? "Waiting for the randomness to land…"
        : s.stage === "revealing"
          ? "Approve the reveal in your wallet. It pays any wins in the same transaction."
          : s.stage === "failed"
            ? "The covers stay on until the reveal goes through."
            : finished
              ? `All ${count} revealed`
              : "Tearing off the covers, one at a time";

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
    return `A roll under ${cum} wins: ${parts.map((p, i) => `under ${p.under} pays ${p.amt}${i === 0 ? " SOL" : ""}`).join(", ")}. Each roll is sha256(randomness + ticket number), scaled to ${d.iwDenominator}.`;
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
  const stepDetail = [
    {
      title: "Bought",
      body: s.buyTx ? (
        <>
          {count} {plural(count, "ticket", "tickets")}
          {price !== null && <> · {sol(price, 2, 4)} SOL</>}
        </>
      ) : s.stage === "confirming" ? (
        "confirming…"
      ) : (
        "Bought earlier"
      ),
    },
    {
      title: "ORAO randomness",
      body: s.vrfMs !== undefined ? `landed in ${(s.vrfMs / 1000).toFixed(1)} s` : s.stage === "confirming" ? "after the purchase" : "waiting…",
    },
    {
      title: "Revealed & paid",
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
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" style={{ display: "inline-block", marginLeft: 6 }}>
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
            <div className="rv-status">
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
                <ErrorNote>
                  {s.error.message}{" "}
                  {retryEntry && !retryEntry.revealed && !retryEntry.isFree && (
                    <button type="button" className="tbtn" onClick={() => reveal(retryEntry)}>
                      Try the reveal again
                    </button>
                  )}
                </ErrorNote>
              </div>
            )}

            <div ref={strip.ref}>
              <div className="rstrip" role="list" aria-label={`${count} ${plural(count, "ticket", "tickets")}`}>
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
                        denom={d?.iwDenominator ?? 1000}
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

            <div className="slot">
              {finished && hasTiers ? (
                total > BigInt(0) ? (
                  <div className="end fin">
                    <div className="total-col">
                      <MoneyTotal amount={sol(total, 2, 4)} mobile={mobile} />
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
              ) : (
                <div>
                  <div className="now" key={`${nowIdx}-${shown}`}>
                    {shown === 0 || nowTier === undefined ? (
                      <>
                        <span className="t-now dim">{ticketNo(s.firstTicket)}</span>
                        <span className="t-voice big">sealed</span>
                      </>
                    ) : nowTier > 0 ? (
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

            <div className="rv-bottom">
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
              <div>
                <div className="rv-actions">
                  {finished && hasTiers ? (
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
                        <button type="button" className="tbtn" onClick={() => setReplays((r) => r + 1)}>
                          Replay
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
                <div className="rv-notes t-fine">
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
