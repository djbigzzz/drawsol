"use client";

import Link from "next/link";
import { useDrawSol } from "@/hooks/context";
import { useState } from "react";
import { cancelReason, grandPrize, scheduleWinsOf } from "@/lib/derive";
import { clock, shortDate, sol, utcLabel } from "@/lib/format";
import type { DrawView } from "@/lib/types";
import { Addr, Pill, ProofLink, Section } from "./bits";
import { kindName, n, plural, prizeFig, prizeSol, solRound, tnoOf, usdPrize } from "./fmt";

const PAGE = 8;
import { useSettleTx } from "./Recompute";

/**
 * Winners and past draws, read from the Draw accounts on devnet: every settled draw with its winning ticket,
 * wallet and payout, then the cancelled ones. Nothing is listed that isn't an account on chain.
 */
export function Winners() {
  const { draws, legacyDraws, current, wallet, allEntries, allEntriesState, now, solUsd } = useDrawSol();
  const [all, setAll] = useState(false);
  const byAddr = new Map([...draws, ...legacyDraws].map((d) => [d.address.toBase58(), d]));
  // instant winners: every revealed entry that was paid, from the Entry accounts (never a list we keep)
  const instant = allEntriesState === "ready" ? allEntries.filter((e) => e.revealed && e.instantPaid > BigInt(0) && byAddr.has(e.draw.toBase58())).sort((a, b) => b.createdAt - a.createdAt) : [];
  const instantPaid = instant.reduce((s, e) => s + e.instantPaid, BigInt(0));
  const rows = all ? instant : instant.slice(0, PAGE);
  const past = [...draws, ...legacyDraws]
    .filter((d) => (d.status === "settled" || d.status === "cancelled") && !(current && d.address.equals(current.address)))
    .sort((a, b) => (b.settledAt || b.drawAt) - (a.settledAt || a.drawAt) || b.id - a.id);
  const settled = past.filter((d) => d.status === "settled");
  const cancelled = past.filter((d) => d.status === "cancelled");
  const paid = settled.reduce((s, d) => s + d.endPrizePaid, BigInt(0));
  return (
    <Section
      id="winners"
      title="Winners"
      lead={
        allEntriesState !== "ready" ? (
          <>
            {settled.length} {settled.length === 1 ? "end prize" : "end prizes"} paid on devnet so far{settled.length ? `, ${sol(paid, 2, 4)} SOL` : ""}; the instant wins are{" "}
            {allEntriesState === "error" ? "not readable right now" : "still being read"}. Every row is read from a Draw or Entry account.
          </>
        ) : settled.length || instant.length ? (
          <>
            {settled.length} {settled.length === 1 ? "end prize" : "end prizes"} and {instant.length} instant {plural(instant.length, "win", "wins")} paid on devnet so far,{" "}
            {solRound(paid + instantPaid, 4, 2)} SOL in all. Every row is read from a Draw or Entry account.
          </>
        ) : (
          <>Every instant win and settled draw is listed here with the wallet that won and the payout. There isn’t one yet.</>
        )
      }
    >
      {instant.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3 className="t-h4">Instant wins</h3>
            <span className="c-2">{usdPrize(instantPaid, solUsd) ?? `${prizeSol(instantPaid)} SOL`} paid</span>
          </div>
          <ul className="rows" aria-label="Instant winners">
            {rows.map((e) => {
              const d = byAddr.get(e.draw.toBase58())!;
              const wins = scheduleWinsOf(e, d);
              const mine = !!wallet && e.owner.equals(wallet.address);
              return (
                <li key={e.address.toBase58()} className="row">
                  <div className="row-main">
                    <b>
                      <Addr k={e.owner} />
                      {mine && <span className="you">you</span>}
                    </b>
                    <span className="row-what">
                      {now - e.createdAt < 86400 ? `${clock(e.createdAt)} UTC` : shortDate(e.createdAt)} · Draw № {d.id}
                      {wins.length ? <> · {wins.map((w) => tnoOf(d, w.ticket)).join(", ")}</> : <> · {e.count} {plural(e.count, "ticket", "tickets")}</>}
                    </span>
                  </div>
                  <div className="row-side">
                    <span className="pill pill-win">Won {usdPrize(e.instantPaid, solUsd) ?? `${prizeSol(e.instantPaid)} SOL`}</span>
                    <ProofLink account={e.address} className="row-proof">
                      Entry
                    </ProofLink>
                  </div>
                </li>
              );
            })}
          </ul>
          {instant.length > PAGE && (
            <p className="emore">
              <button type="button" className="tbtn" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                {all ? `Show the latest ${PAGE}` : `Show all ${instant.length} wins`}
              </button>
            </p>
          )}
        </div>
      )}
      {settled.length === 0 ? (
        <div className="card pad">
          <p className="panel-text">
            No end prize has been drawn yet. {current ? `Draw № ${current.id} draws ${utcLabel(current.drawAt)}; its winner will appear here with the payout transaction.` : ""}
          </p>
        </div>
      ) : (
        <ul className="winners">
          {settled.map((d) => (
            <WinnerCard key={d.address.toBase58()} d={d} mine={!!wallet && d.winner.equals(wallet.address)} />
          ))}
        </ul>
      )}
      {cancelled.length > 0 && (
        <ul className="past-list" aria-label="Cancelled draws">
          {cancelled.map((d) => (
            <li key={d.address.toBase58()}>
              <Link className="tbtn" href={`/draw/?n=${d.id}`}>
                Draw № {d.id}
              </Link>{" "}
              <span className="c-2">
                {kindName(d)} · cancelled{d.nextPos === 0 ? ", no tickets sold" : cancelReason(d) === "undersold" ? `, ${n(d.paidTickets)} of ${n(d.minTickets)} sold` : ""} · refunded{" "}
                {sol(d.refundedLamports, 2, 4)} of {sol(d.revenueLamports, 2, 4)} SOL
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function WinnerCard({ d, mine }: { d: DrawView; mine: boolean }) {
  const tx = useSettleTx(d);
  return (
    <li className="card winner-card">
      <div className="wc-head">
        <Pill tone="dark">Draw № {d.id}</Pill>
        <span className="c-2">
          {kindName(d)} · settled {utcLabel(d.settledAt)}
        </span>
      </div>
      <p className="wc-ticket tab">
        <span className="wc-eyebrow">Winning ticket</span>
        {tnoOf(d, d.winningTicket)}
      </p>
      <dl className="wc-facts">
        <div>
          <dt>Winner</dt>
          <dd>
            <Addr k={d.winner} link head={6} tail={6} />
            {mine && <span className="you">you</span>}
          </dd>
        </div>
        <div>
          <dt>Prize paid</dt>
          <dd>
            <b className="nw">{prizeFig(grandPrize(d))} SOL</b>
          </dd>
        </div>
        <div>
          <dt>Tickets in the draw</dt>
          <dd className="tab">{n(d.nextPos)}</dd>
        </div>
      </dl>
      <p className="wc-links">
        {tx?.kind === "found" ? (
          <ProofLink tx={tx.sig}>Payout transaction</ProofLink>
        ) : tx?.kind === "none" ? (
          <ProofLink account={d.winningEntry}>Winning entry</ProofLink>
        ) : tx?.kind === "error" ? (
          <span className="c-3">
            Couldn’t find the payout transaction.{" "}
            <button type="button" className="tbtn" onClick={tx.retry}>
              Try again
            </button>
          </span>
        ) : (
          <span className="c-3">Finding the payout transaction…</span>
        )}
        <Link className="tbtn" href={`/draw/?n=${d.id}`}>
          Full record and every entry
        </Link>
      </p>
    </li>
  );
}
