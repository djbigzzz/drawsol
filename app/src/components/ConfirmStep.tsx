"use client";

import { useEffect, useId, useState } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { sol, ticketNo, utcLabel } from "@/lib/format";
import type { DrawView } from "@/lib/types";
import { vaultPda } from "@/lib/chain";
import { Busy, ErrorNote, ProofLink, inFlight } from "./bits";
import { useBuy } from "./BuyContext";
import { FeeLine } from "./Fee";
import { plural } from "./fmt";
import { SheetPicks } from "./Picks";

/**
 * Check and pay: summary, one-line fee, 18+ once, Pay, and the draw guarantee.
 * Renders inside the stub on desktop and inside the sheet on mobile (one instance).
 * There is no question: this is a prize draw decided by chance, with a free entry route beside it.
 */
export function ConfirmStep({ headingId, inStub = false }: { headingId: string; inStub?: boolean }) {
  const { current: d } = useDrawSol();
  const { buy, phase, errors, clearError, disabledReason } = useActions();
  const { qty, closeConfirm, adultRemembered, rememberAdult, forgetAdult } = useBuy();
  const [adult, setAdult] = useState(false);
  const hint = useId();

  useEffect(() => {
    // focus lands on the "Check and pay" heading, so the summary is read first; Tab goes on to the fee.
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
  const ageOk = adultRemembered || adult;
  const bp = phase.buy;
  const busy = inFlight(bp);
  const ready = ageOk && !busy && !disabledReason;

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
      {!inStub && !busy && <SheetPicks />}
      <FeeLine />
      <p className="c-num t-fine-g">Numbered from {ticketNo(d.nextTicket)}, unless someone buys first.</p>

      <AdultRow remembered={adultRemembered} checked={adult} onChange={setAdult} onUndo={forgetAdult} disabled={busy} />

      <button
        type="button"
        className="btn btn-block btn-56 pay"
        onClick={pay}
        disabled={!ready}
        aria-describedby={!ageOk ? hint : undefined}
      >
        {busy && <Busy />}
        {label}
      </button>
      {!ageOk && !busy && (
        <p className="c-hint t-fine" id={hint}>
          Confirm you’re 18 or older to pay.
        </p>
      )}
      {disabledReason && <p className="c-hint t-fine">{disabledReason}</p>}
      {errors.buy && (
        <div className="c-err">
          <ErrorNote onDismiss={() => clearError("buy")}>{errors.buy.message}</ErrorNote>
        </div>
      )}
      <p className="c-fine t-fine">Then sign in your wallet. About <span className="nw">2 s</span> later it asks once more, to reveal your results and pay any wins.</p>
      <Guarantee d={d} />
    </div>
  );
}

/** 18+, asked once per device (DESIGN.md §5.5): a checkbox row, or "18+ confirmed on this device · Undo". */
export function AdultRow({
  remembered,
  checked,
  onChange,
  onUndo,
  disabled,
}: {
  remembered: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
  onUndo: () => void;
  disabled?: boolean;
}) {
  return remembered ? (
    <p className="age-ok t-small">
      <b>18+</b> confirmed on this device ·
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
 * The draw guarantee, scoped to the grand prize (research P0-4), as the spec words it. Every figure is the
 * draw account's, and the locked prize links to the vault that holds it: on phones this line sits in the
 * stub and the confirm sheet, far from the ticket face's own vault link.
 * "Never reduced" covers the grand prize only: instant wins are paid up to what is left in the reserve.
 */
export function Guarantee({ d, className = "" }: { d: DrawView; className?: string }) {
  return (
    <p className={`guarantee t-small ${className}`}>
      Drawn at <span className="nw">{utcLabel(d.closesAt)}</span> or when all {d.ticketCap} tickets sell, whichever comes first. Grand prize already locked:{" "}
      <ProofLink account={vaultPda(d.address)}>{sol(d.prizeLamports, 0, 4)} SOL</ProofLink>. The draw is never extended and the grand prize is never reduced.
    </p>
  );
}
