"use client";

import { useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { activeTiers, entryWinList, instantNumer, pct, solNumer, tierCredits, tierLabel, tierSol, type TicketWin } from "@/lib/derive";
import { TIER_CREDITS, TIER_SOL_SHARE } from "@/lib/fairness";
import { clock, oneIn, short, shortDate, sol, ticketNo } from "@/lib/format";
import { solscanAccount } from "@/lib/config";
import type { DrawView, EntryView } from "@/lib/types";
import { useDrawSol } from "@/hooks/context";
import { SectionGrid } from "./bits";
import { drawName, plural } from "./fmt";

const ZERO = BigInt(0);

/** Tally of the revealed tickets of a draw: wins per tier, SOL paid, free tickets won. */
export function tally(d: DrawView, entries: EntryView[]) {
  const revealed = entries.filter((e) => e.needsReveal && e.revealed);
  const perTier = new Map<number, number>();
  for (const e of revealed) for (const k of e.tiers) if (k > 0) perTier.set(k, (perTier.get(k) ?? 0) + 1);
  return {
    revealedTickets: revealed.reduce((n, e) => n + e.count, 0),
    sealedTickets: entries.filter((e) => e.needsReveal && !e.revealed).reduce((n, e) => n + e.count, 0),
    perTier,
    solPaid: revealed.reduce((n, e) => n + e.solPaid, ZERO),
    credits: revealed.reduce((n, e) => n + e.creditsWon, 0),
    wins: revealed.reduce((n, e) => n + e.tiers.filter((k) => k > 0).length, 0),
  };
}

/**
 * The lede's instant-win table for a pot draw: per tier the prize (a share of the pool snapshot, or a free
 * ticket), the odds, and the wins so far; then how the pool works. Every figure is the draw account's or a
 * count over its Entry accounts.
 */
export function InstantTable({ d, entries, state, selling }: { d: DrawView; entries: EntryView[]; state: "loading" | "error" | "ready"; selling: boolean }) {
  const tiers = activeTiers(d);
  if (tiers.length === 0) return null;
  const ready = state === "ready";
  const t = tally(d, entries);
  const cell = (n: number) =>
    !ready ? <span className="c-ink-3">{state === "error" ? "—" : "…"}</span> : t.revealedTickets === 0 ? <span className="c-ink-3">—</span> : n;
  const pool = d.instantPoolLamports;
  return (
    <div className="odds">
      <p className="odds-head">
        <b>Instant wins</b>
        <i>odds set on-chain</i>
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Prize</th>
            <th scope="col">Odds</th>
            <th scope="col">Won</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((x) => (
            <tr key={x.index}>
              <td>
                <span className="nw">{tierLabel(x)}</span>
                {x.kind === TIER_SOL_SHARE && selling && pool > ZERO && <span className="odds-now nw">≈{sol(tierSol(x, pool), 2, 3)} SOL now</span>}
              </td>
              <td className="nw">{oneIn(x.odds, d.iwDenominator)}</td>
              <td className="nw">{cell(t.perTier.get(x.index + 1) ?? 0)}</td>
            </tr>
          ))}
          <tr className="sum">
            <td>Any instant win</td>
            <td className="nw">{oneIn(instantNumer(d), d.iwDenominator)}</td>
            <td className="nw">{cell(t.wins)}</td>
          </tr>
        </tbody>
      </table>
      <div className="odds-notes t-small">
        <p>
          A SOL prize is a share of the instant pool as it stood right after your purchase, paid from the pool
          {selling ? (
            <>
              {" "}
              about <span className="nw">2 s</span> after you pay
            </>
          ) : null}
          . Any SOL win: <span className="nw">{oneIn(solNumer(d), d.iwDenominator)}</span>. A free ticket is a credit for any later draw. Unwon instant pool rolls
          into the pot.
        </p>
      </div>
    </div>
  );
}

interface BoardRow {
  key: string;
  e: EntryView;
  w: TicketWin;
  /** the pool ran short for this entry: SOL actually paid for the whole entry, and what it was owed */
  capped: { paid: bigint; owed: bigint } | null;
}

const PAGE = 12;

/**
 * The instant prize board of one draw: every winning ticket (wallet, ticket, tier, SOL or free ticket, entry
 * link), with the tier table (odds, wins so far) and totals beside it. Read from the Entry accounts only.
 */
export function PrizeBoard({
  d,
  entries,
  state,
  onRetry,
  me,
  paged = true,
  id = "prizes",
}: {
  d: DrawView;
  entries: EntryView[];
  state: "loading" | "error" | "ready";
  onRetry: () => void;
  me?: PublicKey | null;
  paged?: boolean;
  id?: string;
}) {
  const { now } = useDrawSol();
  const [all, setAll] = useState(false);
  const tiers = activeTiers(d);
  if (tiers.length === 0) return null;
  const ready = state === "ready";
  const t = tally(d, entries);
  const rows: BoardRow[] = [];
  for (const e of entries) {
    const list = entryWinList(e, d);
    const owed = list.reduce((n, w) => n + w.sol, ZERO);
    const capped = owed > e.solPaid ? { paid: e.solPaid, owed } : null;
    for (const w of list) rows.push({ key: `${e.address.toBase58()}-${w.ticket}`, e, w, capped: w.sol > ZERO ? capped : null });
  }
  rows.sort((a, b) => b.e.createdAt - a.e.createdAt || b.w.ticket - a.w.ticket);
  const shown = all || !paged ? rows : rows.slice(0, PAGE);
  const sameDay = (x: number) => now - x < 86400;
  const n = drawName(d);

  return (
    <SectionGrid
      id={id}
      title="Instant prizes"
      sub={
        <>
          Every instant win in {n}, read from its Entry accounts on devnet.
          {ready && t.sealedTickets > 0 ? ` ${t.sealedTickets} ${plural(t.sealedTickets, "ticket is", "tickets are")} still sealed.` : ""}
        </>
      }
      aside={
        <>
          <table className="tiers">
            <thead>
              <tr>
                <th scope="col">Tier</th>
                <th scope="col">Odds</th>
                <th scope="col">Won</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((x) => (
                <tr key={x.index}>
                  <td>{tierLabel(x)}</td>
                  <td className="nw">{oneIn(x.odds, d.iwDenominator)}</td>
                  <td className="nw">{ready ? t.perTier.get(x.index + 1) ?? 0 : "…"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ledger big board-sum">
            <div className={t.solPaid > ZERO ? "won" : ""}>
              <dt>Paid from the pool</dt>
              <dd>{ready ? `${sol(t.solPaid, 2, 4)} SOL` : "…"}</dd>
            </div>
            {tiers.some((x) => x.kind === TIER_CREDITS) && (
              <div>
                <dt>Free tickets won</dt>
                <dd>{ready ? t.credits : "…"}</dd>
              </div>
            )}
            {d.kind === "pot" && d.status !== "settled" && d.status !== "cancelled" && (
              <div>
                <dt>Pool left</dt>
                <dd>{sol(d.instantPoolLamports, 2, 4)} SOL</dd>
              </div>
            )}
          </dl>
          {d.kind === "pot" && (
            <p className="t-small sec-sub">
              {d.status === "settled"
                ? "The pool left at the draw rolled into the pot and went to the winner."
                : `${pct(d.instantBps)} of every paid ticket goes into the pool. Unwon instant pool rolls into the pot.`}
            </p>
          )}
        </>
      }
    >
      <div className="eledger bledger">
        {!(ready && rows.length === 0) && (
          <div className="erow head" aria-hidden="true">
            <span>Time (UTC)</span>
            <span>Wallet</span>
            <span className="tix">Ticket · tier</span>
            <span className="r">Won</span>
          </div>
        )}
        {state === "loading" && entries.length === 0 ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="erow c-ink-3" aria-hidden="true">
              <span>…</span>
              <span>…</span>
              <span className="tix">…</span>
              <span className="r">…</span>
            </div>
          ))
        ) : state === "error" ? (
          <p className="t-body" style={{ padding: "16px 0" }}>
            Can’t load the entries of {n} from devnet right now.{" "}
            <button type="button" className="tbtn" onClick={onRetry}>
              Try again
            </button>
          </p>
        ) : rows.length === 0 ? (
          <p className="t-body c-ink-2" style={{ padding: "16px 0" }}>
            {t.revealedTickets === 0 ? (
              <>No ticket in {n} has been revealed yet, so nothing has been won. Each instant win is listed here with its wallet, ticket and entry account.</>
            ) : (
              <>
                No instant wins in {n} yet: {t.revealedTickets} {plural(t.revealedTickets, "ticket", "tickets")} revealed, none won. Each win is listed here with its
                wallet, ticket and entry account.
              </>
            )}
          </p>
        ) : (
          <div role="list" aria-label={`Instant wins in ${n}`}>
            {shown.map(({ key, e, w, capped }) => {
              const mine = !!me && e.owner.equals(me);
              const tier = d.iwTiers[w.tier - 1];
              const won = w.sol > ZERO ? `${sol(w.sol, 2, 4)} SOL` : w.credits === 1 ? "free ticket" : `${w.credits} free tickets`;
              return (
                <a
                  role="listitem"
                  key={key}
                  href={solscanAccount(e.address.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="erow"
                  aria-label={`${short(e.owner.toBase58())}${mine ? " (you)" : ""}, ticket ${ticketNo(w.ticket)}, ${tierLabel(tier)}, won ${won}. Entry account on Solscan.`}
                >
                  <span className="t">{sameDay(e.createdAt) ? clock(e.createdAt) : shortDate(e.createdAt)}</span>
                  <span className="wcell">
                    <span className="nw wl">
                      {short(e.owner.toBase58())}
                      {mine && <span className="you">you</span>}
                    </span>
                    <span className="sub-m nw">
                      {ticketNo(w.ticket)}
                      {w.sol > ZERO ? ` · ${tierLabel(tier)}` : ""}
                    </span>
                  </span>
                  <span className="tix">
                    <span className="nw">{ticketNo(w.ticket)}</span>
                    {w.sol > ZERO && <span className="x nw">· {tierLabel(tier)}</span>}
                  </span>
                  <span className="r">
                    {w.sol > ZERO ? <span className="w nw">+{sol(w.sol, 2, 4)} SOL</span> : <span className="nw">+{tierCredits(tier) === 1 ? "1 free ticket" : `${w.credits} free tickets`}</span>}
                    {capped && <i className="capped">pool ran short: the entry was paid {sol(capped.paid, 2, 4)} SOL in all</i>}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
      {paged && rows.length > PAGE && (
        <p className="emore">
          <button type="button" className="tbtn" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? `Show the latest ${PAGE}` : `Show all ${rows.length} wins`}
          </button>
        </p>
      )}
    </SectionGrid>
  );
}
