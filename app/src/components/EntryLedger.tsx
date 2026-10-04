"use client";

import { useId, useMemo, useState } from "react";
import type { PublicKey } from "@solana/web3.js";
import { useDrawSol } from "@/hooks/context";
import { entryWins, holdsWinner, ticketNumbersOf } from "@/lib/derive";
import { clock, short, shortDate, sol, ticketRange } from "@/lib/format";
import { solscanAccount } from "@/lib/config";
import type { DrawView, EntryView } from "@/lib/types";
import { n, plural, prizeSol, tnoOf } from "./fmt";

const PAGE = 12;

/** "#0034", "#0,034", "0034", "34" → 34; anything else → null */
export function ticketQuery(q: string): number | null {
  const m = q.trim().match(/^(?:#|no\.?\s*|nº\s*)?(\d{1,6})$/i);
  if (m) return Number(m[1]);
  const c = q.trim().match(/^#?(\d{1,3}),(\d{3})$/);
  return c ? Number(c[1] + c[2]) : null;
}

/** Base58 has no 0, so only a 5+ digit run without one could be part of an address. */
const maybeBase58 = (s: string) => /^[1-9]{5,}$/.test(s);

/**
 * A ticket number matches the entry that holds it, and nothing else: an address that merely contains the
 * digits ("19" inside an Entry address nobody sees in the row) is not a match. Other text matches the
 * wallet or the Entry address, any part of it. A sealed entry has no numbers yet, so it never matches one.
 */
export function matchEntry(e: EntryView, q: string): boolean {
  const s = q.trim();
  if (!s) return true;
  const t = ticketQuery(s);
  if (t !== null && e.tickets.includes(t)) return true;
  if (t !== null && !maybeBase58(s)) return false;
  // base58 is case-sensitive, but people type in any case
  const lo = s.toLowerCase();
  return e.owner.toBase58().toLowerCase().includes(lo) || e.address.toBase58().toLowerCase().includes(lo);
}

const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000Z", "Z");
const lamportsToSol = (l: bigint) => sol(l, 1, 9);

/** One CSV row per Entry account, straight from the decoded accounts. */
export function entriesCsv(d: DrawView, entries: EntryView[]): string {
  const head = [
    "draw",
    "entry_account",
    "seq",
    "owner",
    "first_pos",
    "count",
    "kind",
    "paid_sol",
    "created_at_utc",
    "revealed",
    "tickets",
    "prizes",
    "instant_wins",
    "instant_paid_sol",
    "refunded",
    "vrf_request",
  ];
  const rows = entries
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((e) => [
      d.id,
      e.address.toBase58(),
      e.seq,
      e.owner.toBase58(),
      e.firstPos,
      e.count,
      e.isFree ? "free" : "paid",
      lamportsToSol(e.paidLamports),
      iso(e.createdAt),
      e.needsReveal ? (e.revealed ? "yes" : "no") : "",
      e.tickets.length ? e.tickets.join(" ") : "",
      e.revealed ? e.prizes.join(" ") : "",
      e.needsReveal && e.revealed ? entryWins(e) : "",
      e.needsReveal && e.revealed ? lamportsToSol(e.instantPaid) : "",
      e.refunded ? "yes" : "no",
      e.needsReveal ? e.vrfRequest.toBase58() : "",
    ]);
  return [head, ...rows].map((r) => r.join(",")).join("\r\n") + "\r\n";
}

/** The tickets as the row says them: "#0,701, #1,325, #1,908, +27 ×30"; sealed: "numbers pending ×30"; legacy: the range. */
function describeTickets(d: DrawView, e: EntryView): string {
  if (!d.randomNumbers) return ticketRange(e.firstPos, e.count);
  const nums = ticketNumbersOf(e);
  if (!nums.length) return `numbers pending ×${e.count}`;
  return `${nums.slice(0, 3).map((t) => tnoOf(d, t)).join(", ")}${nums.length > 3 ? `, +${nums.length - 3}` : ""}`;
}

/** "#0,701, #1,325, #1,908, +27 ×30", and "has #0,034" in blue ink when a ticket search matched inside. */
function Range({ d, e, hit }: { d: DrawView; e: EntryView; hit: number | null }) {
  const nums = ticketNumbersOf(e);
  if (!d.randomNumbers)
    return (
      <>
        <span className="nw">{ticketRange(e.firstPos, e.count)}</span> <span className="x nw">{e.isFree ? "free" : `×${e.count}`}</span>
        {hit !== null && <i className="has nw"> has {tnoOf(d, hit)}</i>}
      </>
    );
  if (!nums.length)
    return (
      <>
        <span className="nw c-3">numbers pending</span> <span className="x nw">{e.isFree ? "free" : `×${e.count}`}</span>
      </>
    );
  return (
    <>
      <span className="nw">
        {nums.slice(0, 3).map((t) => tnoOf(d, t)).join(", ")}
        {nums.length > 3 ? `, +${nums.length - 3}` : ""}
      </span>{" "}
      <span className="x nw">{e.isFree ? "free" : `×${e.count}`}</span>
      {hit !== null && <i className="has nw"> has {tnoOf(d, hit)}</i>}
    </>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Every Entry account of a draw as a ruled ledger: a search line (wallet or ticket number) and a CSV of
 * the accounts as read. Each row links to its Entry on Solscan; your rows carry "you".
 */
export function EntryLedger({
  d,
  entries,
  state,
  onRetry,
  paged = true,
  me,
}: {
  d: DrawView;
  entries: EntryView[];
  state: "loading" | "error" | "ready";
  onRetry: () => void;
  /** show the latest 12 first, with "Show all" (home); the per-draw page lists every entry */
  paged?: boolean;
  me?: PublicKey | null;
}) {
  const { now } = useDrawSol();
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const qid = useId();
  const found = useMemo(() => entries.filter((e) => matchEntry(e, q)), [entries, q]);
  const qt = ticketQuery(q);
  const searching = q.trim() !== "";
  const rows = searching || all || !paged ? found : found.slice(0, PAGE);
  const sameDay = (t: number) => now - t < 86400;
  const ready = state === "ready";
  const tickets = entries.reduce((n, e) => n + e.count, 0);

  return (
    <>
      {ready && entries.length > 0 && (
        <div className="etools">
          <div className="esearch">
            <label htmlFor={qid} className="t-label">
              Find a wallet or ticket
            </label>
            <input
              id={qid}
              type="search"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              placeholder={d.randomNumbers ? "Wallet address or #1,908" : "Wallet address or #0020"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="tbtn"
            onClick={() => download(`drawsol-draw-${d.id}-entries.csv`, entriesCsv(d, entries))}
            aria-label={`Download all ${entries.length} entries of Draw Nº ${d.id} as CSV`}
          >
            Download CSV
          </button>
        </div>
      )}
      {ready && searching && (
        <p className="ematch t-small" role="status">
          {found.length === 0
            ? `No entry matches “${q.trim()}”.`
            : `${found.length} of ${entries.length} ${plural(entries.length, "entry", "entries")} ${plural(found.length, "matches", "match")}.`}
        </p>
      )}
      <div className="eledger">
        {!(ready && entries.length === 0) && (
          <div className="erow head" aria-hidden="true">
            <span>Time (UTC)</span>
            <span>Wallet</span>
            <span className="tix">Tickets</span>
            <span className="r">{d.legacy === "headline" ? "Result" : "Instant result"}</span>
          </div>
        )}
        {state === "loading" && entries.length === 0 ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="erow c-ink-3" aria-hidden="true">
              <span>…</span>
              <span>…</span>
              <span className="tix">…</span>
              <span className="r">…</span>
            </div>
          ))
        ) : state === "error" ? (
          <p className="t-body" style={{ padding: "16px 0" }}>
            Can’t load entries from devnet right now.{" "}
            <button type="button" className="tbtn" onClick={onRetry}>
              Try again
            </button>
          </p>
        ) : entries.length === 0 ? (
          <p className="t-body c-ink-2" style={{ padding: "16px 0" }}>
            {d.status === "open" ? (
              <>No tickets yet. Ticket numbers are handed out at random from the pool of {n(d.ticketCap)} when each entry is revealed.</>
            ) : (
              <>No tickets were sold or claimed in Draw Nº {d.id}.</>
            )}
          </p>
        ) : (
          <div role="list" aria-label={`Entries of Draw Nº ${d.id}`}>
            {rows.map((e) => {
              const wins = entryWins(e);
              const mine = !!me && e.owner.equals(me);
              const won = [
                e.instantPaid > BigInt(0) ? `+${prizeSol(e.instantPaid)} SOL` : "",
                (e.legacyCreditsWon ?? 0) > 0 ? `+${e.legacyCreditsWon} free ${plural(e.legacyCreditsWon!, "ticket", "tickets")}` : "",
              ]
                .filter(Boolean)
                .join(" ");
              const result = !e.needsReveal ? (e.isFree ? "free entry" : "in the draw") : !e.revealed ? "sealed" : wins > 0 ? won || "won" : "no win";
              const drawn = holdsWinner(d, e);
              // a ticket-number search: say which ticket of a multi-ticket entry matched
              const hit = qt !== null && e.count > 1 && e.tickets.includes(qt) ? qt : null;
              return (
                <a
                  role="listitem"
                  key={e.address.toBase58()}
                  href={solscanAccount(e.address.toBase58())}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="erow"
                  aria-label={`${short(e.owner.toBase58())}${mine ? " (you)" : ""}, ${describeTickets(d, e)}, ${result}${drawn ? `, holds the winning ticket ${tnoOf(d, d.winningTicket)}` : ""}. Entry account on Solscan.`}
                >
                  <span className="t">{sameDay(e.createdAt) ? clock(e.createdAt) : shortDate(e.createdAt)}</span>
                  <span className="wcell">
                    <span className="nw wl">
                      {short(e.owner.toBase58())}
                      {mine && <span className="you">you</span>}
                    </span>
                    {/* phones: the Tickets column is hidden, so the numbers sit under the wallet (a ticket search shows its match) */}
                    <span className="sub-m">
                      <Range d={d} e={e} hit={hit} />
                    </span>
                  </span>
                  <span className="tix">
                    <Range d={d} e={e} hit={hit} />
                  </span>
                  <span className="r">
                    {!e.needsReveal ? (
                      <i className="free">{e.isFree ? "free entry" : "in the draw"}</i>
                    ) : !e.revealed ? (
                      <i>sealed</i>
                    ) : wins > 0 ? (
                      <span className="w">
                        {won.split(" +").map((part, i) => (
                          <span key={i} className="nw">
                            {i > 0 ? " +" : ""}
                            {part}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <i className="nw">no win</i>
                    )}
                    {/* phones: the drawn ticket gets a line of its own, so the wallet and numbers keep their width */}
                    {drawn && (
                      <span className="w drawn nw dmark">
                        <span className="dsep"> · </span>
                        {tnoOf(d, d.winningTicket)} drawn
                      </span>
                    )}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
      {paged && !searching && found.length > PAGE && (
        <p className="emore">
          <button type="button" className="tbtn" onClick={() => setAll((a) => !a)} aria-expanded={all}>
            {all ? `Show the latest ${PAGE}` : `Show all ${found.length} entries`}
          </button>
        </p>
      )}
      {ready && entries.length > 0 && !paged && (
        <p className="emore t-small c-ink-2">
          {entries.length} {plural(entries.length, "entry", "entries")}, {tickets} {plural(tickets, "ticket", "tickets")}, all listed.
        </p>
      )}
    </>
  );
}
