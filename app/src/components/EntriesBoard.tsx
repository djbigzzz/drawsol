"use client";

import Link from "next/link";
import { useDrawSol } from "@/hooks/context";
import { SectionGrid } from "./bits";
import { EntryLedger } from "./EntryLedger";
import { plural } from "./fmt";

/** Every Entry account of this draw, as a ruled ledger, with search and a CSV. Each row links to its account. */
export function EntriesBoard() {
  const { entries, entriesState, current: d, wallet, refresh } = useDrawSol();
  if (!d) return null;

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
      aside={
        <p className="sec-link">
          <Link className="tbtn" href={`/draw/?n=${d.id}`}>
            Draw Nº {d.id}’s permanent page
          </Link>
        </p>
      }
    >
      <EntryLedger d={d} entries={entries} state={entriesState} onRetry={refresh} me={wallet?.address} />
    </SectionGrid>
  );
}
