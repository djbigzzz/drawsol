"use client";

import { useEffect, useRef, useState } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { sol, utcLabel } from "@/lib/format";
import { Busy, Check, ErrorNote, ProofLink } from "./bits";
import { useBuy } from "./BuyContext";
import { n, plural, prizeSol, tno, usdPrize } from "./fmt";

const FLIP_MS = 420;

/**
 * The reveal: after paying, ORAO assigns the ticket numbers (about 2 s) and the reveal transaction writes them
 * and pays any instant win. The sheet shows the wait, then each ticket flipping to its number and result. Every
 * number and amount is read from the Entry account after the reveal (tickets, prizes, instant_paid); nothing is
 * invented here.
 */
export function RevealSheet() {
  const { current: d, solUsd } = useDrawSol();
  const { session: s, closeSession } = useActions();
  const { closeSheet } = useBuy();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const open = !!s && !!d;

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => document.getElementById("reveal-h")?.focus({ preventScroll: true }), 60);
    const el = ref.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && s && (s.stage === "revealed" || s.stage === "failed")) closeSession();
      if (e.key !== "Tab" || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, s, closeSession]);

  // the flip: one ticket after another; reduced motion (or a session opened on finished results) shows all at once
  const [shown, setShown] = useState(0);
  const key = s ? `${s.entry.toBase58()}:${s.stage}` : "";
  useEffect(() => {
    if (!s || s.stage !== "revealed") return setShown(0);
    const start = s.initialShown ?? (reduced ? s.count : 0);
    setShown(start);
    if (start >= s.count) return;
    let i = start;
    const t = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= s.count) clearInterval(t);
    }, FLIP_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);

  if (!open || !s || !d) return null;
  const finished = s.stage === "revealed" || s.stage === "failed";
  const tickets = s.tickets ?? [];
  // per ticket: the prize from the entry's prizes (tier + 1) against the draw's tiers
  const winOf = (i: number): bigint => {
    const k = s.prizes?.[i] ?? 0;
    return k > 0 && d.tiers[k - 1] ? d.tiers[k - 1].amount : BigInt(0);
  };
  const wins = tickets.map((_, i) => winOf(i)).filter((x) => x > BigInt(0));
  const paid = s.instantPaid ?? BigInt(0);
  const allShown = shown >= s.count;
  const title =
    s.stage === "confirming"
      ? "Confirming your purchase…"
      : s.stage === "vrf"
        ? "Revealing your tickets…"
        : s.stage === "revealing"
          ? "Writing your result on-chain…"
          : s.stage === "failed"
            ? "Reveal didn’t finish"
            : !allShown
              ? "Your tickets"
              : wins.length
                ? `You won ${usdPrize(paid, solUsd) ?? `${prizeSol(paid)} SOL`}`
                : "No instant win this time";

  return (
    <>
      <div className="scrim" onClick={finished ? closeSession : undefined} aria-hidden="true" />
      <div className="sheet sheet-wide" role="dialog" aria-modal="true" aria-labelledby="reveal-h" ref={ref}>
        <div className="sheet-in reveal">
          <div className="sheet-head">
            <h2 className="t-h3" id="reveal-h" tabIndex={-1} aria-live="polite">
              {(s.stage === "confirming" || s.stage === "vrf" || s.stage === "revealing") && <Busy />}
              {title}
            </h2>
            {finished && (
              <button type="button" className="tbtn" onClick={closeSession}>
                Close
              </button>
            )}
          </div>

          {s.stage === "confirming" && <p className="panel-text">Your transaction is being confirmed on devnet.</p>}
          {s.stage === "vrf" && (
            <p className="panel-text">
              ORAO is drawing the randomness that assigns your {s.count} ticket {plural(s.count, "number", "numbers")}, usually within about 2 seconds. You will be asked to
              sign once more to write the result.
            </p>
          )}
          {s.stage === "revealing" && <p className="panel-text">Approve the reveal in your wallet. It writes your numbers and pays any instant win in the same transaction.</p>}
          {s.stage === "failed" && (
            <>
              <ErrorNote>{s.error?.message ?? "The reveal failed."}</ErrorNote>
              <p className="panel-text">
                Your {s.count} {plural(s.count, "ticket is", "tickets are")} safe and in the draw. Their numbers are assigned when the reveal goes through; anyone can send the
                reveal later, and any win is paid to you.
              </p>
              <div className="rv-act">
                <a className="btn btn-primary" href="#my-tickets" onClick={closeSession}>
                  Go to Your tickets
                </a>
              </div>
            </>
          )}

          {(s.stage === "vrf" || s.stage === "revealing" || s.stage === "confirming") && (
            <ul className="rv-grid" aria-hidden="true">
              {Array.from({ length: Math.min(s.count, 30) }, (_, i) => (
                <li key={i} className="rchip sealed">
                  <b className="tab">#·,···</b>
                  <span>number pending</span>
                </li>
              ))}
              {s.count > 30 && <li className="rchip more">+{n(s.count - 30)} more</li>}
            </ul>
          )}

          {s.stage === "revealed" && (
            <>
              <ul className="rv-grid" aria-label={`Your ${s.count} tickets`}>
                {tickets.map((t, i) => {
                  const win = winOf(i);
                  const on = i < shown;
                  const u = usdPrize(win, solUsd);
                  return (
                    <li key={i} className={`rchip ${on ? "on" : "sealed"} ${on && win > BigInt(0) ? "win" : ""}`} style={!reduced && on ? { transitionDelay: `${(i - (s.initialShown ?? 0)) * 20}ms` } : undefined}>
                      <b className="tab">{on ? tno(t) : "#·,···"}</b>
                      <span>{!on ? "…" : win > BigInt(0) ? `Won ${u ?? `${prizeSol(win)} SOL`}` : "No win"}</span>
                    </li>
                  );
                })}
              </ul>
              {allShown && (
                <div className="rv-sum" aria-live="polite">
                  {wins.length ? (
                    <p className="rv-won">
                      <span className="done-mark" aria-hidden="true">
                        <Check size={18} stroke={2.6} />
                      </span>
                      <span>
                        <b>
                          {wins.length} of {s.count} {plural(s.count, "ticket", "tickets")} won
                        </b>{" "}
                        · {usdPrize(paid, solUsd) ?? `${prizeSol(paid)} SOL`} paid to your wallet in the reveal transaction.
                      </span>
                    </p>
                  ) : (
                    <p className="panel-text">
                      None of your {s.count} {plural(s.count, "number matches", "numbers match")} the published schedule. {s.count === 1 ? "It is" : "They are all"} in the draw for the end
                      prize on {utcLabel(d.drawAt)}.
                    </p>
                  )}
                  <p className="done-links">
                    {s.revealTx && <ProofLink tx={s.revealTx}>Reveal transaction</ProofLink>}
                    {s.buyTx && <ProofLink tx={s.buyTx}>Purchase transaction</ProofLink>}
                    <ProofLink account={s.entry}>Your entry account</ProofLink>
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary btn-xl btn-block"
                    onClick={() => {
                      closeSession();
                      closeSheet();
                    }}
                  >
                    Done
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
