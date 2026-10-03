"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PublicKey } from "@solana/web3.js";
import { useDrawSol } from "@/hooks/context";
import { useOraoRead } from "@/hooks/useOraoRead";
import { anyoneCanRun, cancelReason, grandPrize, headlineHouseBps, isDefaultKey, pct, phaseOf, publicFrom, remaining, type Phase } from "@/lib/derive";
import { drawPda, vaultPda } from "@/lib/chain";
import { toHex } from "@/lib/fairness";
import { shortDate, sol, ticketNo, utcLabel } from "@/lib/format";
import type { DrawView, EntryView } from "@/lib/types";
import { Addr, Busy, ProofLink, SectionGrid } from "./bits";
import { EntryLedger } from "./EntryLedger";
import { drawName, kindName, plural, prizeFig } from "./fmt";
import { PrizeBoard } from "./InstantWins";
import { splitLine } from "./DrawTicket";
import { CarbonSlip } from "./print/CarbonSlip";
import { CancelledTicket, SettledTicket, SettleTxLine, useSettleTx } from "./SettledTicket";
import { Barcode, yoursText } from "./print/Barcode";

const STATUS: Record<Phase, string> = {
  selling: "Open",
  closed: "Sales closed, waiting for the draw time",
  due: "Due, waiting to be drawn",
  drawing: "Being drawn",
  settled: "Settled",
  cancelled: "Cancelled",
};

/**
 * The permanent page of one draw (research P0-6), at /draw/?n=N. Everything is read from the Draw account
 * and its Entry accounts on devnet. A number that names no draw gets an honest "doesn't exist" page, never
 * a 404; no number lists every draw.
 */
export function DrawRecord({ raw }: { raw: string | null }) {
  const { load, draws: v3, legacyDraws, config, refresh, now } = useDrawSol();
  // the v2 draws (Nº 0, Nº 1) are read through the v2 IDL while their accounts exist; v3 ids start at 2
  const draws = [...v3, ...legacyDraws];
  const n = raw !== null && /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : null;
  const ok = load.kind === "ready" || (load.kind === "nodraw" && (load.reason === "no-draws" || load.reason === "upgrading"));
  const found = ok && n !== null ? draws.find((x) => x.id === n) : undefined;
  // tabs and history tell draws apart: "Draw Nº 0 · settled · DrawSol", "No Draw Nº 99 · DrawSol"
  const docTitle =
    !ok
      ? null
      : found
        ? `${drawName(found)} · ${STATUS[phaseOf(found, now)].split(",")[0].toLowerCase()} · DrawSol`
        : n !== null
          ? `No Draw Nº ${n} · DrawSol`
          : raw !== null && raw.trim() !== ""
            ? "No such draw · DrawSol"
            : "Every draw · DrawSol";
  useEffect(() => {
    if (docTitle) document.title = docTitle;
  }, [docTitle]);

  if (load.kind === "loading")
    return (
      <SectionGrid id="draw" level={1} title={n !== null ? `Draw Nº ${n}` : "Every draw"}>
        <p className="t-voice c-ink-2" aria-busy="true">
          Reading {n !== null ? `Draw Nº ${n}` : "the draws"} from devnet…
        </p>
      </SectionGrid>
    );
  if (load.kind === "error" || (load.kind === "nodraw" && !ok))
    return (
      <SectionGrid id="draw" level={1} title="Can’t reach devnet.">
        <p className="t-body" role="alert">
          We couldn’t read {n !== null ? `Draw Nº ${n}` : "the draws"} from the Solana devnet RPC, so we’re not showing any numbers.
        </p>
        <p className="sec-link">
          <button type="button" className="btn" onClick={refresh}>
            Try again
          </button>
        </p>
      </SectionGrid>
    );

  const d = n !== null ? draws.find((x) => x.id === n) : undefined;
  if (d) return <Record d={d} />;

  // no such draw, or no number at all: say what exists, from chain
  const sorted = draws.slice().sort((a, b) => b.id - a.id);
  const next = config?.nextDrawId ?? null;
  const title = n !== null ? `No Draw Nº ${n}` : raw !== null && raw.trim() !== "" ? "No such draw" : "Every draw";
  const where = n !== null ? drawPda(n) : null;
  return (
    <SectionGrid
      id="draw"
      level={1}
      title={title}
      sub={
        n !== null ? (
          <>
            Draw Nº {n} doesn’t exist on-chain.{" "}
            {next !== null ? (
              next === 0 ? (
                <>The program hasn’t opened a draw yet.</>
              ) : (
                <>
                  The program has handed out {next} draw {plural(next, "number", "numbers")} so far, Nº 0{next > 1 ? <> to Nº {next - 1}</> : null}.
                </>
              )
            ) : null}
          </>
        ) : raw !== null && raw.trim() !== "" ? (
          <>“{raw.slice(0, 24)}” isn’t a draw number. Draws are numbered from 0.</>
        ) : (
          <>One page per draw, each read from its Draw account on devnet, with every entry.</>
        )
      }
      aside={
        where ? (
          <p className="ledger-link t-small">
            <ProofLink account={where}>Where its account would be</ProofLink>
          </p>
        ) : undefined
      }
    >
      <DrawIndex draws={sorted} next={next} />
    </SectionGrid>
  );
}

function DrawIndex({ draws, next }: { draws: DrawView[]; next: number | null }) {
  const { now } = useDrawSol();
  if (draws.length === 0 && !next) return <p className="t-body c-ink-2">No draw has been opened on devnet yet.</p>;
  // every number the program has handed out, newest first; a number with no Draw account on devnet says so
  const ids = new Set(draws.map((d) => d.id));
  const gaps = next !== null ? Array.from({ length: next }, (_, i) => next - 1 - i).filter((i) => !ids.has(i)) : [];
  const rows: ({ kind: "draw"; d: DrawView } | { kind: "gap"; id: number })[] = [
    ...draws.map((d) => ({ kind: "draw" as const, d })),
    ...gaps.map((id) => ({ kind: "gap" as const, id })),
  ].sort((a, b) => (b.kind === "draw" ? b.d.id : b.id) - (a.kind === "draw" ? a.d.id : a.id));
  return (
    <ul className="older dindex" aria-label="Every draw">
      {rows.map((r) => {
        if (r.kind === "gap")
          return (
            <li key={`gap-${r.id}`} className="older-row gap c-ink-3">
              <b>Draw Nº {r.id}</b>
              <span className="d">not found</span>
              <span className="d">no account on devnet (closed or never created)</span>
            </li>
          );
        const d = r.d;
        const ph = phaseOf(d, now);
        return (
          <li key={d.address.toBase58()} className="older-row">
            <b>
              <Link className="rowlink" href={`/draw/?n=${d.id}`}>
                {drawName(d)}
              </Link>
            </b>
            <span className="d">{STATUS[ph].split(",")[0].toLowerCase()}</span>
            <span className="d">
              {ph === "settled" ? (
                <>
                  ticket <span className="c-red nw">{ticketNo(d.winningTicket)}</span> won <span className="nw">{prizeFig(grandPrize(d))} SOL</span>
                </>
              ) : ph === "cancelled" ? (
                <>cancelled {shortDate(d.drawAt)}</>
              ) : (
                <>draws {utcLabel(d.drawAt)}</>
              )}
            </span>
            <span className="d nw">
              {d.paidTickets} of {d.ticketCap} sold{d.freeTickets > 0 ? `, ${d.freeTickets} free` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ k, children, className = "" }: { k: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Record({ d }: { d: DrawView }) {
  const { now, current, entries: curEntries, entriesState: curState, fetchDrawEntries, wallet } = useDrawSol();
  const isCurrent = !!current && current.address.equals(d.address);
  const [own, setOwn] = useState<{ entries: EntryView[]; state: "loading" | "error" | "ready" }>({ entries: [], state: "loading" });
  const [nonce, setNonce] = useState(0);
  const addr = d.address.toBase58();
  useEffect(() => {
    if (isCurrent) return;
    let alive = true;
    setOwn((o) => ({ ...o, state: o.entries.length ? o.state : "loading" }));
    fetchDrawEntries(d)
      .then((e) => alive && setOwn({ entries: e, state: "ready" }))
      .catch(() => alive && setOwn((o) => ({ ...o, state: "error" })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr, isCurrent, fetchDrawEntries, nonce, d.entryCount, d.revealedEntries]);
  const entries = isCurrent ? curEntries : own.entries;
  const state = isCurrent ? curState : own.state;

  const ph = phaseOf(d, now);
  const settled = ph === "settled";
  // the sales meter: free entries punched, this wallet's tickets raised in blue (only once entries are read)
  const free = state === "ready" ? entries.filter((e) => e.isFree).map((e) => e.firstTicket) : [];
  const me = wallet?.address;
  const mine = me ? entries.filter((e) => e.owner.equals(me)).flatMap((e) => Array.from({ length: e.count }, (_, i) => e.firstTicket + i)) : [];
  const tx = useSettleTx(d);
  // shared with the carbon slip below, so the record row and the slip can never disagree
  const { o: orao, retry: retryOrao } = useOraoRead(isDefaultKey(d.drawVrfRequest) ? null : d.drawVrfRequest, { again: d.status });
  const closed = ph !== "selling";
  const soldOut = d.paidTickets >= d.ticketCap;
  const prize = `${prizeFig(grandPrize(d))} SOL`;
  const hex = orao.kind === "fulfilled" ? toHex(orao.bytes) : "";
  const matches = orao.kind === "fulfilled" && settled ? toHex(d.randomness) === hex : null;
  const pot = d.kind === "pot";
  const why = ph === "cancelled" ? cancelReason(d) : null;
  const instantSol = state === "ready" ? entries.reduce((x, e) => x + e.solPaid, BigInt(0)) : null;

  const sub: ReactNode = settled ? (
    <>
      Settled <span className="nw">{utcLabel(d.settledAt)}</span>. Ticket <span className="nw">{ticketNo(d.winningTicket)}</span> won{" "}
      <span className="nw">{prize}</span>. Every figure here is read from the draw account and its entries on devnet.
    </>
  ) : ph === "selling" ? (
    d.kind === "headline" ? (
      <>
        Draws on <span className="nw">{utcLabel(d.drawAt)}</span> once {d.minTickets} tickets sell. Otherwise everyone is refunded in full. Every figure here is read
        from the draw account and its entries on devnet.
      </>
    ) : (
      <>
        Draws on <span className="nw">{utcLabel(d.drawAt)}</span>. Every figure here is read from the draw account and its entries on devnet.
      </>
    )
  ) : ph === "cancelled" ? (
    why === "no-tickets" ? (
      <>Closed with no tickets sold.</>
    ) : why === "undersold" ? (
      <>
        Cancelled at the draw time: {d.paidTickets} of the {d.minTickets} tickets it needed sold. The prize went back to the operator and every paid ticket is
        refunded in full.
      </>
    ) : (
      <>Cancelled: the randomness never arrived within 48 h of the draw time. Every paid ticket can be refunded.</>
    )
  ) : ph === "drawing" ? (
    <>Randomness has been requested from ORAO. Anyone can settle it once it lands.</>
  ) : ph === "closed" ? (
    <>
      Sales are closed. It draws at <span className="nw">{utcLabel(d.drawAt)}</span>, not before.
    </>
  ) : (
    <>The draw time has passed{anyoneCanRun(d, now) ? ", and anyone can run it now" : "; the operator’s keeper runs it first"}.</>
  );
  const atCap = d.kind === "headline" ? headlineHouseBps(d, d.ticketCap) : null;
  const atMin = d.kind === "headline" ? headlineHouseBps(d, d.minTickets) : null;

  return (
    <>
      <SectionGrid
        id="draw"
        level={1}
        title={drawName(d)}
        sub={sub}
      >
        <dl className="ledger record">
          <Row k="Status">{STATUS[ph]}</Row>
          <Row k="Kind">{d.kind === "v2" ? "Grand draw, DrawSol v2 (before the upgrade)" : kindName(d.kind)[0].toUpperCase() + kindName(d.kind).slice(1)}</Row>
          {pot ? (
            <>
              <Row k={settled ? "Grand prize, the pot" : "The pot"} className={settled ? "won" : ""}>
                {settled ? `${prize}, paid` : `${sol(d.potLamports, 2, 4)} SOL`}
              </Row>
              {!settled && ph !== "cancelled" && <Row k="Instant pool">{sol(d.instantPoolLamports, 2, 4)} SOL, rolls into the pot if unwon</Row>}
              <Row k="Split of every paid ticket">{splitLine(d)}</Row>
              <Row k="House share so far">{sol(d.houseLamports, 2, 4)} SOL</Row>
            </>
          ) : (
            <>
              <Row k="Grand prize" className={settled ? "won" : ""}>
                {settled ? `${prize}, paid` : ph === "cancelled" ? `${prize}, returned to the operator` : `${prize}, escrowed`}
              </Row>
              {d.kind === "headline" && (
                <>
                  <Row k="Minimum to draw">
                    {d.minTickets} paid tickets{d.paidTickets >= d.minTickets ? ", reached" : `, ${d.minTickets - d.paidTickets} to go`}
                  </Row>
                  {atCap !== null && atMin !== null && (
                    <Row k="House share">
                      {pct(atCap)} at sell-out, {pct(atMin)} at the minimum
                    </Row>
                  )}
                </>
              )}
            </>
          )}
          <Row k="Opened">{utcLabel(d.createdAt)}</Row>
          <Row k={closed ? "Sales closed" : "Sales close"}>
            {utcLabel(d.closesAt)}
            {closed && soldOut ? ", sold out" : ""}
          </Row>
          {d.kind !== "v2" && (
            <Row k="Draw time">
              {utcLabel(d.drawAt)}
              {d.publicGraceSecs > 0 ? `; anyone may run it from ${utcLabel(publicFrom(d))}` : ""}
            </Row>
          )}
          <Row k={closed ? "Tickets at close" : "Tickets so far"}>
            {d.paidTickets} of {d.ticketCap} sold
            {d.freeCap > 0 ? `, ${d.freeTickets} of ${d.freeCap} free ${plural(d.freeCap, "entry", "entries")}` : ""}
            {d.creditTickets > 0 ? `, ${d.creditTickets} on credits` : ""} · {d.nextTicket} in the draw
          </Row>
          <Row k="Ticket price">{sol(d.ticketPrice, 2, 4)} SOL</Row>
          <Row k="Paid for tickets">
            {sol(d.revenueLamports, 2, 4)} SOL{d.refundedLamports > BigInt(0) ? `, ${sol(d.refundedLamports, 2, 4)} refunded` : ""}
          </Row>
          {settled && (
            <>
              <Row k="Winning ticket" className="won">
                {ticketNo(d.winningTicket)}
              </Row>
              <Row k="Winner">
                <Addr k={d.winner} link />
              </Row>
            </>
          )}
          {!isDefaultKey(d.drawVrfRequest) && (
            <Row k="Randomness requested">
              <ProofLink account={d.drawVrfRequest}>ORAO request {d.drawVrfRequest.toBase58().slice(0, 4)}…</ProofLink>
            </Row>
          )}
          {orao.kind !== "none" && (
            <Row k="Randomness fulfilled">
              {orao.kind === "reading" || orao.kind === "idle" ? (
                <>
                  <Busy /> <span className="c-ink-3">reading ORAO…</span>
                </>
              ) : orao.kind === "error" ? (
                <span className="c-ink-3">
                  Couldn’t read ORAO’s request account.{" "}
                  <button type="button" className="tbtn" onClick={retryOrao}>
                    Try again
                  </button>
                </span>
              ) : orao.kind === "pending" ? (
                <span className="c-ink-3">not yet</span>
              ) : (
                <>
                  <code title={hex}>
                    {hex.slice(0, 8)}…{hex.slice(-8)}
                  </code>
                  {matches === true ? <span className="c-ink-2">, as stored</span> : matches === false ? <span className="c-red">, differs from the draw</span> : null}
                </>
              )}
            </Row>
          )}
          {settled && (
            <Row k="Settled">
              <SettleTxLine tx={tx} label="Settle transaction" />
            </Row>
          )}
          {(pot || d.kind === "v2") && (
            <Row k="Instant SOL paid" className={(d.legacyIwPaid ?? instantSol ?? BigInt(0)) > BigInt(0) ? "won" : ""}>
              {d.legacyIwPaid !== undefined ? `${sol(d.legacyIwPaid, 2, 4)} SOL` : instantSol === null ? "…" : `${sol(instantSol, 2, 4)} SOL`}
            </Row>
          )}
          <Row k="Draw account">
            <ProofLink account={d.address}>{d.address.toBase58().slice(0, 4)}… on Solscan</ProofLink>
          </Row>
          <Row k="Vault">
            <ProofLink account={vaultPda(d.address)}>{vaultPda(d.address).toBase58().slice(0, 4)}… on Solscan</ProofLink>
          </Row>
        </dl>
        {ph === "selling" && (
          <div className="drec-card">
            <p className="drec-card-h">
              <b>Sales so far</b>
              <i>one bar per ticket</i>
            </p>
            <Barcode
              minAt={d.kind === "headline" && d.paidTickets < d.minTickets ? d.minTickets + d.freeTickets + d.creditTickets : undefined}
              minLabel={`min ${d.minTickets}`}
              slots={d.ticketCap + d.freeTickets + d.creditTickets}
              taken={d.nextTicket}
              free={free}
              mine={mine}
              label={
                `${d.paidTickets} of ${d.ticketCap} paid tickets sold` +
                (d.freeTickets > 0 ? `, plus ${d.freeTickets} free ${plural(d.freeTickets, "entry", "entries")}` : "") +
                "." +
                yoursText(mine)
              }
              leftLabel={`${remaining(d)} left`}
            />
            {/* the ticket office sells the current draw; an older draw still open is bought from there too, so
                only the current one gets the button */}
            {d.kind !== "v2" && (
              <p className="drec-buy">
                <Link className="btn" href={`/?n=${d.id}#buy`}>
                  Buy tickets for Nº {d.id}
                </Link>
              </p>
            )}
          </div>
        )}
        {ph === "cancelled" && (
          <div className="past drec-past">
            <CancelledTicket d={d} />
          </div>
        )}
        {settled && (
          <div className="past drec-past">
            <SettledTicket d={d} />
            <CarbonSlip d={d} tilt id={`recompute-${d.id}`} />
          </div>
        )}
      </SectionGrid>

      {d.kind !== "headline" && <PrizeBoard d={d} entries={entries} state={state} onRetry={() => setNonce((x) => x + 1)} me={wallet?.address} paged={false} />}

      <SectionGrid
        id="entries"
        title="Every entry"
        sub={
          <>
            Each row is an Entry account of {drawName(d)} on devnet, so the list can’t be padded.
            {entries.length > 0 ? " Search by wallet or ticket number, or download them all." : ""}
          </>
        }
      >
        <EntryLedger d={d} entries={entries} state={state} onRetry={() => setNonce((x) => x + 1)} paged={false} me={wallet?.address} />
      </SectionGrid>
    </>
  );
}
