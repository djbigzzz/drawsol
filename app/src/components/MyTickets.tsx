"use client";

import { useState, type ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { grandPrize, scheduleWinsOf, ticketNumbersOf } from "@/lib/derive";
import { clock, shortDate, sol, ticketNo, ticketRange } from "@/lib/format";
import type { DrawView, EntryView } from "@/lib/types";
import { Addr, Busy, ErrorNote, ProofLink, Section, inFlight, phaseLabel } from "./bits";
import { refundOf } from "./EntryPanel";
import { n, plural, prizeFig, tno, usd, usdPrize } from "./fmt";

/** This wallet's entries in the featured draw: one row per purchase, with the refund button when cancelled. */
export function MyTickets() {
  const { wallet, myEntries, myState, player, current: d, refresh } = useDrawSol();
  const { setVisible } = useWalletModal();
  if (!d) return null;

  if (!wallet)
    return (
      <Section id="my-tickets" title="Your tickets">
        <div className="card pad">
          <p className="panel-text">Connect a wallet to see your tickets in this draw, and any refund.</p>
          <button type="button" className="btn btn-outline" onClick={() => setVisible(true)}>
            Connect wallet
          </button>
        </div>
      </Section>
    );

  if (myState !== "ready")
    return (
      <Section id="my-tickets" title="Your tickets">
        <div className="card pad">
          {myState === "error" ? (
            <p className="panel-text">
              Can’t load the tickets of <Addr k={wallet.address} /> from devnet right now.{" "}
              <button type="button" className="tbtn" onClick={refresh}>
                Try again
              </button>
            </p>
          ) : (
            <p className="panel-text" aria-busy="true">
              <Busy /> Reading the tickets of <Addr k={wallet.address} /> from devnet…
            </p>
          )}
        </div>
      </Section>
    );

  if (myEntries.length === 0)
    return (
      <Section id="my-tickets" title="Your tickets">
        <div className="card pad">
          <p className="panel-text">
            No tickets in Draw № {d.id} for <Addr k={wallet.address} /> yet. The next ticket is {ticketNo(d.nextTicket)}.
          </p>
        </div>
      </Section>
    );

  const tickets = player?.tickets ?? myEntries.reduce((k, e) => k + e.count, 0);
  const spent = player?.spent ?? myEntries.reduce((k, e) => k + e.paidLamports, BigInt(0));
  const won = player?.won ?? myEntries.reduce((k, e) => k + e.solPaid, BigInt(0));
  const sealed = myEntries.filter((e) => e.needsReveal && !e.revealed).length;
  const holdsWinner = d.status === "settled" && myEntries.some((e) => d.winningTicket >= e.firstTicket && d.winningTicket < e.firstTicket + e.count);
  const paidCount = myEntries.filter((e) => !e.isFree).reduce((k, e) => k + e.count, 0);
  const allRefunded = myEntries.filter((e) => !e.isFree).every((e) => e.refunded);
  const lead: ReactNode =
    d.status === "settled" ? (
      holdsWinner ? (
        <>
          All {tickets} were in the draw, and you hold the winner, {ticketNo(d.winningTicket)}.
        </>
      ) : (
        <>
          None of your {tickets} was drawn; {ticketNo(d.winningTicket)} won.
        </>
      )
    ) : d.status === "cancelled" ? (
      paidCount === 0 ? (
        <>Draw № {d.id} was cancelled. A free entry has nothing to refund.</>
      ) : allRefunded ? (
        <>
          Draw № {d.id} was cancelled. Your {paidCount} paid {plural(paidCount, "ticket was", "tickets were")} refunded.
        </>
      ) : (
        <>
          Draw № {d.id} was cancelled. Your {paidCount} paid {plural(paidCount, "ticket", "tickets")} can be refunded in full.
        </>
      )
    ) : (
      <>
        All {tickets} {plural(tickets, "is", "are")} in the draw.
      </>
    );

  return (
    <Section
      id="my-tickets"
      title="Your tickets"
      lead={
        <>
          {lead} Wallet <Addr k={wallet.address} />. Spent {sol(spent, 2, 4)} SOL
          {won > BigInt(0) ? <>, won {sol(won, 2, 4)} SOL in instant prizes</> : null}
          {sealed > 0 ? <>, {sealed} {plural(sealed, "purchase", "purchases")} still to reveal</> : null}.
        </>
      }
    >
      <div className="card">
        <ul className="rows" aria-label="Your entries">
          {myEntries.map((e) => (
            <Row key={e.address.toBase58()} e={e} d={d} />
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Row({ e, d }: { e: EntryView; d: DrawView }) {
  const { refund, reveal, phase, errors, clearError, disabledReason } = useActions();
  const { solUsd } = useDrawSol();
  const nums = ticketNumbersOf(e);
  const sealed = e.needsReveal && !e.revealed;
  const holds = d.status === "settled" && !sealed && nums.includes(d.winningTicket);
  const rk = `refund:${e.address.toBase58()}` as const;
  const vk = `reveal:${e.address.toBase58()}` as const;
  const rp = phase[rk];
  const busy = inFlight(rp);
  const owed = refundOf(e);
  const what = e.isFree ? "Free entry" : `${n(e.count)} ${plural(e.count, "ticket", "tickets")}`;
  const wins = scheduleWinsOf(e, d);
  const winSet = new Set(wins.map((w) => w.ticket));
  const random = d.randomNumbers;
  const [all, setAll] = useState(false);
  const LIMIT = 24;
  const shown = all ? nums : nums.slice(0, LIMIT);
  return (
    <li className={`row ${holds ? "row-win" : ""}`}>
      <div className="row-main">
        <b className="tab">{sealed ? (random ? "Numbers pending reveal" : ticketRange(e.firstTicket, e.count)) : random ? `${n(e.count)} ${plural(e.count, "number", "numbers")}` : ticketRange(e.firstTicket, e.count)}</b>
        <span className="row-what">
          {what} · {shortDate(e.createdAt)}, {clock(e.createdAt)} UTC
          {!e.isFree && <> · {sol(e.paidLamports, 2, 4)} SOL</>}
          {e.revealed && e.needsReveal && (e.solPaid > BigInt(0) ? <> · won {usdPrize(e.solPaid, solUsd) ?? `${sol(e.solPaid, 2, 4)} SOL`}</> : <> · no instant win</>)}
        </span>
        {random && !sealed && (
          <ul className="nums" aria-label="Your ticket numbers">
            {shown.map((t) => {
              const w = wins.find((x) => x.ticket === t);
              const drawn = d.status === "settled" && t === d.winningTicket;
              return (
                <li key={t} className={`num tab ${winSet.has(t) ? "win" : ""} ${drawn ? "drawn" : ""}`} title={w ? `Won ${sol(w.lamports, 2, 4)} SOL` : drawn ? "Won the end prize" : undefined}>
                  {tno(t)}
                  {w && <span className="num-w">{usdPrize(w.lamports, solUsd) ?? `${sol(w.lamports, 2, 4)} SOL`}</span>}
                  {drawn && <span className="num-w">end prize</span>}
                </li>
              );
            })}
            {nums.length > LIMIT && (
              <li className="num more">
                <button type="button" className="tbtn" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                  {all ? "Show fewer" : `+${n(nums.length - LIMIT)} more`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="row-side">
        {sealed && d.status !== "cancelled" ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => reveal(e)} disabled={!!disabledReason || inFlight(phase[vk])}>
            {inFlight(phase[vk]) && <Busy />}
            Reveal {e.count === 1 ? "ticket" : `${n(e.count)} tickets`}
          </button>
        ) : holds ? (
          <span className="pill pill-accent">Won {prizeFig(grandPrize(d))} SOL</span>
        ) : d.status === "cancelled" ? (
          e.isFree ? (
            <span className="c-3">nothing to refund</span>
          ) : e.refunded ? (
            <span className="pill pill-neutral">Refunded {sol(owed, 2, 4)} SOL</span>
          ) : owed > BigInt(0) ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => refund(e)} disabled={busy || !!disabledReason}>
              {busy && <Busy />}
              {phaseLabel(rp, `Refund ${sol(owed, 2, 4)} SOL`)}
            </button>
          ) : (
            <span className="c-3">nothing to refund</span>
          )
        ) : d.status === "settled" ? (
          <span className="c-3">not drawn</span>
        ) : (
          <span className="pill pill-neutral">In the draw</span>
        )}
        <ProofLink account={e.address} className="row-proof">
          Entry
        </ProofLink>
      </div>
      {errors[rk] && (
        <div className="row-err">
          <ErrorNote onDismiss={() => clearError(rk)}>{errors[rk]!.message}</ErrorNote>
        </div>
      )}
      {errors[vk] && (
        <div className="row-err">
          <ErrorNote onDismiss={() => clearError(vk)}>{errors[vk]!.message}</ErrorNote>
        </div>
      )}
    </li>
  );
}
