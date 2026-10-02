"use client";

import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { SectionHead, Spinner, Verify, ErrorNote, Check } from "./bits";
import { TicketStub } from "./TicketStub";
import { tierAmount } from "@/lib/derive";
import { shortDate, clock, sol, ticketNo, ticketRange } from "@/lib/format";
import type { DrawView, EntryView } from "@/lib/types";

export function MyTickets() {
  const { wallet, myEntries, player, current: d } = useDrawSol();
  const { setVisible } = useWalletModal();
  if (!d) return null;

  return (
    <section aria-labelledby="my-tickets-h">
      <SectionHead idx="02" title="My tickets" id="my-tickets" />
      {!wallet ? (
        <div className="flex flex-col items-start gap-4 border border-dashed border-line px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[15px] text-dim">Connect a wallet to see your tickets, instant results and refunds.</p>
          <button className="btn small ghost" onClick={() => setVisible(true)}>
            Connect wallet
          </button>
        </div>
      ) : myEntries.length === 0 ? (
        <div className="border border-dashed border-line px-6 py-8 text-[15px] text-dim">
          No tickets in this draw for <span className="mono text-cream">{wallet.address.toBase58().slice(0, 4)}…{wallet.address.toBase58().slice(-4)}</span> yet.
        </div>
      ) : (
        <>
          <dl className="mb-6 grid grid-cols-3 border-y border-line">
            {[
              ["Tickets", String(player?.tickets ?? myEntries.reduce((n, e) => n + e.count, 0))],
              ["Spent", `${sol(player?.spent ?? BigInt(0), 2, 4)} SOL`],
              ["Instant wins", `${sol(player?.won ?? BigInt(0), 2, 4)} SOL`],
            ].map(([k, v], i) => (
              <div key={k} className={`px-4 py-4 ${i > 0 ? "border-l border-line" : ""}`}>
                <dt className="eyebrow mb-1">{k}</dt>
                <dd className={`display text-[22px] leading-[24px] sm:text-[28px] sm:leading-[28px] ${k === "Instant wins" ? "text-brass" : ""}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-4">
            {myEntries.map((e) => (
              <EntryStub key={e.address.toBase58()} e={e} d={d} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function EntryStub({ e, d }: { e: EntryView; d: DrawView }) {
  const { reveal, refund, phase, errors, clearError, disabledReason } = useActions();
  const won = e.tiers.reduce((n, t) => n + (t > 0 ? 1 : 0), 0);
  const holdsWinner = d.status === "settled" && d.winningTicket >= e.firstTicket && d.winningTicket < e.firstTicket + e.count;
  const rk = `refund:${e.address.toBase58()}` as const;
  const rp = phase[rk];
  const refundBusy = rp === "simulating" || rp === "signing" || rp === "confirming";
  const canReveal = !e.isFree && !e.revealed && !d.reserveWithdrawn;

  let status: React.ReactNode;
  if (holdsWinner) status = <span className="font-semibold text-brass">Won the grand prize with {ticketNo(d.winningTicket)}</span>;
  else if (d.status === "settled") status = <span className="text-dim">Not drawn this time</span>;
  else if (d.status === "cancelled") status = e.isFree ? <span className="text-dim">Free entry — nothing to refund</span> : e.refunded ? <span className="inline-flex items-center gap-1 text-green"><Check /> Refunded {sol(e.paidLamports, 2, 4)} SOL</span> : <span>Refund due: {sol(e.paidLamports, 2, 4)} SOL</span>;
  else status = <span className="text-dim">In the grand draw</span>;

  return (
    <div>
      <TicketStub
        tone="dark"
        notch="var(--black)"
        stubWidth={120}
        className="entry-stub"
        tag={e.isFree ? "Free entry" : `Entry ${e.seq}`}
        serial={<span className="text-[15px]">{ticketRange(e.firstTicket, e.count)}</span>}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
              <span className="mono text-dim">
                {shortDate(e.createdAt)} {clock(e.createdAt)} UTC
              </span>
              <span>
                {e.count} {e.count === 1 ? "ticket" : "tickets"}
                {!e.isFree && <span className="text-dim"> · {sol(e.paidLamports, 2, 4)} SOL</span>}
              </span>
              <Verify account={e.address} />
            </div>
            {!e.isFree && (
              <div className="flex flex-wrap items-center gap-[3px]" aria-label={e.revealed ? `${won} instant wins` : "Not revealed"}>
                {Array.from({ length: e.count }, (_, i) => {
                  const t = e.tiers[i];
                  return (
                    <span
                      key={i}
                      title={`${ticketNo(e.firstTicket + i)}: ${!e.revealed ? "sealed" : t > 0 ? `+${sol(tierAmount(d, t), 2, 3)} SOL` : "no win"}`}
                      className={`h-3 w-3 ${!e.revealed ? "border border-line" : t > 0 ? "bg-brass" : "bg-line"}`}
                    />
                  );
                })}
                <span className="ml-2 text-[12px] text-dim">
                  {!e.revealed ? "sealed" : won > 0 ? <span className="text-brass">{won} instant {won === 1 ? "win" : "wins"} · +{sol(e.instantPaid, 2, 4)} SOL</span> : "no instant wins"}
                </span>
              </div>
            )}
            <div className="text-[13px]">{status}</div>
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            {canReveal && (
              <button className={`btn small ${d.status === "cancelled" ? "ghost" : ""}`} onClick={() => reveal(e)} disabled={!!disabledReason}>
                Reveal
              </button>
            )}
            {d.status === "cancelled" && !e.isFree && !e.refunded && (
              <button className="btn small" onClick={() => refund(e)} disabled={refundBusy || !!disabledReason}>
                {refundBusy && <Spinner />}
                {rp === "signing" ? "Approve…" : rp === "confirming" ? "Confirming…" : `Refund ${sol(e.paidLamports, 2, 4)} SOL`}
              </button>
            )}
          </div>
        </div>
      </TicketStub>
      {errors[rk] && (
        <div className="mt-2">
          <ErrorNote onDismiss={() => clearError(rk)}>{errors[rk]!.message}</ErrorNote>
        </div>
      )}
    </div>
  );
}
