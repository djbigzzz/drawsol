"use client";

import { useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { entryWins } from "@/lib/derive";
import { clock, short, shortDate, sol, ticketNo, ticketRange } from "@/lib/format";
import { solscanAccount } from "@/lib/config";
import { SectionGrid } from "./bits";
import { plural } from "./fmt";

const PAGE = 12;

/** Every Entry account of this draw, as a ruled ledger. Each row links to its account. */
export function EntriesBoard() {
  const { entries, entriesState, current: d, now, wallet, refresh } = useDrawSol();
  const [all, setAll] = useState(false);
  if (!d) return null;
  const rows = all ? entries : entries.slice(0, PAGE);
  const sameDay = (t: number) => now - t < 86400;
  const me = wallet?.address;

  return (
    <SectionGrid
      id="entries"
      title="Every entry"
      sub={
        <>
          Each row is an Entry account on devnet.
          {entriesState === "ready" && entries.length > 0 && (
            <>
              {" "}
              {d.entryCount} {plural(d.entryCount, "entry", "entries")}, {d.nextTicket} {plural(d.nextTicket, "ticket", "tickets")}.
            </>
          )}
        </>
      }
    >
      <div className="eledger">
        {!(entriesState === "ready" && entries.length === 0) && (
          <div className="erow head" aria-hidden="true">
            <span>Time (UTC)</span>
            <span>Wallet</span>
            <span className="tix">Tickets</span>
            <span className="r">Instant result</span>
          </div>
        )}
        {entriesState === "loading" && entries.length === 0 ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="erow c-ink-3" aria-hidden="true">
              <span>…</span>
              <span>…</span>
              <span className="tix">…</span>
              <span className="r">…</span>
            </div>
          ))
        ) : entriesState === "error" ? (
          <p className="t-body" style={{ padding: "16px 0" }}>
            Can’t load entries from devnet right now.{" "}
            <button type="button" className="tbtn" onClick={refresh}>
              Try again
            </button>
          </p>
        ) : entries.length === 0 ? (
          <p className="t-body c-ink-2" style={{ padding: "16px 0" }}>
            No tickets yet. The first entry gets ticket {ticketNo(0)}.
          </p>
        ) : (
          <div role="list">
            {rows.map((e) => {
              const wins = entryWins(e);
              const mine = !!me && e.owner.equals(me);
              const result = e.isFree ? "free entry" : !e.revealed ? "sealed" : wins > 0 ? `+${sol(e.instantPaid, 2, 3)} SOL` : "no win";
              return (
                <a
                  role="listitem"
                  key={e.address.toBase58()}
                  href={solscanAccount(e.address.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="erow"
                  aria-label={`${short(e.owner.toBase58())}${mine ? " (you)" : ""}, ${ticketRange(e.firstTicket, e.count)}, ${result}. Entry account on Solscan.`}
                >
                  <span className="t">{sameDay(e.createdAt) ? clock(e.createdAt) : shortDate(e.createdAt)}</span>
                  <span className="nw" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {short(e.owner.toBase58())}
                    {mine && <span className="you">you</span>}
                    <span className="x x-m">×{e.count}</span>
                  </span>
                  <span className="tix nw">
                    {ticketRange(e.firstTicket, e.count)} <span className="x">×{e.count}</span>
                  </span>
                  <span className="r">
                    {e.isFree ? <i className="free">free entry</i> : !e.revealed ? <i>sealed</i> : wins > 0 ? <span className="w">+{sol(e.instantPaid, 2, 3)} SOL</span> : <i>no win</i>}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
      {entries.length > PAGE && (
        <p className="emore">
          <button type="button" className="tbtn" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? `Show the latest ${PAGE}` : `Show all ${entries.length} entries`}
          </button>
        </p>
      )}
    </SectionGrid>
  );
}
