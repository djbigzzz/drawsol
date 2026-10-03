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
  full = false,
}: {
  d: DrawView;
  entries: EntryView[];
  state: "loading" | "error" | "ready";
  selling: boolean;
  /** the draw page: also the expected-count note and the reserve's 7-day rule (the lede keeps one sentence) */
  full?: boolean;
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
  // a finished draw with every paid ticket revealed: the count is final, not "so far"
  const allIn = (d.status === "settled" || d.status === "cancelled") && (d.revealedEntries >= d.paidEntries || (ready && sealedTickets === 0));
  const smallest = tiers.reduce((m, t) => (t.amount < m ? t.amount : m), tiers[0].amount);
  // nothing revealed yet: a dash, as for any figure that isn't known (never "0 / 0.0")
  const wonCell = (won: number, odds: number) =>
    ready && revealedTickets === 0 ? (
      <span className="c-ink-3">—</span>
    ) : ready ? (
      <>
        {won}
        <span className="exp"> / {one(expected(odds))}</span>
      </>
    ) : (
      <span className="c-ink-3">{state === "error" ? "—" : "…"}</span>
    );
  // stated only when literally true (research P0-5)
  const smallestLine =
    smallest === d.ticketPrice ? (
      <> The smallest instant win is your ticket price back.</>
    ) : smallest > d.ticketPrice ? (
      <>
        {" "}
        The smallest instant win, <span className="nw">{sol(smallest, 2, 4)} SOL</span>, is more than your ticket price.
      </>
    ) : null;

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
              <span aria-hidden="true">won / exp.</span>
              <span className="sr-only">won so far / expected</span>
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
          <dd>{d.reserveWithdrawn ? "withdrawn" : <>{sol(left, 2, 4)} of {sol(d.iwReserveLamports, 2, 4)} SOL</>}</dd>
        </div>
      </dl>
      <div className="odds-notes t-small">
        <p>
          {selling ? <>Decided by ORAO randomness about <span className="nw">2 s</span> after you pay, and paid from the reserve in the reveal transaction. </> : null}
          If the reserve runs out, wins are paid up to what’s left.{smallestLine}
        </p>
        {full && ready && (
          <p>
            {revealedTickets === 0 ? (
              <>No ticket has been revealed yet, so nothing has been won or expected so far.</>
            ) : (
              <>
                Exp. (expected) is what the odds predict for the {revealedTickets} {plural(revealedTickets, "ticket", "tickets")} revealed{allIn ? "" : " so far"}
                {sealedTickets > 0 ? `; ${sealedTickets} ${plural(sealedTickets, "is", "are")} still sealed` : ""}.
              </>
            )}
          </p>
        )}
        {full && <ReserveRule d={d} sealed={ready ? sealedTickets : null} />}
      </div>
    </div>
  );
}

/**
 * What happens to the reserve nobody wins: the 7-day withdrawal rule, or, once withdrawn, what it meant.
 * `sealed` is the count of paid tickets still unrevealed when known (null while entries load).
 */
export function ReserveRule({ d, sealed }: { d: DrawView; sealed: number | null }) {
  if (d.reserveWithdrawn) {
    const allRevealed = d.revealedEntries >= d.paidEntries;
    return (
      <p>
        The operator has withdrawn the reserve nobody won.{" "}
        {allRevealed
          ? "Every ticket was revealed before the reserve was withdrawn."
          : sealed !== null && sealed > 0
            ? `${sealed} ${plural(sealed, "ticket was", "tickets were")} still sealed and can no longer be revealed or paid.`
            : "Tickets still sealed can no longer be revealed or paid."}
      </p>
    );
  }
  return (
    <p>
      Reserve nobody wins goes back to the operator, who can withdraw it 7 days after close (<span className="nw">{utcLabel(reserveUnlockAt(d))}</span>), even if
      some tickets are still unrevealed. After that, unrevealed tickets can’t be paid, so reveal before then.
    </p>
  );
}
