"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { sol, ticketNo } from "@/lib/format";
import { Busy, ErrorNote, inFlight } from "./bits";
import { useBuy } from "./BuyContext";
import { FeeLine } from "./Fee";
import { plural } from "./fmt";

/** One plain general-knowledge question (UI only, committed to by the draw's terms hash; not checked on-chain). */
const QUESTION = "Which planet is known as the Red Planet?";
const OPTIONS = ["Mars", "Venus", "Jupiter"];
const ANSWER = "Mars";

/**
 * Check and pay: summary, one-line fee, one question, 18+ once, Pay.
 * Renders inside the stub on desktop and inside the sheet on mobile (one instance).
 */
export function ConfirmStep({ headingId, inStub = false }: { headingId: string; inStub?: boolean }) {
  const { current: d } = useDrawSol();
  const { buy, phase, errors, clearError, disabledReason } = useActions();
  const { qty, closeConfirm, adultRemembered, rememberAdult, forgetAdult } = useBuy();
  const [pick, setPick] = useState<string | null>(null);
  const [adult, setAdult] = useState(false);
  const hint = useId();
  const name = useId();
  // shuffled once each time the step opens
  const order = useMemo(() => {
    const a = [...OPTIONS];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, []);

  useEffect(() => {
    // focus lands on the "Check and pay" heading, never on an answer: a focus ring on one option
    // would read as a preselected (wrong) answer. Tab goes on to the fee, then the three options.
    const t = setTimeout(() => document.getElementById(headingId)?.focus({ preventScroll: true }), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeConfirm();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [closeConfirm, headingId]);

  if (!d) return null;
  const subtotal = d.ticketPrice * BigInt(qty);
  const right = pick === ANSWER;
  const ageOk = adultRemembered || adult;
  const bp = phase.buy;
  const busy = inFlight(bp);
  const ready = right && ageOk && !busy && !disabledReason;

  const pay = () => {
    if (!ready) return;
    if (adult) rememberAdult();
    buy(qty);
  };

  const label =
    bp === "simulating" ? "Checking with the program…" : bp === "signing" ? "Approve in your wallet…" : bp === "confirming" ? "Confirming on devnet…" : `Pay ${sol(subtotal, 2, 4)} SOL`;

  return (
    <div className={`confirm stub-in ${inStub ? "in-stub" : ""}`}>
      {/* in the stub, the stub's own head becomes "Check and pay"; the sheet carries its own */}
      {!inStub && (
        <div className="c-head">
          <h2 className="t-stub-head" id={headingId} tabIndex={-1}>
            Check and pay
          </h2>
          <button type="button" className="tbtn" onClick={closeConfirm} disabled={busy}>
            Change quantity
          </button>
        </div>
      )}
      <div className="c-sum">
        <span className="k">
          {qty} {plural(qty, "ticket", "tickets")} × {sol(d.ticketPrice, 2, 4)} SOL
        </span>
        <b className="t-rowtotal">{sol(subtotal, 2, 4)} SOL</b>
      </div>
      <FeeLine />
      <p className="c-num t-fine-g">Numbered from {ticketNo(d.nextTicket)}, unless someone buys first.</p>

      <fieldset className="q">
        <legend>{QUESTION}</legend>
        <span className="sub">One general-knowledge question, then you pay.</span>
        {order.map((o) => (
          <label className="radio" key={o}>
            <input type="radio" name={name} value={o} checked={pick === o} onChange={() => setPick(o)} disabled={busy} />
            <span className="ring" aria-hidden="true" />
            {o}
          </label>
        ))}
        <p className="msg" aria-live="polite">
          {pick === null ? "" : right ? <span className="c-blue">Correct.</span> : "Not quite. Have another go."}
        </p>
      </fieldset>

      {adultRemembered ? (
        <p className="age-ok t-small">
          <b>18+</b> confirmed on this device ·
          <button type="button" className="tbtn" onClick={forgetAdult}>
            Undo
          </button>
        </p>
      ) : (
        <label className="age">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} disabled={busy} />
          <span>
            I’m 18 or older. <span className="sub">Asked once, remembered on this device.</span>
          </span>
        </label>
      )}

      <button
        type="button"
        className="btn btn-block btn-56 pay"
        onClick={pay}
        disabled={!ready}
        aria-describedby={!right || !ageOk ? hint : undefined}
      >
        {busy && <Busy />}
        {label}
      </button>
      {(!right || !ageOk) && !busy && (
        <p className="c-hint t-fine" id={hint}>
          Answer the question and confirm you’re 18+ to pay.
        </p>
      )}
      {disabledReason && <p className="c-hint t-fine">{disabledReason}</p>}
      {errors.buy && (
        <div className="c-err">
          <ErrorNote onDismiss={() => clearError("buy")}>{errors.buy.message}</ErrorNote>
        </div>
      )}
      <p className="c-fine t-fine">Then sign in your wallet. About <span className="nw">2 s</span> later it asks once more, to reveal your results and pay any wins.</p>
    </div>
  );
}
