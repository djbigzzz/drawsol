"use client";

import { useEffect, useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { sol, ticketNo } from "@/lib/format";
import { inkAt } from "@/lib/print";
import type { DrawView } from "@/lib/types";
import { Addr, Busy, ProofLink } from "./bits";
import { kindName, longDay, prizeFig, stampDay } from "./fmt";
import { cancelReason, grandPrize } from "@/lib/derive";
import { Barcode } from "./print/Barcode";
import { Stamp } from "./print/Stamp";

export type SettleTx =
  | { kind: "searching" }
  | { kind: "found"; sig: string }
  /** the RPC answered and has no settle transaction for this draw */
  | { kind: "none" }
  /** the search itself failed (RPC error or rate limit): say so, never "not indexed" */
  | { kind: "error"; retry: () => void };

/** The settle_draw transaction of a settled draw, searched once per draw; null for a draw that isn't settled. */
export function useSettleTx(d: DrawView | null): SettleTx | null {
  const { findSettleTx } = useDrawSol();
  const [tx, setTx] = useState<SettleTx>({ kind: "searching" });
  const [nonce, setNonce] = useState(0);
  const key = d && d.status === "settled" ? `${d.address.toBase58()}:${d.settledAt}` : null;
  useEffect(() => {
    if (!d || !key) return;
    let alive = true;
    setTx({ kind: "searching" });
    findSettleTx(d)
      .then((s) => alive && setTx(s ? { kind: "found", sig: s } : { kind: "none" }))
      .catch(() => alive && setTx({ kind: "error", retry: () => setNonce((n) => n + 1) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, findSettleTx, nonce]);
  return key ? tx : null;
}

/** One line for the settlement transaction: its link, the search, an honest "not found" or a retry. */
export function SettleTxLine({ tx, label = "Settlement transaction" }: { tx: SettleTx | null; label?: string }) {
  if (!tx) return null;
  if (tx.kind === "found") return <ProofLink tx={tx.sig}>{label}</ProofLink>;
  if (tx.kind === "none") return <span className="c-ink-3">{label}: the RPC has none indexed for this draw.</span>;
  if (tx.kind === "error")
    return (
      <span className="c-ink-3">
        Couldn’t search for the settlement transaction.{" "}
        <button type="button" className="tbtn" onClick={tx.retry}>
          Try again
        </button>
      </span>
    );
  return (
    <>
      <Busy /> <span className="c-ink-3">Finding the settlement transaction…</span>
    </>
  );
}

/** Three punched cancellation holes: this ticket has been drawn and paid. */
export function Holes() {
  return (
    <span className="holes" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/** A past draw's ticket: DRAWN date stamp, punched holes, the winning serial and the PAID seal on its stub. */
export function SettledTicket({ d }: { d: DrawView }) {
  const prize = prizeFig(grandPrize(d));
  return (
    <div className="oldticket" role="group" aria-label={`Draw Nº ${d.id} ticket, stamped drawn and paid`}>
      <div className="ob">
        <div className="tk-head">
          <span className="t-ticket-head">
            <span className="th-brand">
              DrawSol<span className="th-sep"> · </span>
            </span>
            {kindName(d.kind)}
          </span>
          <span className="t-serial">Nº {String(d.id).padStart(4, "0")}</span>
        </div>
        <span className="dbl" aria-hidden="true" />
        <Holes />
        {/* the stamp has its own cell beside the figure, so it never touches "SOL" */}
        <div className="ob-prize">
          <p className={`t-prize ${prize.length > 3 ? "long xlong" : prize.length > 2 ? "long" : ""}`}>
            {prize}
            <span className="u">SOL</span>
          </p>
          <Stamp
            kind="drawn"
            seed={inkAt(d.randomness, 0)}
            label={`Stamped: drawn ${longDay(d.settledAt)}`}
            mid={stampDay(d.settledAt)}
            bottom={`DRAW Nº ${d.id}`}
          />
        </div>
        <p className="otext t-small">
          {d.kind === "pot" ? "The pot, paid to" : "Grand prize, paid to"} <Addr k={d.winner} />
        </p>
        <div className="tk-bar">
          <Barcode
            slots={d.nextTicket}
            taken={d.nextTicket}
            drawn={d.winningTicket}
            showKey={false}
            compact
            spread={false}
            label={`Draw Nº ${d.id}: ${d.nextTicket} tickets; ticket ${ticketNo(d.winningTicket)} was drawn.`}
          />
        </div>
      </div>
      <div className="ostub">
        <p className="t-label" style={{ fontSize: 14 }}>
          Winning ticket
        </p>
        <span className="t-serial">{ticketNo(d.winningTicket)}</span>
        <Stamp kind="paid" seed={inkAt(d.randomness, 16)} label="Stamped: paid" top={`PRIZE ${prize} SOL`} bottom="DRAWSOL" />
      </div>
    </div>
  );
}

/**
 * A cancelled draw's ticket: the CANCELLED stamp across the figure, the prize marked returned, and on its
 * stub what was refunded. Its ink is seeded from the draw account (a cancelled draw has no randomness).
 */
export function CancelledTicket({ d }: { d: DrawView }) {
  const prize = prizeFig(d.kind === "pot" ? d.potLamports : d.prizeLamports);
  const none = d.nextTicket === 0;
  const why = cancelReason(d);
  return (
    <div className="oldticket cancelled" role="group" aria-label={`Draw Nº ${d.id} ticket, stamped cancelled`}>
      <div className="ob">
        <div className="tk-head">
          <span className="t-ticket-head">
            <span className="th-brand">
              DrawSol<span className="th-sep"> · </span>
            </span>
            {kindName(d.kind)}
          </span>
          <span className="t-serial">Nº {String(d.id).padStart(4, "0")}</span>
        </div>
        <span className="dbl" aria-hidden="true" />
        <div className="ob-prize">
          <p className={`t-prize c-ink-3 ${prize.length > 3 ? "long xlong" : prize.length > 2 ? "long" : ""}`}>
            {prize}
            <span className="u">SOL</span>
          </p>
          <Stamp kind="cancelled" seed={inkAt(d.address.toBytes(), 16)} label="Stamped: cancelled" top={`DRAW Nº ${d.id}`} />
        </div>
        <p className="otext t-small">
          {none
            ? "No tickets sold, so there was nothing to draw."
            : why === "undersold"
              ? `Only ${d.paidTickets} of the ${d.minTickets} tickets it needed sold. The prize went back to the operator; every paid ticket is refunded in full.`
              : d.kind === "pot"
                ? "The randomness never arrived. Every paid ticket can be refunded, less any instant SOL it won."
                : "The randomness never arrived. The prize went back to the operator; every paid ticket is refunded in full."}
        </p>
        {!none && (
          <div className="tk-bar">
            <Barcode
              slots={d.nextTicket}
              taken={d.nextTicket}
              showKey={false}
              compact
              spread={false}
              label={`Draw Nº ${d.id}: ${d.nextTicket} tickets, none drawn.`}
            />
          </div>
        )}
      </div>
      <div className="ostub">
        <p className="t-label" style={{ fontSize: 14 }}>
          {none ? "Tickets" : "Refunded"}
        </p>
        <span className="t-serial">{none ? "0" : `${sol(d.refundedLamports, 2, 4)}`}</span>
        {!none && <p className="t-small c-ink-2">of {sol(d.revenueLamports, 2, 4)} SOL</p>}
      </div>
    </div>
  );
}
