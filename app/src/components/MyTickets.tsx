"use client";

import type { ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { tierAmount } from "@/lib/derive";
import { clock, shortDate, sol, ticketNo, ticketRange } from "@/lib/format";
import { inkAt, ticketInk } from "@/lib/print";
import type { DrawView, EntryView } from "@/lib/types";
import { Addr, Busy, ErrorNote, inFlight, ProofLink, SectionGrid } from "./bits";
import { plural } from "./fmt";
import { Stamp } from "./print/Stamp";
import { Stub, type StubState } from "./TicketStub";

export function MyTickets() {
  const { wallet, myEntries, player, current: d } = useDrawSol();
  const { setVisible } = useWalletModal();
  if (!d) return null;

  if (!wallet)
    return (
      <SectionGrid id="my-tickets" title="Your tickets">
        <p className="t-body c-ink-2">Connect a wallet to see your tickets, instant results and refunds.</p>
        <button type="button" className="btn btn-sec" style={{ marginTop: 16 }} onClick={() => setVisible(true)}>
          Connect wallet
        </button>
      </SectionGrid>
    );

  if (myEntries.length === 0)
    return (
      <SectionGrid id="my-tickets" title="Your tickets">
        <p className="t-body c-ink-2">
          No tickets in this draw for <Addr k={wallet.address} /> yet. The next ticket is {ticketNo(d.nextTicket)}.
        </p>
      </SectionGrid>
    );

  const tickets = player?.tickets ?? myEntries.reduce((n, e) => n + e.count, 0);
  const spent = player?.spent ?? myEntries.reduce((n, e) => n + e.paidLamports, BigInt(0));
  const won = player?.won ?? myEntries.reduce((n, e) => n + e.instantPaid, BigInt(0));
  // long rolls (more than 5) get a row each; the short ones, sealed or not, and the free entry share
  // one row side by side, so the same data keeps the same layout before and after a reveal
  const long = myEntries.filter((e) => !e.isFree && e.count > 5);
  const short = myEntries.filter((e) => e.isFree || e.count <= 5);
  const n = tickets;
  const win = <span className="nw">{ticketNo(d.winningTicket)}</span>;
  const holdsWinner = d.status === "settled" && myEntries.some((e) => d.winningTicket >= e.firstTicket && d.winningTicket < e.firstTicket + e.count);
  const paidCount = myEntries.filter((e) => !e.isFree).reduce((k, e) => k + e.count, 0);
  const allRefunded = myEntries.filter((e) => !e.isFree).every((e) => e.refunded);
  // what holds for these tickets depends on where the draw is
  const lead: ReactNode =
    d.status === "settled" ? (
      holdsWinner ? (
        <>
          All {n} were in the grand draw, and you hold the winner, {win}.
        </>
      ) : (
        <>
          None of your {n} was drawn; {win} won.
        </>
      )
    ) : d.status === "cancelled" ? (
      paidCount === 0 ? (
        <>Draw Nº {d.id} was cancelled. A free entry has nothing to refund.</>
      ) : allRefunded ? (
        <>
          Draw Nº {d.id} was cancelled. Your {paidCount} paid {plural(paidCount, "ticket was", "tickets were")} refunded.
        </>
      ) : (
        <>
          Draw Nº {d.id} was cancelled. Your {paidCount} paid {plural(paidCount, "ticket", "tickets")} can be refunded in full.
        </>
      )
    ) : (
      <>
        All {n} {plural(n, "is", "are")} in the grand draw.
      </>
    );

  return (
    <SectionGrid
      id="my-tickets"
      title="Your tickets"
      sub={
        <>
          {lead} Wallet <Addr k={wallet.address} />.
        </>
      }
      aside={
        <dl className="ledger big">
          <div>
            <dt>Tickets</dt>
            <dd>{tickets}</dd>
          </div>
          <div>
            <dt>Spent</dt>
            <dd>{sol(spent, 2, 4)} SOL</dd>
          </div>
          <div className={won > BigInt(0) ? "won" : ""}>
            <dt>Won so far</dt>
            <dd>{sol(won, 2, 4)} SOL</dd>
          </div>
        </dl>
      }
    >
      <div className="rolls">
        {long.map((e) => (
          <Roll key={e.address.toBase58()} e={e} d={d} />
        ))}
        {short.length > 0 && (
          <div className="rolls-row">
            {short.map((e) => (
              <Roll key={e.address.toBase58()} e={e} d={d} />
            ))}
          </div>
        )}
      </div>
    </SectionGrid>
  );
}

function Roll({ e, d }: { e: EntryView; d: DrawView }) {
  const { reveal, refund, phase, errors, clearError, lastSig, disabledReason } = useActions();
  const holds = d.status === "settled" && d.winningTicket >= e.firstTicket && d.winningTicket < e.firstTicket + e.count;
  const rk = `refund:${e.address.toBase58()}` as const;
  const vk = `reveal:${e.address.toBase58()}` as const;
  const rp = phase[rk];
  const refundBusy = inFlight(rp);
  const sealed = !e.isFree && !e.revealed;
  const canReveal = sealed && !d.reserveWithdrawn && d.status !== "cancelled";
  const payoutTx = lastSig[vk];
  const winsAmt = e.instantPaid;
  const prize = sol(d.prizeLamports, 0, 4);

  const stateOf = (i: number): StubState => {
    const t = e.firstTicket + i;
    if (holds && t === d.winningTicket) return "drawn";
    if (e.refunded) return "refunded";
    if (e.isFree) return "free";
    if (!e.revealed) return "sealed";
    return e.tiers[i] > 0 ? "won" : "nowin";
  };

  return (
    <div className={`roll ${e.isFree ? "roll-free" : ""}`}>
      <p className="roll-cap">
        <b>{e.isFree ? "Free entry" : `Bought ${e.count}`}</b>
        <span className="nw tab">{ticketRange(e.firstTicket, e.count)}</span>
        {e.isFree ? (
          <span>grand draw only</span>
        ) : sealed ? (
          <span>sealed</span>
        ) : (
          <>
            <span className="nw">
              {shortDate(e.createdAt)}, {clock(e.createdAt)} UTC
            </span>
            {winsAmt > BigInt(0) ? <span className="won nw">won {sol(winsAmt, 2, 4)} SOL</span> : <span>no instant wins</span>}
            {payoutTx && <ProofLink tx={payoutTx}>Payout tx</ProofLink>}
          </>
        )}
      </p>
      <div className={`strip-of ${e.count > 5 ? "rows" : "n-few"}`} role="list" aria-label={`Tickets ${ticketRange(e.firstTicket, e.count)}`}>
        {Array.from({ length: e.count }, (_, i) => {
          const t = e.firstTicket + i;
          const st = stateOf(i);
          return (
            <Stub
              key={i}
              serial={t}
              state={st}
              amount={st === "won" ? tierAmount(d, e.tiers[i]) : undefined}
              ink={st === "drawn" ? inkAt(d.randomness, 32) : ticketInk(e.address.toBytes(), t)}
              prize={prize}
            />
          );
        })}
        {e.refunded && (
          <Stamp kind="refunded" className="refund-stamp" seed={inkAt(e.address.toBytes(), 0)} label="Stamped: refunded" />
        )}
      </div>

      {holds && (
        <p className="roll-say">
          Ticket <span className="nw">{ticketNo(d.winningTicket)}</span> won the grand prize. <span className="nw">{prize} SOL</span> was paid to you.
        </p>
      )}

      {canReveal && (
        <>
          <p className="roll-note t-small">
            The reveal transaction wasn’t sent after this purchase, so these results are still sealed. Anyone can send it; any wins are paid to you.
          </p>
          <div className="roll-act">
            <button type="button" className="btn" onClick={() => reveal(e)} disabled={!!disabledReason}>
              Reveal {e.count} {plural(e.count, "ticket", "tickets")}
            </button>
          </div>
        </>
      )}

      {d.status === "cancelled" &&
        (e.isFree ? (
          <p className="roll-note t-small">Free entry: nothing to refund.</p>
        ) : e.refunded ? (
          <p className="roll-note t-small">
            Refunded <span className="nw">{sol(e.paidLamports, 2, 4)} SOL</span>.
          </p>
        ) : (
          <div className="roll-act">
            <button type="button" className="btn btn-sec" onClick={() => refund(e)} disabled={refundBusy || !!disabledReason}>
              {refundBusy && <Busy />}
              {rp === "simulating" ? "Checking with the program…" : rp === "signing" ? "Approve in your wallet…" : rp === "confirming" ? "Confirming…" : `Refund ${sol(e.paidLamports, 2, 4)} SOL`}
            </button>
          </div>
        ))}

      {errors[rk] && (
        <div style={{ marginTop: 12 }}>
          <ErrorNote onDismiss={() => clearError(rk)}>{errors[rk]!.message}</ErrorNote>
        </div>
      )}
      {errors[vk] && (
        <div style={{ marginTop: 12 }}>
          <ErrorNote onDismiss={() => clearError(vk)}>{errors[vk]!.message}</ErrorNote>
        </div>
      )}
    </div>
  );
}
