"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useDrawSol } from "@/hooks/context";
import { useOraoRead } from "@/hooks/useOraoRead";
import { anyoneCanRun, cancelReason, endPrize, endPrizeLocked, grandPrize, headlineHouseBps, isDefaultKey, pct, phaseOf, publicFrom, scheduleTotals, type Phase } from "@/lib/derive";
import { drawPda, legacyVaultPda, poolPda, schedulePda, vaultPda } from "@/lib/chain";
import { toHex } from "@/lib/fairness";
import { shortDate, sol, utcLabel } from "@/lib/format";
import type { DrawView, EntryView } from "@/lib/types";
import { Addr, Busy, Pill, ProofLink, Section } from "./bits";
import { EntryLedger } from "./EntryLedger";
import { drawName, kindName, n, plural, prizeFig, prizeSol, solRound, tnoOf } from "./fmt";
import { Meter } from "./Hero";
import { Recompute, SettleTxLine, useSettleTx } from "./Recompute";

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
  const { load, draws: v4, legacyDraws, config, refresh, now } = useDrawSol();
  const draws = [...v4, ...legacyDraws];
  const k = raw !== null && /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : null;
  const ok = load.kind === "ready" || (load.kind === "nodraw" && load.reason === "no-draws");
  const found = ok && k !== null ? draws.find((x) => x.id === k) : undefined;
  const docTitle = !ok
    ? null
    : found
      ? `${drawName(found)} · ${STATUS[phaseOf(found, now)].split(",")[0].toLowerCase()} · DrawSol`
      : k !== null
        ? `No Draw № ${k} · DrawSol`
        : raw !== null && raw.trim() !== ""
          ? "No such draw · DrawSol"
          : "Every draw · DrawSol";
  useEffect(() => {
    if (docTitle) document.title = docTitle;
  }, [docTitle]);

  if (load.kind === "loading")
    return (
      <Section id="draw" level={1} title={k !== null ? `Draw № ${k}` : "Every draw"}>
        <p className="panel-text" aria-busy="true">
          <Busy /> Reading {k !== null ? `Draw № ${k}` : "the draws"} from devnet…
        </p>
      </Section>
    );
  if (load.kind === "error" || (load.kind === "nodraw" && !ok))
    return (
      <Section id="draw" level={1} title="Can’t reach devnet">
        <p className="panel-text" role="alert">
          We couldn’t read {k !== null ? `Draw № ${k}` : "the draws"} from the Solana devnet RPC, so no numbers are shown.
        </p>
        <p className="msg-act">
          <button type="button" className="btn btn-primary" onClick={refresh}>
            Try again
          </button>
        </p>
      </Section>
    );

  const d = k !== null ? draws.find((x) => x.id === k) : undefined;
  if (d) return <Record d={d} />;

  const sorted = draws.slice().sort((a, b) => b.id - a.id);
  const next = config?.nextDrawId ?? null;
  const title = k !== null ? `No Draw № ${k}` : raw !== null && raw.trim() !== "" ? "No such draw" : "Every draw";
  const where = k !== null ? drawPda(k) : null;
  return (
    <Section
      id="draw"
      level={1}
      title={title}
      lead={
        k !== null ? (
          <>
            Draw № {k} has no open account on-chain.{" "}
            {next !== null ? (
              next === 0 ? (
                <>The program hasn’t opened a draw yet.</>
              ) : (
                <>
                  The program has handed out {next} draw {plural(next, "number", "numbers")} so far, № 0{next > 1 ? <> to № {next - 1}</> : null}; closed draws are gone
                  from the chain.
                </>
              )
            ) : null}{" "}
            {where && <ProofLink account={where}>Where its account would be</ProofLink>}
          </>
        ) : raw !== null && raw.trim() !== "" ? (
          <>“{raw.slice(0, 24)}” isn’t a draw number. Draws are numbered from 0.</>
        ) : (
          <>One page per draw, each read from its Draw account on devnet, with every entry.</>
        )
      }
    >
      <DrawIndex draws={sorted} next={next} />
    </Section>
  );
}

function DrawIndex({ draws, next }: { draws: DrawView[]; next: number | null }) {
  const { now } = useDrawSol();
  if (draws.length === 0 && !next) return <p className="panel-text">No draw has been opened on devnet yet.</p>;
  const ids = new Set(draws.map((d) => d.id));
  const gaps = next !== null ? Array.from({ length: next }, (_, i) => next - 1 - i).filter((i) => !ids.has(i)) : [];
  const rows: ({ kind: "draw"; d: DrawView } | { kind: "gap"; id: number })[] = [...draws.map((d) => ({ kind: "draw" as const, d })), ...gaps.map((id) => ({ kind: "gap" as const, id }))].sort(
    (a, b) => (b.kind === "draw" ? b.d.id : b.id) - (a.kind === "draw" ? a.d.id : a.id)
  );
  return (
    <div className="card">
      <ul className="rows dindex" aria-label="Every draw">
        {rows.map((r) => {
          if (r.kind === "gap")
            return (
              <li key={`gap-${r.id}`} className="row c-3">
                <div className="row-main">
                  <b>Draw № {r.id}</b>
                  <span className="row-what">no open account on devnet (closed, a draft, or never created)</span>
                </div>
              </li>
            );
          const d = r.d;
          const ph = phaseOf(d, now);
          return (
            <li key={d.address.toBase58()} className="row">
              <div className="row-main">
                <b>
                  <Link className="rowlink" href={`/draw/?n=${d.id}`}>
                    Draw № {d.id}
                  </Link>{" "}
                  <span className="c-2">{kindName(d)}</span>
                </b>
                <span className="row-what">
                  {ph === "settled" ? (
                    <>
                      ticket <b className="tab">{tnoOf(d, d.winningTicket)}</b> won {prizeFig(grandPrize(d))} SOL
                    </>
                  ) : ph === "cancelled" ? (
                    <>cancelled {shortDate(d.drawAt)}</>
                  ) : (
                    <>draws {utcLabel(d.drawAt)}</>
                  )}{" "}
                  · {n(d.paidTickets)} of {n(d.ticketCap)} sold
                </span>
              </div>
              <div className="row-side">
                <Pill tone={ph === "selling" ? "accent" : ph === "settled" ? "dark" : "neutral"}>{STATUS[ph].split(",")[0]}</Pill>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
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
  const { now, current, entries: curEntries, entriesState: curState, fetchDrawEntries, wallet, poolRemaining } = useDrawSol();
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
  const tx = useSettleTx(d);
  const { o: orao, retry: retryOrao } = useOraoRead(isDefaultKey(d.drawVrfRequest) ? null : d.drawVrfRequest, { again: d.status });
  const closed = ph !== "selling";
  const soldOut = d.nextPos >= d.ticketCap;
  const prize = `${prizeFig(grandPrize(d))} SOL`;
  const hex = orao.kind === "fulfilled" ? toHex(orao.bytes) : "";
  const matches = orao.kind === "fulfilled" && settled ? toHex(d.randomness) === hex : null;
  const legacyPot = d.legacy === "pot";
  const legacyHeadline = d.legacy === "headline";
  const why = ph === "cancelled" ? cancelReason(d) : null;
  const instantSol = state === "ready" ? entries.reduce((x, e) => x + e.instantPaid, BigInt(0)) : null;
  const mine = !!wallet && settled && d.winner.equals(wallet.address);
  const vault = d.legacy ? legacyVaultPda(d.address) : vaultPda(d.address);

  const instants = scheduleTotals(d);
  const lead: ReactNode = settled ? (
    <>
      Settled <span className="nw">{utcLabel(d.settledAt)}</span>. Ticket <b className="tab">{tnoOf(d, d.winningTicket)}</b> won <span className="nw">{prize}</span>. Every
      figure here is read from the draw account and its entries on devnet.
    </>
  ) : ph === "selling" ? (
    d.legacy === null ? (
      <>
        Draws <span className="nw">{utcLabel(d.drawAt)}</span>, guaranteed: the escrowed {prizeFig(d.endPrizeLamports)} SOL once {n(d.minTickets)} tickets sell, else{" "}
        {d.potBps / 100}% of sales. Every figure here is read from the draw account, its schedule and its entries on devnet.
      </>
    ) : legacyHeadline ? (
      <>
        Draws <span className="nw">{utcLabel(d.drawAt)}</span> once {n(d.minTickets)} tickets sell; otherwise everyone is refunded in full. Every figure here is read
        from the draw account and its entries on devnet.
      </>
    ) : (
      <>
        Draws <span className="nw">{utcLabel(d.drawAt)}</span>. Every figure here is read from the draw account and its entries on devnet.
      </>
    )
  ) : ph === "cancelled" ? (
    why === "no-tickets" ? (
      <>Closed with no tickets sold.</>
    ) : why === "undersold" ? (
      <>
        Cancelled at the draw time: {n(d.paidTickets)} of the {n(d.minTickets)} tickets it needed sold. The prize went back to the operator and every paid ticket is
        refunded in full.
      </>
    ) : (
      <>Cancelled: the randomness never arrived within 48 h of the draw time. Every paid ticket can be refunded, net of instant prizes already paid.</>
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
  const atCap = legacyHeadline ? headlineHouseBps(d, d.ticketCap) : null;
  const atMin = legacyHeadline ? headlineHouseBps(d, d.minTickets) : null;

  return (
    <>
      <section className="sec rec-head" id="draw" aria-labelledby="draw-h">
        <p className="badge-row">
          <Pill tone={ph === "selling" ? "accent" : settled ? "dark" : ph === "cancelled" ? "neutral" : "warn"}>{STATUS[ph].split(",")[0]}</Pill>
          <span className="c-2">{kindName(d)}</span>
        </p>
        <h1 className="t-h1" id="draw-h">
          {drawName(d)}
        </h1>
        <p className="sec-lead">{lead}</p>
      </section>

      {settled && (
        <div className="card winner rec-winner">
          <p className="winner-eyebrow">Winning ticket</p>
          <p className="winner-ticket tab">{tnoOf(d, d.winningTicket)}</p>
          <dl className="winner-facts">
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
                <b className="nw">{prize}</b>
              </dd>
            </div>
            <div>
              <dt>Out of</dt>
              <dd className="tab">
                {n(d.nextPos)} tickets{d.randomNumbers ? ` · position ${n(d.winningPos)}` : ""}
              </dd>
            </div>
          </dl>
          <p className="winner-links">
            <SettleTxLine tx={tx} label="Payout transaction" />
          </p>
        </div>
      )}

      <div className="rec-grid">
        <div className="card pad">
          <h2 className="t-h3">The record</h2>
          <dl className="record">
            <Row k="Status">{STATUS[ph]}</Row>
            {legacyPot ? (
              <>
                <Row k={settled ? "Grand prize, the pot" : "The pot"}>{settled ? `${prize}, paid` : `${sol(d.endPrizeLamports, 2, 4)} SOL`}</Row>
                <Row k="Split of every paid ticket">
                  {pct(d.houseBps)} house · {pct(d.potBps)} pot · {pct(d.instantBps)} instant wins
                </Row>
                <Row k="House share">{sol(d.houseLamports, 2, 4)} SOL</Row>
              </>
            ) : legacyHeadline ? (
              <>
                <Row k="Grand prize">{settled ? `${prize}, paid` : ph === "cancelled" ? `${prize}, returned to the operator` : `${prize}, escrowed`}</Row>
                <Row k="Minimum to draw">
                  {n(d.minTickets)} paid tickets{d.paidTickets >= d.minTickets ? ", reached" : `, ${n(d.minTickets - d.paidTickets)} to go`}
                </Row>
                {atCap !== null && atMin !== null && (
                  <Row k="House share">
                    {pct(atCap)} at sell-out, {pct(atMin)} at the minimum
                  </Row>
                )}
              </>
            ) : (
              <>
                <Row k={settled ? "End prize" : "End prize right now"}>
                  {settled
                    ? `${prize}, paid${d.paidTickets >= d.minTickets ? " (the escrowed prize)" : ` (${d.potBps / 100}% of sales, under the minimum)`}`
                    : `${prizeFig(endPrize(d))} SOL${endPrizeLocked(d) ? ", the escrowed prize, locked in" : `, ${d.potBps / 100}% of sales so far`}`}
                </Row>
                <Row k="Escrowed prize">
                  {prizeFig(d.endPrizeLamports)} SOL, paid in full once {n(d.minTickets)} paid tickets sell
                  {d.paidTickets >= d.minTickets ? " (reached)" : ` (${n(d.minTickets - d.paidTickets)} to go)`}
                  {settled && d.escrowReturned ? "; returned to the operator at settlement" : ""}
                </Row>
                <Row k="Instant prizes">
                  {n(instants.count)} published numbers, {solRound(d.scheduleTotalLamports, 3, 2)} SOL escrowed · {instants.wonCount} won so far, {prizeSol(d.instantsPaid)} SOL paid ·{" "}
                  {d.schedule.map((t) => `${prizeSol(t.lamports)} SOL ×${t.numbers.length}`).join(", ")} ·{" "}
                  <ProofLink account={schedulePda(d.address)}>schedule account</ProofLink>
                  {settled && d.instantEscrowReturned ? " · unwon escrow returned" : ""}
                </Row>
                <Row k="Split of every paid ticket">
                  {pct(d.houseBps)} house · {pct(d.potBps)} end prize / fallback pot · {pct(d.instantBps)} instant prizes
                </Row>
                {settled && <Row k="House share">{sol(d.houseLamports, 2, 4)} SOL, fixed at settlement</Row>}
              </>
            )}
            <Row k="Opened">{utcLabel(d.createdAt)}</Row>
            <Row k={closed ? "Sales closed" : "Sales close"}>
              {utcLabel(d.closesAt)}
              {closed && soldOut ? ", sold out" : ""}
            </Row>
            <Row k="Draw time">
              {utcLabel(d.drawAt)}
              {d.publicGraceSecs > 0 ? `; anyone may run it from ${utcLabel(publicFrom(d))}` : ""}
            </Row>
            <Row k={closed ? "Tickets at close" : "Tickets so far"}>
              {n(d.paidTickets)} of {n(d.ticketCap)} sold
              {d.freeCap > 0 ? `, ${d.freeTickets} of ${d.freeCap} free ${plural(d.freeCap, "entry", "entries")}` : ""} · {n(d.nextPos)} in the draw
            </Row>
            {d.randomNumbers && (
              <Row k="Ticket numbers">
                {n(d.assigned)} of {n(d.nextPos)} assigned by reveal
                {isCurrent && poolRemaining !== null ? ` · ${n(poolRemaining)} still in the pool` : ""} · <ProofLink account={poolPda(d.address)}>pool account</ProofLink>
              </Row>
            )}
            <Row k="Ticket price">{sol(d.ticketPrice, 2, 5)} SOL</Row>
            <Row k="Paid for tickets">
              {sol(d.revenueLamports, 2, 4)} SOL{d.refundedLamports > BigInt(0) ? `, ${sol(d.refundedLamports, 2, 4)} refunded` : ""}
            </Row>
            {!isDefaultKey(d.drawVrfRequest) && (
              <Row k="Randomness requested">
                <ProofLink account={d.drawVrfRequest}>ORAO request {d.drawVrfRequest.toBase58().slice(0, 4)}…</ProofLink>
              </Row>
            )}
            {orao.kind !== "none" && (
              <Row k="Randomness fulfilled">
                {orao.kind === "reading" || orao.kind === "idle" ? (
                  <>
                    <Busy /> <span className="c-3">reading ORAO…</span>
                  </>
                ) : orao.kind === "error" ? (
                  <span className="c-3">
                    Couldn’t read ORAO’s request account.{" "}
                    <button type="button" className="tbtn" onClick={retryOrao}>
                      Try again
                    </button>
                  </span>
                ) : orao.kind === "pending" ? (
                  <span className="c-3">not yet</span>
                ) : (
                  <>
                    <code title={hex}>
                      {hex.slice(0, 8)}…{hex.slice(-8)}
                    </code>
                    {matches === true ? <span className="c-2">, as stored</span> : matches === false ? <span className="c-danger">, differs from the draw</span> : null}
                  </>
                )}
              </Row>
            )}
            {settled && (
              <Row k="Settled">
                <SettleTxLine tx={tx} label="Settle transaction" />
              </Row>
            )}
            {legacyPot && <Row k="Instant SOL paid">{instantSol === null ? "…" : `${prizeSol(instantSol)} SOL`}</Row>}
            <Row k="Draw account">
              <ProofLink account={d.address}>{d.address.toBase58().slice(0, 4)}… on Solscan</ProofLink>
            </Row>
            <Row k="Vault">
              <ProofLink account={vault}>{vault.toBase58().slice(0, 4)}… on Solscan</ProofLink>
            </Row>
          </dl>
        </div>
        <div className="rec-side">
          {ph === "selling" && (
            <div className="card pad">
              <Meter d={d} />
              {d.legacy === null && (
                <p className="msg-act">
                  <Link className="btn btn-primary" href="/#entry">
                    Enter Draw № {d.id}
                  </Link>
                </p>
              )}
            </div>
          )}
          {(ph === "closed" || ph === "due" || ph === "drawing" || ph === "cancelled") && d.nextPos > 0 && (
            <div className="card pad">
              <Meter d={d} />
            </div>
          )}
          {settled && <Recompute d={d} entries={entries} entriesState={state} />}
        </div>
      </div>

      <Section
        id="entries"
        title="Every entry"
        lead={
          <>
            Each row is an Entry account of {drawName(d)} on devnet, so the list can’t be padded.
            {entries.length > 0 ? " Search by wallet or ticket number, or download them all." : ""}
          </>
        }
      >
        <div className="card">
          <EntryLedger d={d} entries={entries} state={state} onRetry={() => setNonce((x) => x + 1)} paged={false} me={wallet?.address} />
        </div>
      </Section>
    </>
  );
}
