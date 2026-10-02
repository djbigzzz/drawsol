"use client";

import { useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { shortDate, sol, ticketNo } from "@/lib/format";
import type { DrawView } from "@/lib/types";
import { Addr, ProofLink, SectionGrid } from "./bits";
import { CarbonSlip } from "./print/CarbonSlip";
import { SettledTicket, SettleTxLine, useSettleTx } from "./SettledTicket";
import { plural } from "./fmt";
import Link from "next/link";

export function PastDraws() {
  const { draws, current } = useDrawSol();
  const past = draws
    .filter((d) => (d.status === "settled" || d.status === "cancelled") && !(current && d.address.equals(current.address)))
    .sort((a, b) => b.id - a.id);
  const lead = past.find((d) => d.status === "settled") ?? null;
  const older = past.filter((d) => d !== lead);
  const [open, setOpen] = useState<string | null>(null);

  if (past.length === 0)
    return (
      <SectionGrid id="past" title="Past draws">
        <p className="t-body c-ink-2">No finished draws yet. When one settles, its ticket, winner and randomness stay here, with the arithmetic to check it.</p>
      </SectionGrid>
    );

  return (
    <SectionGrid
      id="past"
      title="Past draws"
      sub={lead ? <>Draw Nº {lead.id} is settled. Here is its ticket, and the arithmetic to check it.</> : <>No past draw has been settled yet.</>}
      aside={lead ? <LeadLedger d={lead} /> : undefined}
    >
      {lead && <Pair d={lead} />}
      {older.length > 0 && (
        <div className="older">
          {older.map((d) => {
            const k = d.address.toBase58();
            const isOpen = open === k;
            return (
              <div key={k}>
                <div className="older-row">
                  <b>
                    <Link className="rowlink" href={`/draw/?n=${d.id}`}>
                      Draw Nº {d.id}
                    </Link>
                  </b>
                  <span className="d nw">
                    {d.status === "settled" ? `settled ${shortDate(d.settledAt)}` : `closed ${shortDate(d.closesAt)}`}
                  </span>
                  <span className="d">
                    {d.status === "settled" ? (
                      <>
                        Ticket <span className="c-red nw">{ticketNo(d.winningTicket)}</span> won {sol(d.prizeLamports, 0, 4)} SOL.
                      </>
                    ) : d.nextTicket === 0 ? (
                      "No tickets sold; the prize went back to the operator."
                    ) : (
                      `Refunded ${sol(d.refundedLamports, 2, 4)} of ${sol(d.proceedsLamports, 2, 4)} SOL.`
                    )}
                  </span>
                  {d.status === "settled" ? (
                    <button type="button" className="tbtn" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                      {isOpen ? "Hide its ticket" : "Show its ticket"}
                    </button>
                  ) : (
                    <ProofLink account={d.address}>Draw account</ProofLink>
                  )}
                </div>
                {isOpen && (
                  <div className="older-open">
                    <Pair d={d} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionGrid>
  );
}

function Pair({ d }: { d: DrawView }) {
  return (
    <div className="past">
      <SettledTicket d={d} />
      <CarbonSlip d={d} tilt id={`recompute-${d.id}`} />
    </div>
  );
}

function LeadLedger({ d }: { d: DrawView }) {
  const tx = useSettleTx(d);
  return (
    <>
      <dl className="ledger big">
        <div>
          <dt>Settled</dt>
          <dd>{shortDate(d.settledAt)}</dd>
        </div>
        <div>
          <dt>Winning ticket</dt>
          <dd className="c-red">{ticketNo(d.winningTicket)}</dd>
        </div>
        <div>
          <dt>Winner</dt>
          <dd style={{ fontSize: 20 }}>
            <Addr k={d.winner} link />
          </dd>
        </div>
        <div>
          <dt>Prize</dt>
          <dd>{sol(d.prizeLamports, 0, 4)} SOL, paid</dd>
        </div>
      </dl>
      <p className="ledger-link t-small">
        <SettleTxLine tx={tx} />
      </p>
      <p className="sec-link">
        <Link className="tbtn" href={`/draw/?n=${d.id}`}>
          Draw Nº {d.id}’s record and all {d.nextTicket} {plural(d.nextTicket, "ticket", "tickets")}
        </Link>
      </p>
    </>
  );
}
