"use client";

import { useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { SectionHead } from "./bits";
import { clock, shortDate, short, sol, ticketNo, ticketRange } from "@/lib/format";
import { solscanAccount } from "@/lib/config";
import { entryWins } from "@/lib/derive";

const PAGE = 12;

/** Departures-board list of real Entry accounts. */
export function EntriesBoard() {
  const { entries, entriesState, current: d, now } = useDrawSol();
  const [all, setAll] = useState(false);
  if (!d) return null;
  const rows = all ? entries : entries.slice(0, PAGE);
  const sameDay = (t: number) => now - t < 86400;

  return (
    <section aria-labelledby="entries-h">
      <SectionHead idx="03" title="Entries" id="entries" aside={entriesState === "ready" ? `${d.entryCount} entries · ${d.nextTicket} tickets` : undefined} />
      <div className="border border-line bg-board">
        <div className="dep-row dep-head grid-cols-[56px_1fr_auto] sm:grid-cols-[88px_1fr_1.2fr_1fr]">
          <span>Time</span>
          <span>Wallet</span>
          <span className="hidden sm:block">Tickets</span>
          <span className="text-right">Instant</span>
        </div>
        {entriesState === "loading" && entries.length === 0 ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="dep-row grid-cols-[56px_1fr_auto] sm:grid-cols-[88px_1fr_1.2fr_1fr]" aria-hidden>
              <span className="skel h-3 w-10" />
              <span className="skel h-3 w-24" />
              <span className="skel hidden h-3 w-28 sm:block" />
              <span className="skel ml-auto h-3 w-12" />
            </div>
          ))
        ) : entriesState === "error" ? (
          <div className="px-4 py-8 text-[14px] text-dim">Can&apos;t load entries from devnet right now.</div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="display text-[28px] leading-[28px]">No tickets yet</div>
            <div className="mt-2 text-[14px] text-dim">The first entry gets ticket {ticketNo(0)}.</div>
          </div>
        ) : (
          rows.map((e) => {
            const wins = entryWins(e);
            return (
              <a
                key={e.address.toBase58()}
                href={solscanAccount(e.address.toBase58())}
                target="_blank"
                rel="noopener noreferrer"
                className="dep-row grid-cols-[56px_1fr_auto] hover:bg-panel sm:grid-cols-[88px_1fr_1.2fr_1fr]"
              >
                <span className="text-dim">{sameDay(e.createdAt) ? clock(e.createdAt) : shortDate(e.createdAt)}</span>
                <span className="min-w-0 truncate">
                  {short(e.owner.toBase58())}
                  <span className="ml-2 text-dim sm:hidden">×{e.count}</span>
                </span>
                <span className="hidden sm:block">
                  {ticketRange(e.firstTicket, e.count)} <span className="text-dim">×{e.count}</span>
                </span>
                <span className="text-right">
                  {e.isFree ? (
                    <span className="text-dim">free</span>
                  ) : !e.revealed ? (
                    <span className="text-dim">sealed</span>
                  ) : wins > 0 ? (
                    <span className="text-brass">+{sol(e.instantPaid, 2, 3)}</span>
                  ) : (
                    <span className="text-dim">—</span>
                  )}
                </span>
              </a>
            );
          })
        )}
        {entries.length > PAGE && (
          <button className="w-full px-4 py-3 text-left text-[13px] text-dim hover:text-cream" onClick={() => setAll((a) => !a)}>
            {all ? "Show latest only" : `Show all ${entries.length} entries`}
          </button>
        )}
      </div>
      <p className="mt-3 text-[12px] leading-[18px] text-dim">Times in UTC. Every row is an Entry account read from devnet — click one to inspect it.</p>
    </section>
  );
}
