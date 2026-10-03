"use client";

import { useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { useDrawSol } from "@/hooks/context";
import { entryWins } from "@/lib/derive";
import { clock, short, shortDate, sol, ticketNo } from "@/lib/format";
import { solscanAccount } from "@/lib/config";
import { SectionGrid } from "./bits";
import { plural, prizeFig } from "./fmt";

const PAGE = 8;

interface Win {
  key: string;
  at: number;
  owner: PublicKey;
  amount: bigint;
  credits: number;
  drawId: number;
  account: PublicKey;
  /** instant: "3 of 10 tickets won, for 0.10 SOL"; grand: "grand prize, ticket #0006" */
  what: string;
  grand: boolean;
}

/**
 * Winners, computed from chain only: every revealed Entry that was paid an instant win, and every settled
 * draw's grand prize. The counters are sums over the same accounts, so they can't drift from the list.
 */
export function Winners() {
  const { draws, allEntries, allEntriesState, wallet, now, refresh } = useDrawSol();
  const [all, setAll] = useState(false);
  const byAddr = new Map(draws.map((d) => [d.address.toBase58(), d]));

  const settled = draws.filter((d) => d.status === "settled" && d.prizePaid);
  const ready = allEntriesState === "ready";
  // paid out: instant SOL from the Entry accounts, grand prizes from the Draw accounts
  const instantPaid = ready ? allEntries.reduce((n, e) => n + e.solPaid, BigInt(0)) : null;
  const paidOut = settled.reduce((n, d) => n + d.prizePaidLamports, BigInt(0)) + (instantPaid ?? BigInt(0));

  const wins: Win[] = [];
  if (ready) {
    for (const e of allEntries) {
      const d = byAddr.get(e.draw.toBase58());
      if (!d || !e.revealed || (e.solPaid === BigInt(0) && e.creditsWon === 0)) continue;
      const n = entryWins(e);
      wins.push({
        key: e.address.toBase58(),
        at: e.createdAt,
        owner: e.owner,
        amount: e.solPaid,
        credits: e.creditsWon,
        drawId: d.id,
        account: e.address,
        what: e.isFree
          ? "instant, on a free entry"
          : `instant, ${n} of ${e.count} ${plural(e.count, "ticket", "tickets")}${e.paidLamports > BigInt(0) ? ` for ${sol(e.paidLamports, 2, 4)} SOL` : ""}`,
        grand: false,
      });
    }
  }
  for (const d of settled)
    wins.push({
      key: `grand-${d.address.toBase58()}`,
      at: d.settledAt,
      owner: d.winner,
      amount: d.prizePaidLamports,
      credits: 0,
      drawId: d.id,
      account: d.winningEntry,
      what: `grand prize, ticket ${ticketNo(d.winningTicket)}`,
      grand: true,
    });
  wins.sort((a, b) => b.at - a.at);
  const instantTickets = ready ? allEntries.filter((e) => !e.isFree && e.revealed).reduce((n, e) => n + entryWins(e), 0) : null;
  const rows = all ? wins : wins.slice(0, PAGE);
  const sameDay = (t: number) => now - t < 86400;
  const me = wallet?.address;

  return (
    <SectionGrid
      id="winners"
      title="Winners"
      sub={<>Every instant win and grand prize so far, read from the Entry and Draw accounts on devnet. Instant wins are timed by purchase; the result lands seconds later.</>}
      aside={
        <dl className="ledger big">
          <div className={paidOut > BigInt(0) ? "won" : ""}>
            <dt>Paid out</dt>
            <dd>{instantPaid === null && settled.length === 0 ? <span className="c-ink-3">…</span> : `${sol(paidOut, 2, 4)} SOL`}</dd>
          </div>
          <div>
            <dt>Winning tickets, instant</dt>
            <dd>{instantTickets === null ? <span className="c-ink-3">{allEntriesState === "error" ? "—" : "…"}</span> : instantTickets}</dd>
          </div>
          <div>
            <dt>Draws settled</dt>
            <dd>{settled.length}</dd>
          </div>
        </dl>
      }
    >
      <div className="eledger wledger">
        {!(ready && wins.length === 0) && (
          <div className="erow head" aria-hidden="true">
            <span>Time (UTC)</span>
            <span>Wallet</span>
            <span className="tix">Draw</span>
            <span className="r">Won</span>
          </div>
        )}
        {allEntriesState === "loading" ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="erow c-ink-3" aria-hidden="true">
              <span>…</span>
              <span>…</span>
              <span className="tix">…</span>
              <span className="r">…</span>
            </div>
          ))
        ) : allEntriesState === "error" ? (
          <p className="t-body" style={{ padding: "16px 0" }}>
            Can’t load winners from devnet right now.{" "}
            <button type="button" className="tbtn" onClick={refresh}>
              Try again
            </button>
          </p>
        ) : wins.length === 0 ? (
          <p className="t-body c-ink-2" style={{ padding: "16px 0" }}>
            No winners yet. When a ticket wins, it’s listed here with its wallet and a link to its account.
          </p>
        ) : (
          <div role="list" aria-label="Winners">
            {rows.map((w) => {
              const mine = !!me && w.owner.equals(me);
              return (
                <a
                  role="listitem"
                  key={w.key}
                  href={solscanAccount(w.account.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="erow"
                  aria-label={`${short(w.owner.toBase58())}${mine ? " (you)" : ""} won ${amountText(w)} in Draw Nº ${w.drawId}, ${w.what}. ${w.grand ? "Winning entry" : "Entry"} account on Solscan.`}
                >
                  <span className="t">{sameDay(w.at) ? clock(w.at) : shortDate(w.at)}</span>
                  <span className="wcell">
                    <span className="nw wl">
                      {short(w.owner.toBase58())}
                      {mine && <span className="you">you</span>}
                    </span>
                    {/* phones: the Draw column is hidden, so its short form sits under the wallet */}
                    <span className="sub-m nw">
                      Nº {w.drawId} · {w.grand ? w.what.replace("grand prize, ticket", "grand") : "instant"}
                    </span>
                  </span>
                  <span className="tix wwhat">
                    Nº {w.drawId} · {w.what}
                  </span>
                  <span className="r">
                    {amountText(w)
                      .split(" + ")
                      .map((part, i) => (
                        <span key={i} className={`nw ${i === 0 && w.amount > BigInt(0) ? "w" : ""}`}>
                          {i > 0 ? " + " : ""}
                          {part}
                        </span>
                      ))}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
      {ready && wins.length > PAGE && (
        <p className="emore">
          <button type="button" className="tbtn" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? `Show the latest ${PAGE}` : `Show all ${wins.length} wins`}
          </button>
        </p>
      )}
    </SectionGrid>
  );
}

/** "0.04 SOL", "1 free ticket", "0.04 SOL + 1 free" */
function amountText(w: { amount: bigint; credits: number; grand: boolean }) {
  const solPart = w.amount > BigInt(0) ? `${w.grand ? prizeFig(w.amount) : sol(w.amount, 2, 4)} SOL` : "";
  const free = w.credits > 0 ? (solPart ? `${w.credits} free` : `${w.credits} free ${plural(w.credits, "ticket", "tickets")}`) : "";
  return [solPart, free].filter(Boolean).join(" + ");
}
