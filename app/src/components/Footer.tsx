"use client";

import Link from "next/link";
import { useDrawSol } from "@/hooks/context";
import { PROGRAM_ID, SOURCE_URL, solscanAccount } from "@/lib/config";
import { short } from "@/lib/format";
import { headlineHouseBps, pct } from "@/lib/derive";
import { Mark } from "./print/Mark";

/** A colophon, not a billboard. */
export function Footer({ away = false }: { away?: boolean }) {
  const { load, current: d } = useDrawSol();
  const id = PROGRAM_ID.toBase58();
  // the house share, stated as plainly as the prize: every draw carries its own, set in its account
  const house =
    d && d.kind === "pot"
      ? `On Pot draw Nº ${d.id} the house keeps ${pct(d.houseBps)} of every paid ticket; ${pct(10_000 - d.houseBps)} goes back to players.`
      : d && d.kind === "headline"
        ? `On Headline draw Nº ${d.id} the house keeps what sales bring in beyond the prize: ${pct(headlineHouseBps(d, d.ticketCap) ?? 0)} at sell-out.`
        : null;
  return (
    <footer className="page">
      <div className="foot">
        <div className="foot-brand">
          <Mark />
          <b>DrawSol</b>
        </div>
        <p className="t-small">
          A prize draw with a free entry route, on Solana, built for the Colosseum hackathon. Devnet demo · play money. DrawSol is run for a house share, set in
          each draw’s account and enforced by the program: 50–60% of a pot draw’s ticket money, and at least that at a headline draw’s sell-out. {house} Every number on this page is read from Solana devnet; when it
          can’t be read, it isn’t shown.
        </p>
        <ul>
          <li>
            <a className="nav-link" href={solscanAccount(id)} target="_blank" rel="noopener noreferrer" title={id}>
              Program {short(id)}
              <span className="sr-only"> (opens Solscan)</span>
            </a>
          </li>
          <li>
            <a className="nav-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              Source on GitHub
            </a>
          </li>
          {/* the back of the ticket (#rules) is only printed once a draw has loaded, as in the header nav */}
          {load.kind === "ready" && (
            <li>
              {away ? (
                <Link className="nav-link" href="/#rules">
                  How it works
                </Link>
              ) : (
                <a className="nav-link" href="#rules">
                  How it works
                </a>
              )}
            </li>
          )}
        </ul>
      </div>
    </footer>
  );
}
