"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { phaseOf } from "@/lib/derive";
import { sol, utcLabel } from "@/lib/format";
import { Busy, ErrorNote, inFlight, phaseLabel } from "./bits";
import { useBuy } from "./BuyContext";
import { FeeLine } from "./Fee";
import { n, plural, usd } from "./fmt";

/** 18+, asked once per device: a checkbox row, or "18+ confirmed on this device · Undo". */
export function AdultRow({ remembered, checked, onChange, onUndo, disabled }: { remembered: boolean; checked: boolean; onChange: (v: boolean) => void; onUndo: () => void; disabled?: boolean }) {
  return remembered ? (
    <p className="age-ok">
      <b>18+</b> confirmed on this device ·{" "}
      <button type="button" className="tbtn" onClick={onUndo}>
        Undo
      </button>
    </p>
  ) : (
    <label className="age">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        I’m 18 or older. <span className="sub">Asked once, remembered on this device.</span>
      </span>
    </label>
  );
}

/**
 * The confirm step as a dialog: centred on desktop, a bottom sheet on phones. Focus is trapped; scrim and Esc
 * close it (not while a transaction is in flight). Once the purchase confirms, the reveal sheet takes over.
 */
export function ConfirmSheet() {
  const { current: d, now } = useDrawSol();
  const { phase } = useActions();
  const { step, closeSheet } = useBuy();
  const ref = useRef<HTMLDivElement>(null);
  const busy = inFlight(phase.buy);
  const open = !!d && step === "confirm" && phaseOf(d, now) === "selling";

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) closeSheet();
      if (e.key !== "Tab" || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href], summary, [tabindex]:not([tabindex='-1'])"));
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
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, closeSheet]);

  if (!open || !d) return null;
  return (
    <>
      <div className="scrim" onClick={busy ? undefined : closeSheet} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" ref={ref}>
        <ConfirmStep />
      </div>
    </>
  );
}

/** Check and pay: the summary, the fee line, 18+ once, Pay, and the draw guarantee. */
function ConfirmStep() {
  const { current: d, solUsd } = useDrawSol();
  const { buy, phase, errors, clearError, disabledReason } = useActions();
  const { qty, closeSheet, adultRemembered, rememberAdult, forgetAdult } = useBuy();
  const [adult, setAdult] = useState(false);
  const hint = useId();
  useEffect(() => {
    const t = setTimeout(() => document.getElementById("sheet-h")?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, []);
  if (!d) return null;
  const subtotal = d.ticketPrice * BigInt(qty);
  const ageOk = adultRemembered || adult;
  const bp = phase.buy;
  const busy = inFlight(bp);
  const ready = ageOk && !busy && !disabledReason;
  const price = usd(d.ticketPrice, solUsd);
  const total = usd(subtotal, solUsd);
  const pay = () => {
    if (!ready) return;
    if (adult) rememberAdult();
    buy(qty);
  };
  return (
    <div className="sheet-in">
      <div className="sheet-head">
        <h2 className="t-h3" id="sheet-h" tabIndex={-1}>
          Check and pay
        </h2>
        <button type="button" className="tbtn" onClick={closeSheet} disabled={busy}>
          Change quantity
        </button>
      </div>
      <dl className="sum">
        <div>
          <dt>
            {qty} {plural(qty, "ticket", "tickets")} × {price ?? `${sol(d.ticketPrice, 2, 5)} SOL`}
          </dt>
          <dd className="tab">{total ?? `${sol(subtotal, 2, 5)} SOL`}</dd>
        </div>
        {total && (
          <div>
            <dt>Paid in SOL</dt>
            <dd className="tab">{sol(subtotal, 2, 5)} SOL</dd>
          </div>
        )}
      </dl>
      <FeeLine count={qty} />
      <p className="helper">Your ticket numbers are assigned at random by ORAO about 2 s after you pay; you sign once more to reveal them.</p>
      <AdultRow remembered={adultRemembered} checked={adult} onChange={setAdult} onUndo={forgetAdult} disabled={busy} />
      <button type="button" className="btn btn-primary btn-xl btn-block" onClick={pay} disabled={!ready} aria-describedby={!ageOk ? hint : undefined}>
        {busy && <Busy />}
        {phaseLabel(bp, `Pay ${sol(subtotal, 2, 5)} SOL`)}
      </button>
      {!ageOk && !busy && (
        <p className="helper" id={hint}>
          Confirm you’re 18 or older to pay.
        </p>
      )}
      {disabledReason && <p className="helper">{disabledReason}</p>}
      {errors.buy && <ErrorNote onDismiss={() => clearError("buy")}>{errors.buy.message}</ErrorNote>}
      <p className="helper">
        Then approve in your wallet. About 2 s later it asks once more, to reveal your numbers and pay any instant win. Drawn{" "}
        <span className="nw">{utcLabel(d.drawAt)}</span>, guaranteed; the full end prize once {n(d.minTickets)} tickets sell, else {d.potBps / 100}% of sales. No refunds.
      </p>
    </div>
  );
}
