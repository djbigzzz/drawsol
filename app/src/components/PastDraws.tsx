"use client";

import { useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { Addr, SectionHead, Verify } from "./bits";
import { SplitFlap } from "./SplitFlap";
import { WinnerCard } from "./WinnerCard";
import { shortDate, sol, ticketNo } from "@/lib/format";

export function PastDraws() {
  const { draws, current } = useDrawSol();
  const past = draws.filter(
    (d) => (d.status === "settled" || d.status === "cancelled") && !(current && d.address.equals(current.address))
  );
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section aria-labelledby="past-h">
      <SectionHead idx="04" title="Past draws" id="past" />
      {past.length === 0 ? (
        <div className="border border-dashed border-line px-6 py-8 text-[15px] text-dim">
          No finished draws yet. When one settles, its winning ticket, winner and randomness stay here — with a button to
          recompute the result yourself.
        </div>
      ) : (
        <div className="border-t border-line">
          {past.map((d) => {
            const k = d.address.toBase58();
            const isOpen = open === k;
            return (
              <div key={k} className="border-b border-line">
                <div className="grid grid-cols-[1fr_auto] items-center gap-4 py-4 md:grid-cols-[140px_auto_1fr_auto]">
                  <div>
                    <div className="display text-[22px] leading-[24px] tracking-[0.04em]">Draw Nº {d.id.toString().padStart(4, "0")}</div>
                    <div className="eyebrow mt-1">{d.status === "settled" ? `settled ${shortDate(d.settledAt)}` : "cancelled"}</div>
                  </div>
                  <div className="hidden md:block">
                    {d.status === "settled" ? (
                      <SplitFlap value={ticketNo(d.winningTicket)} size={24} color="var(--brass)" label={`Winning ticket ${ticketNo(d.winningTicket)}`} gap={2} />
                    ) : (
                      <span className="mono text-[13px] text-dim">no winner</span>
                    )}
                  </div>
                  <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] md:col-span-1 md:row-start-auto">
                    {d.status === "settled" ? (
                      <>
                        <span className="md:hidden">
                          <span className="mono text-brass">{ticketNo(d.winningTicket)}</span>
                        </span>
                        <span>
                          <span className="text-dim">Winner </span>
                          <Addr k={d.winner} />
                        </span>
                        <span>
                          <span className="text-dim">Prize </span>
                          <span className="mono text-brass">{sol(d.prizeLamports, 2, 4)} SOL</span>
                        </span>
                      </>
                    ) : (
                      <span className="text-dim">
                        {d.nextTicket === 0 ? "No tickets sold; prize returned." : `Refunded ${sol(d.refundedLamports, 2, 4)} of ${sol(d.proceedsLamports, 2, 4)} SOL`}
                      </span>
                    )}
                    <Verify account={d.address} />
                  </div>
                  {d.status === "settled" && (
                    <button className="btn small ghost col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                      {isOpen ? "Hide proof" : "Proof"}
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="pb-6">
                    <WinnerCard d={d} compact />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
