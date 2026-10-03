"use client";

import Link from "next/link";
import { useDrawSol } from "@/hooks/context";
import { cancelReason, grandPrize } from "@/lib/derive";
import { sol, ticketNo, utcLabel } from "@/lib/format";
import type { DrawView } from "@/lib/types";
import { Addr, Pill, ProofLink, Section } from "./bits";
import { kindName, n, prizeFig } from "./fmt";
import { useSettleTx } from "./Recompute";

/**
 * Winners and past draws, read from the Draw accounts on devnet: every settled draw with its winning ticket,
 * wallet and payout, then the cancelled ones. Nothing is listed that isn't an account on chain.
 */
export function Winners() {
  const { draws, legacyDraws, current, wallet } = useDrawSol();
  const past = [...draws, ...legacyDraws]
    .filter((d) => (d.status === "settled" || d.status === "cancelled") && !(current && d.address.equals(current.address)))
    .sort((a, b) => (b.settledAt || b.drawAt) - (a.settledAt || a.drawAt) || b.id - a.id);
  const settled = past.filter((d) => d.status === "settled");
  const cancelled = past.filter((d) => d.status === "cancelled");
  const paid = settled.reduce((s, d) => s + d.prizePaidLamports, BigInt(0));
  return (
    <Section
      id="winners"
      title="Winners"
      lead={
        settled.length ? (
          <>
            {settled.length} {settled.length === 1 ? "draw has" : "draws have"} settled on devnet so far, paying {sol(paid, 2, 4)} SOL in prizes. Each winner below is
            read from its Draw account.
          </>
        ) : (
          <>Every settled draw is listed here with its winning ticket, the wallet that held it and the payout. There isn’t one yet.</>
        )
      }
    >
      {settled.length === 0 ? (
        <div className="card pad">
          <p className="panel-text">
            No draw has been settled yet. {current ? `Draw № ${current.id} draws ${utcLabel(current.drawAt)}; its winner will appear here with the payout transaction.` : ""}
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
                {kindName(d.kind)} · cancelled{d.nextTicket === 0 ? ", no tickets sold" : cancelReason(d) === "undersold" ? `, ${n(d.paidTickets)} of ${n(d.minTickets)} sold` : ""} · refunded{" "}
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
          {kindName(d.kind)} · settled {utcLabel(d.settledAt)}
        </span>
      </div>
      <p className="wc-ticket tab">
        <span className="wc-eyebrow">Winning ticket</span>
        {ticketNo(d.winningTicket)}
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
          <dd className="tab">{n(d.nextTicket)}</dd>
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
