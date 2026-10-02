"use client";

import { activeTiers, entryWins, instantNumer } from "@/lib/derive";
import { oneIn, sol, utcLabel } from "@/lib/format";
import { RESERVE_UNLOCK_SECS } from "@/lib/config";
import type { DrawView, EntryView } from "@/lib/types";
import { plural } from "./fmt";

/** When the operator may withdraw the unwon reserve, even with tickets still sealed (program RESERVE_UNLOCK_SECS). */
export const reserveUnlockAt = (d: DrawView) => d.closesAt + RESERVE_UNLOCK_SECS;

const one = (x: number) => x.toFixed(1);

/**
 * The honest instant-win table (research P0-5): per tier the amount, the odds, and wins so far against
 * what the odds predict for the tickets revealed so far; the reserve left; the reserve rule; and what
 * happens to the reserve nobody wins. Every figure is the draw account's or a count over its Entry accounts.
 */
export function InstantTable({
  d,
  entries,
  state,
  selling,
}: {
  d: DrawView;
  entries: EntryView[];
  state: "loading" | "error" | "ready";
  selling: boolean;
}) {
  const tiers = activeTiers(d);
  if (tiers.length === 0) return null;
  const ready = state === "ready";
  const revealed = entries.filter((e) => !e.isFree && e.revealed);
  const revealedTickets = revealed.reduce((n, e) => n + e.count, 0);
  const sealedTickets = entries.filter((e) => !e.isFree && !e.revealed).reduce((n, e) => n + e.count, 0);
  const wonAt = (k: number) => revealed.reduce((n, e) => n + e.tiers.filter((t) => t === k).length, 0);
  const anyWon = revealed.reduce((n, e) => n + entryWins(e), 0);
  const expected = (odds: number) => (revealedTickets * odds) / d.iwDenominator;
  const left = d.iwReserveLamports > d.iwPaidLamports ? d.iwReserveLamports - d.iwPaidLamports : BigInt(0);
  const smallest = tiers.reduce((m, t) => (t.amount < m ? t.amount : m), tiers[0].amount);
  const unlock = reserveUnlockAt(d);
  const wonCell = (won: number, odds: number) =>
    ready ? (
      <>
        {won}
        <span className="exp"> / {one(expected(odds))}</span>
      </>
    ) : (
      <span className="c-ink-3">{state === "error" ? "—" : "…"}</span>
    );

  return (
    <div className="odds">
      <p className="odds-head">
        <b>Instant wins</b>
        <i>demo odds, boosted</i>
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Prize</th>
            <th scope="col">Odds</th>
            <th scope="col">
              Won <span className="exp">/ expected</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.index}>
              <td className="nw">{sol(t.amount, 2, 4)} SOL</td>
              <td className="nw">{oneIn(t.odds, d.iwDenominator)}</td>
              <td className="nw">{wonCell(wonAt(t.index + 1), t.odds)}</td>
            </tr>
          ))}
          <tr className="sum">
            <td>Any win</td>
            <td className="nw">{oneIn(instantNumer(d), d.iwDenominator)} tickets</td>
            <td className="nw">{wonCell(anyWon, instantNumer(d))}</td>
          </tr>
        </tbody>
      </table>
      <dl className="ledger odds-reserve">
        <div>
          <dt>Reserve left</dt>
          <dd>{d.reserveWithdrawn ? "withdrawn" : <>{sol(left, 2, 4)} of {sol(d.iwReserveLamports, 0, 4)} SOL</>}</dd>
        </div>
      </dl>
      <div className="odds-notes t-small">
        {ready && (
          <p>
            Expected is what the odds predict for the {revealedTickets} {plural(revealedTickets, "ticket", "tickets")} revealed so far
            {sealedTickets > 0 ? `; ${sealedTickets} ${plural(sealedTickets, "is", "are")} still sealed` : ""}.
          </p>
        )}
        <p>
          {selling ? <>Decided by ORAO randomness about <span className="nw">2 s</span> after you pay, and paid from the reserve in the reveal transaction. </> : null}
          If the reserve runs out, wins are paid up to what’s left.
          {smallest >= d.ticketPrice ? " The smallest instant win is your ticket price back." : ""}
        </p>
        {d.reserveWithdrawn ? (
          <p>The operator has withdrawn the reserve nobody won, so tickets still sealed can no longer be revealed or paid.</p>
        ) : (
          <p>
            Reserve nobody wins goes back to the operator, who can withdraw it 7 days after close (<span className="nw">{utcLabel(unlock)}</span>), even if some tickets
            are still unrevealed. After that, unrevealed tickets can’t be paid, so reveal before then.
          </p>
        )}
      </div>
    </div>
  );
}
