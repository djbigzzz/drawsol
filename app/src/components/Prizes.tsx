"use client";

import { useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { endPrize, endPrizeLocked, scheduleTotals, wonNumbers } from "@/lib/derive";
import { campaignOf, usdWhole } from "@/lib/campaigns";
import { sol, utcLabel } from "@/lib/format";
import { vaultPda } from "@/lib/chain";
import type { DrawView } from "@/lib/types";
import { Addr, ProofLink, Section } from "./bits";
import { n, plural, prizeFig, prizeSol, solRound, tno, usd, usdPrize } from "./fmt";

/**
 * The prizes: the end prize (its rule stated plainly) and the instant prizes, one accordion row per tier of the
 * published schedule with its winning ticket numbers, each marked won (by whom) or not yet won.
 */
export function Prizes({ d }: { d: DrawView }) {
  const { solUsd, entries, entriesState, wallet } = useDrawSol();
  const [hideWon, setHideWon] = useState(false);
  const camp = campaignOf(d.id);
  // the counts come from the Schedule account's won bits; the entries say which wallet holds each number
  const { count, total, wonCount, wonTotal } = scheduleTotals(d);
  const won = wonNumbers(d, entries);
  const locked = endPrizeLocked(d);
  const now = endPrize(d);
  const nowUsd = usd(now, solUsd);
  const settled = d.status === "settled";
  const me = wallet?.address;
  return (
    <Section
      id="prizes"
      title="Prizes"
      lead={
        d.schedule.length ? (
          <>
            One end prize, drawn {utcLabel(d.drawAt)}, and {n(count)} instant prizes worth {usdPrize(total, solUsd) ?? `${solRound(total, 3, 2)} SOL`} with their winning ticket numbers
            published on-chain before sales opened.
          </>
        ) : (
          <>One end prize, drawn {utcLabel(d.drawAt)}.</>
        )
      }
    >
      <div className="card prize-end">
        <div className="pe-main">
          <p className="pe-eyebrow">End prize</p>
          <p className="pe-amount">{camp ? usdWhole(camp.usd) : `${prizeFig(d.endPrizeLamports)} SOL`} {camp ? "cash" : ""}</p>
          <p className="pe-rule">
            {settled ? (
              <>
                Paid as <b>{prizeFig(d.endPrizePaid)} SOL</b>
                {d.paidTickets >= d.minTickets ? ", the escrowed prize" : `, ${d.potBps / 100}% of ticket sales: fewer than ${n(d.minTickets)} tickets sold`}.
              </>
            ) : (
              <>
                <b>{camp ? usdWhole(camp.usd) : `${prizeFig(d.endPrizeLamports)} SOL`} is escrowed</b> and is paid in full once <b>{n(d.minTickets)}</b> paid tickets have sold by the draw.
                Below that, the end prize is <b>{d.potBps / 100}% of ticket sales</b> instead. The draw runs either way, with no refunds.
              </>
            )}
          </p>
        </div>
        <div className="pe-side">
          {!settled ? (
            <>
              <p className="pe-k">End prize right now</p>
              <p className="pe-now tab">
                {nowUsd ? <b>{nowUsd}</b> : <b>{sol(now, 2, 3)} SOL</b>}
                {nowUsd && <span className="sub nw">{sol(now, 2, 3)} SOL</span>}
              </p>
              <p className="pe-k2">
                {locked ? "Minimum reached: the full prize is locked in" : `Becomes ${camp ? usdWhole(camp.usd) : `${prizeFig(d.endPrizeLamports)} SOL`} at ${n(d.minTickets)} sold · ${n(d.minTickets - d.paidTickets)} to go`}
              </p>
            </>
          ) : (
            <>
              <p className="pe-k">Paid from the vault</p>
              <p className="pe-now tab">
                <b>{prizeFig(d.endPrizePaid)} SOL</b>
              </p>
            </>
          )}
          <p className="pe-link">
            <ProofLink account={vaultPda(d.address)}>Vault on Solscan</ProofLink>
          </p>
        </div>
      </div>

      {d.schedule.length > 0 && (
        <div className="instant">
          <div className="instant-head">
            <h3 className="t-h3">Instant prizes</h3>
            <p className="c-2">
              {entriesState === "ready" ? (
                <>
                  {wonCount} of {count} won so far{wonTotal > BigInt(0) ? ` (${usdPrize(wonTotal, solUsd) ?? `${prizeSol(wonTotal)} SOL`})` : ""}
                </>
              ) : (
                <>{count} prizes</>
              )}
            </p>
            <label className="toggle">
              <input type="checkbox" checked={hideWon} onChange={(e) => setHideWon(e.target.checked)} />
              <span>Hide already won prizes</span>
            </label>
          </div>
          <p className="instant-how">
            Winning numbers were published on-chain before sales opened and can’t change. Your ticket numbers are assigned at random by ORAO when you reveal,
            about 2 s after paying, so nobody can pick a known winning number. A match is paid in the reveal transaction. A number is marked won from the
            schedule account itself; the wallet beside it comes from the entry that holds it.
          </p>
          <div className="tiers">
            {d.schedule.map((tier, i) => {
              const left = tier.numbers.filter((t) => !won.has(t));
              const shown = hideWon ? left : tier.numbers;
              const amount = usdPrize(tier.lamports, solUsd);
              return (
                <details key={i} className="tier" open={i === 0}>
                  <summary>
                    <span className="tier-amt tab">{amount ? <b>{amount}</b> : <b>{prizeSol(tier.lamports)} SOL</b>}</span>
                    <span className="tier-what">
                      {amount ? <span className="sub nw">{prizeSol(tier.lamports)} SOL</span> : null}
                      <span className="tier-count">
                        {left.length} of {tier.numbers.length} still to be won
                      </span>
                    </span>
                    <span className="tier-bar" aria-hidden="true">
                      <span style={{ width: `${tier.numbers.length ? ((tier.numbers.length - left.length) / tier.numbers.length) * 100 : 0}%` }} />
                    </span>
                  </summary>
                  {shown.length === 0 ? (
                    <p className="tier-empty c-3">Every prize in this tier has been won.</p>
                  ) : (
                    <ul className="chips-grid" aria-label={`Winning numbers worth ${amount ?? `${prizeSol(tier.lamports)} SOL`}`}>
                      {shown.map((t) => {
                        const gone = won.has(t);
                        const by = won.get(t) ?? null;
                        const mine = !!by && !!me && by.owner.equals(me);
                        return (
                          <li key={t} className={`tchip ${gone ? "won" : ""} ${mine ? "mine" : ""}`}>
                            <b className="tab">{tno(t)}</b>
                            <span>
                              {by ? (
                                <>
                                  Won by {mine ? "you" : <Addr k={by.owner} head={4} tail={4} />}
                                </>
                              ) : gone ? (
                                "Won"
                              ) : (
                                "Not yet won"
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </details>
              );
            })}
          </div>
          <p className="helper">
            {count} {plural(count, "prize", "prizes")} in all. A number is marked won once a reveal has handed it to a wallet; numbers still in the unsold pool stay in play until sales close.
          </p>
        </div>
      )}
    </Section>
  );
}
