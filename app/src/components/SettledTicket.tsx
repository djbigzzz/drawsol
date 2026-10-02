"use client";

import { useEffect, useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { sol, ticketNo } from "@/lib/format";
import { inkAt } from "@/lib/print";
import type { DrawView } from "@/lib/types";
import { Addr } from "./bits";
import { stampDay, longDay } from "./fmt";
import { Barcode } from "./print/Barcode";
import { Stamp } from "./print/Stamp";

/** The settle_draw transaction of a settled draw: undefined while searching, null when not indexed. */
export function useSettleTx(d: DrawView | null) {
  const { findSettleTx } = useDrawSol();
  const [tx, setTx] = useState<string | null | undefined>(undefined);
  const key = d && d.status === "settled" ? `${d.address.toBase58()}:${d.settledAt}` : null;
  useEffect(() => {
    if (!d || !key) return;
    let alive = true;
    setTx(undefined);
    findSettleTx(d)
      .then((s) => alive && setTx(s))
      .catch(() => alive && setTx(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, findSettleTx]);
  return tx;
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
  const prize = sol(d.prizeLamports, 0, 4);
  return (
    <div className="oldticket" role="group" aria-label={`Draw Nº ${d.id} ticket, stamped drawn and paid`}>
      <div className="ob">
        <div className="tk-head">
          <span className="t-ticket-head">
            <span className="th-brand">
              DrawSol<span className="th-sep"> · </span>
            </span>
            grand draw
          </span>
          <span className="t-serial">Nº {String(d.id).padStart(4, "0")}</span>
        </div>
        <span className="dbl" aria-hidden="true" />
        <Holes />
        {/* the stamp has its own cell beside the figure, so it never touches "SOL" */}
        <div className="ob-prize">
          <p className="t-prize">
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
          Grand prize, paid to <Addr k={d.winner} />
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
