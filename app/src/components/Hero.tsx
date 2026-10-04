"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { anyoneCanRun, cancelReason, cancelsAtRequest, canCancel, endPrize, endPrizeLocked, entryAtPosition, grandPrize, holdsWinner, phaseOf, publicFrom, remaining, scheduleTotals, type Phase } from "@/lib/derive";
import { campaignOf, usdWhole } from "@/lib/campaigns";
import { winningPosition } from "@/lib/fairness";
import { clock, sol, utcLabel } from "@/lib/format";
import { vaultPda } from "@/lib/chain";
import { CANCEL_GRACE_SECS, art } from "@/lib/config";
import type { DrawView } from "@/lib/types";
import { Addr, Busy, Check, ErrorNote, Pill, ProofLink, inFlight, phaseLabel } from "./bits";
import { EntryPanel, refundOf } from "./EntryPanel";
import { durationParts, localComma, n, plural, prizeFig, prizeSol, solRound, tnoOf, usd, usdPrize } from "./fmt";
import { useSettleTx } from "./Recompute";

const ZERO = BigInt(0);

/** The one draw card: the prize on the left, the sold meter and the entry panel on the right. */
export function Hero() {
  const { current: d, now } = useDrawSol();
  if (!d) return null;
  const ph = phaseOf(d, now);
  return (
    <section className={`hero card ph-${ph}`} id="draw" aria-labelledby="hero-h">
      <PrizeBlock d={d} ph={ph} />
      <div className="hero-panel" id="entry">
        {ph === "selling" && <EntryPanel d={d} />}
        {ph === "closed" && <ClosedPanel d={d} now={now} />}
        {ph === "due" && <DuePanel d={d} now={now} />}
        {ph === "drawing" && <DrawingPanel d={d} now={now} />}
        {ph === "settled" && <WinnerPanel d={d} />}
        {ph === "cancelled" && <CancelledPanel d={d} />}
      </div>
    </section>
  );
}

const STATUS: Record<Phase, [string, "accent" | "neutral" | "warn" | "dark"]> = {
  selling: ["Open", "accent"],
  closed: ["Sales closed", "neutral"],
  due: ["Draw due", "warn"],
  drawing: ["Drawing now", "warn"],
  settled: ["Settled", "dark"],
  cancelled: ["Cancelled", "neutral"],
};

/** "WIN $500 CASH" from the campaign map, beside the real escrow read from chain. */
function PrizeBlock({ d, ph }: { d: DrawView; ph: Phase }) {
  const { solUsd, vaultLamports, now } = useDrawSol();
  const camp = campaignOf(d.id);
  const [label, tone] = STATUS[ph];
  const escrow = d.endPrizeLamports;
  const escrowUsd = usd(escrow, solUsd);
  const instants = scheduleTotals(d);
  const locked = endPrizeLocked(d);
  const nowPrize = endPrize(d);
  const nowUsd = usd(nowPrize, solUsd);
  const price = usd(d.ticketPrice, solUsd);
  const local = useLocal(d.drawAt);
  const soldOut = d.nextPos >= d.ticketCap;
  // the headline is the campaign's nominal figure unless a guaranteed draw settled under its minimum
  const nominal = !!camp && !(ph === "settled" && d.guaranteed && d.paidTickets < d.minTickets);
  // the artwork was drawn for that figure, so it goes with the headline, never with a cancelled draw
  const artwork = nominal && ph !== "cancelled" ? camp!.art : undefined;
  return (
    <div className="hero-prize">
      <p className="badge-row">
        <Pill>Draw № {d.id}</Pill>
        <Pill tone={tone}>{ph === "closed" && soldOut ? "Sold out" : label}</Pill>
      </p>
      <h1 className="t-win" id="hero-h">
        {nominal ? (
          <>
            <span className="win-verb">{ph === "settled" ? "Won" : "Win"}</span> {usdWhole(camp.usd)} <span className="win-what">cash</span>
          </>
        ) : (
          <>
            <span className="win-verb">{ph === "settled" ? "Won" : "Win"}</span> {prizeFig(ph === "settled" ? grandPrize(d) : d.endPrizeLamports)} <span className="win-what">SOL</span>
          </>
        )}
        {instants.count > 0 && <span className="win-plus">+ {n(instants.count)} instant prizes</span>}
      </h1>
      <p className="hero-sub">
        {ph === "settled" ? (
          <>
            Paid in SOL: <b className="nw">{prizeFig(grandPrize(d))} SOL</b> to <Addr k={d.winner} link />
            {d.guaranteed && d.paidTickets < d.minTickets ? <span className="hero-usd"> · {d.potBps / 100}% of sales, under the {n(d.minTickets)}-ticket minimum</span> : null}
          </>
        ) : d.guaranteed && ph !== "selling" ? (
          <>
            {locked ? (
              <>
                <b>{camp ? usdWhole(camp.usd) : `${prizeFig(d.endPrizeLamports)} SOL`} locked in</b>: {n(d.minTickets)} tickets sold ·{" "}
                <ProofLink account={vaultPda(d.address)}>{sol(escrow, 2, 2)} SOL in the vault</ProofLink>
              </>
            ) : (
              <>
                End prize <b className="c-accent nw">{nowUsd ?? `${sol(nowPrize, 2, 3)} SOL`}</b>: {d.potBps / 100}% of ticket sales, under the {n(d.minTickets)}-ticket minimum ·{" "}
                <ProofLink account={vaultPda(d.address)}>vault</ProofLink>
              </>
            )}
          </>
        ) : d.guaranteed ? (
          <>
            {locked ? (
              <>
                <b>{camp ? usdWhole(camp.usd) : `${prizeFig(d.endPrizeLamports)} SOL`} locked in</b>: {n(d.minTickets)} tickets have sold ·{" "}
                <ProofLink account={vaultPda(d.address)}>{sol(escrow, 2, 2)} SOL in the vault</ProofLink>
              </>
            ) : (
              <>
                End prize right now <b className="c-accent nw">{nowUsd ?? `${sol(nowPrize, 2, 3)} SOL`}</b> · becomes {camp ? usdWhole(camp.usd) : `${prizeFig(d.endPrizeLamports)} SOL`} at{" "}
                {n(d.minTickets)} sold · <ProofLink account={vaultPda(d.address)}>{sol(escrow, 2, 2)} SOL escrowed</ProofLink>
              </>
            )}
          </>
        ) : ph === "cancelled" ? (
          <>
            {d.nextPos === 0 ? "No tickets were sold." : "Not drawn."} The {prizeFig(escrow)} SOL prize went back to the operator; every paid ticket is refunded (net of any
            instant prize it already won) from the <ProofLink account={vaultPda(d.address)}>vault</ProofLink>.
          </>
        ) : (
          <>
            Paid in SOL · <ProofLink account={vaultPda(d.address)}>{sol(escrow, 2, 2)} SOL locked in the vault</ProofLink>
            {escrowUsd && camp ? <span className="hero-usd"> · ≈{escrowUsd} at today’s SOL price</span> : null}
          </>
        )}
      </p>

      {artwork && (
        <figure className="hero-art">
          <img src={art(artwork.file)} alt={artwork.alt} width={1600} height={1341} decoding="async" />
        </figure>
      )}

      <dl className="hero-facts">
        <div>
          <dt>Ticket price</dt>
          <dd>
            {price ? (
              <>
                <b>{price}</b> <span className="sub nw">{sol(d.ticketPrice, 2, 5)} SOL</span>
              </>
            ) : (
              <b className="nw">{sol(d.ticketPrice, 2, 5)} SOL</b>
            )}
          </dd>
        </div>
        <div>
          <dt>{ph === "settled" ? "Drawn" : ph === "cancelled" ? "Draw time" : "Draws"}</dt>
          <dd>
            <b className="nw">{utcLabel(ph === "settled" ? d.settledAt : d.drawAt)}</b>
            {local && ph !== "settled" ? <span className="sub nw">{local} your time</span> : null}
          </dd>
        </div>
        {(ph === "selling" || ph === "closed") && (
          <div>
            <dt>Time left</dt>
            <dd>
              <Countdown secs={d.drawAt - now} />
            </dd>
          </div>
        )}
        {ph === "settled" && (
          <div>
            <dt>Winning ticket</dt>
            <dd>
              <b className="c-accent tab">{tnoOf(d, d.winningTicket)}</b> <span className="sub">of {n(d.nextPos)}</span>
            </dd>
          </div>
        )}
        {ph === "cancelled" && (
          <div>
            <dt>Refunded so far</dt>
            <dd>
              <b className="nw">{sol(d.refundedLamports, 2, 4)}</b> <span className="sub nw">of {sol(d.revenueLamports, 2, 4)} SOL</span>
            </dd>
          </div>
        )}
      </dl>
      {d.schedule.length > 0 && ph !== "settled" && ph !== "cancelled" && (
        <p className="hero-instants">
          <b>{n(instants.count)} instant prizes</b>, {usdPrize(instants.total, solUsd) ?? `${solRound(instants.total, 3, 2)} SOL`} in all:{" "}
          {d.schedule.map((t) => `${usdPrize(t.lamports, solUsd) ?? `${prizeSol(t.lamports)} SOL`} ×${t.numbers.length}`).join(" · ")}. Winning numbers published before sales;
          yours are assigned at random when you reveal.{" "}
          <a className="tbtn" href="#prizes">
            See the numbers
          </a>
        </p>
      )}
      {d.schedule.length === 0 && (ph === "selling" || ph === "closed") && (
        <ul className="hero-promise">
          <li>
            <Check size={14} /> {d.guaranteed ? `Draws ${utcLabel(d.drawAt)} whatever has sold` : `Drawn at the deadline once ${n(d.minTickets)} tickets sell`}
          </li>
          <li>
            <Check size={14} /> {d.guaranteed ? `Full prize once ${n(d.minTickets)} sell, else ${d.potBps / 100}% of sales` : "Otherwise everyone is refunded in full, enforced by the program"}
          </li>
          <li>
            <Check size={14} /> Winner picked by ORAO VRF; anyone can recompute it
          </li>
        </ul>
      )}
      {vaultLamports !== null && ph !== "settled" && (
        <p className="hero-vault">
          The vault holds <span className="nw">{sol(vaultLamports, 2, 3)} SOL</span> right now: {d.revenueLamports > ZERO && ph !== "cancelled" ? "the escrowed prize and ticket sales so far" : ph === "cancelled" ? "refunds still to be claimed" : "the escrowed prize"}.
        </p>
      )}
    </div>
  );
}

/** "2d 14h 31m" (under an hour: "14m 05s"), ticking; the aria-label is updated once a minute. */
export function Countdown({ secs, className = "" }: { secs: number; className?: string }) {
  const t = durationParts(secs);
  const minuteKey = Math.floor(secs / 60);
  const [label, setLabel] = useState("");
  useEffect(() => {
    const parts = t.d > 0 ? [[t.d, "day"], [t.h, "hour"], [t.m, "minute"]] : t.h > 0 ? [[t.h, "hour"], [t.m, "minute"]] : [[t.m, "minute"], [t.s, "second"]];
    const words = (parts as [number, string][]).map(([k, w]) => `${k} ${w}${k === 1 ? "" : "s"}`);
    setLabel(`${words.join(", ")} left`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey]);
  if (secs <= 0)
    return (
      <b className={`cd ${className}`} role="timer" aria-label="The draw time has passed">
        now
      </b>
    );
  return (
    <b className={`cd tab ${className}`} role="timer" aria-live="off" aria-label={label}>
      {t.d > 0 && (
        <span className="cd-seg">
          {t.d}
          <span className="cd-u">d</span>
        </span>
      )}
      {(t.d > 0 || t.h > 0) && (
        <span className="cd-seg">
          {t.d > 0 ? String(t.h).padStart(2, "0") : t.h}
          <span className="cd-u">h</span>
        </span>
      )}
      <span className="cd-seg">
        {t.d > 0 || t.h > 0 ? String(t.m).padStart(2, "0") : t.m}
        <span className="cd-u">m</span>
      </span>
      {t.d === 0 && (
        <span className="cd-seg">
          {String(t.s).padStart(2, "0")}
          <span className="cd-u">s</span>
        </span>
      )}
    </b>
  );
}

/** Local time, only when the viewer isn’t on UTC. Client-only, so the prerender stays stable. */
export function useLocal(unix: number) {
  const [s, setS] = useState<string | null>(null);
  useEffect(() => setS(localComma(unix)), [unix]);
  return s;
}

/** The sold meter: "27%" · "312 / 1,150 tickets sold", the bar, the minimum tick, the note. */
export function Meter({ d, compact = false }: { d: DrawView; compact?: boolean }) {
  const { staleSince } = useDrawSol();
  const pct = d.ticketCap > 0 ? (d.paidTickets / d.ticketCap) * 100 : 0;
  const minPct = d.ticketCap > 0 ? (d.minTickets / d.ticketCap) * 100 : 0;
  const short = Math.max(0, d.minTickets - d.paidTickets);
  const over = d.status === "settled" || d.status === "cancelled";
  const headline = d.minTickets > 0;
  const note = !headline
    ? `${n(remaining(d))} left`
    : d.guaranteed
      ? over
        ? d.paidTickets >= d.minTickets
          ? `Reached the ${n(d.minTickets)} that locks in the full end prize`
          : `Stayed under ${n(d.minTickets)}: the end prize was ${d.potBps / 100}% of sales`
        : short > 0
          ? `${n(d.minTickets)} sold unlocks the full end prize · ${n(short)} to go`
          : `Full end prize locked in · ${n(remaining(d))} left`
    : over
      ? d.paidTickets >= d.minTickets
        ? `Reached the ${n(d.minTickets)} it needed to draw`
        : `Needed ${n(d.minTickets)} to draw`
      : short > 0
        ? `Needs ${n(d.minTickets)} to draw · ${n(short)} more to go`
        : `Minimum of ${n(d.minTickets)} reached · it will draw`;
  return (
    <div className={`meter ${compact ? "compact" : ""}`}>
      <div className="meter-row">
        <b className="meter-pct tab">{Math.floor(pct)}%</b>
        <span className="meter-sold tab">
          <b>{n(d.paidTickets)}</b> / {n(d.ticketCap)} tickets sold
          {staleSince !== null && <span className="asof"> (as of the last read)</span>}
        </span>
      </div>
      <div
        className="meter-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={d.ticketCap}
        aria-valuenow={d.paidTickets}
        aria-label={`${d.paidTickets} of ${d.ticketCap} paid tickets sold${headline ? `; ${d.minTickets} needed to draw` : ""}`}
      >
        <span className="meter-fill" style={{ width: `${Math.min(100, pct)}%` }} />
        {headline && d.minTickets < d.ticketCap && <span className="meter-min" style={{ left: `${minPct}%` }} title={d.guaranteed ? `Full end prize at ${n(d.minTickets)}` : `Minimum to draw: ${n(d.minTickets)}`} />}
      </div>
      <p className="meter-note">
        {note}
        {d.freeTickets > 0 ? ` · plus ${d.freeTickets} free ${plural(d.freeTickets, "entry", "entries")}` : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ states after sales */

/** The wallet's tickets in this draw, as a one-liner for the closed states. */
function YourEntryLine() {
  const { myEntries, wallet, myState } = useDrawSol();
  if (!wallet || myState !== "ready") return null;
  const k = myEntries.reduce((s, e) => s + e.count, 0);
  if (k === 0) return <p className="panel-you">You hold no tickets in this draw.</p>;
  return (
    <p className="panel-you">
      You hold <b>{k} {plural(k, "ticket", "tickets")}</b> in this draw.{" "}
      <a className="tbtn" href="#my-tickets">
        See them
      </a>
    </p>
  );
}

function ClosedPanel({ d, now }: { d: DrawView; now: number }) {
  const soldOut = d.nextPos >= d.ticketCap;
  const undersold = d.legacy === "headline" && d.paidTickets < d.minTickets;
  return (
    <div className="panel">
      <Meter d={d} />
      <h2 className="t-h3 panel-h">{soldOut ? "Sold out" : "Sales closed"}</h2>
      <p className="panel-big">
        Draws in <Countdown secs={d.drawAt - now} />
      </p>
      <p className="panel-text">
        {soldOut ? "Every ticket has sold." : "Sales closed at the deadline."} The draw waits for its time, <span className="nw">{utcLabel(d.drawAt)}</span>: it
        is never drawn early.
        {undersold ? ` With fewer than ${n(d.minTickets)} paid tickets then, it is cancelled and everyone is refunded in full.` : ""}
        {d.guaranteed && d.paidTickets < d.minTickets ? ` Under ${n(d.minTickets)} sold, the end prize is ${d.potBps / 100}% of ticket sales.` : ""}
      </p>
      <YourEntryLine />
    </div>
  );
}

/** The draw time has passed: the keeper (or the operator) runs it first, then anyone may. */
function DuePanel({ d, now }: { d: DrawView; now: number }) {
  const { phase, errors, runDraw, clearError, disabledReason } = useActions();
  const { costs, config, wallet } = useDrawSol();
  const ph = phase.run;
  const busy = inFlight(ph);
  const open = anyoneCanRun(d, now);
  const privileged = !!wallet && (d.authority.equals(wallet.address) || (!!config?.keeper && config.keeper.equals(wallet.address)));
  const cancels = cancelsAtRequest(d);
  const empty = d.nextPos === 0;
  const verb = empty ? "Close the draw" : cancels ? "Cancel and refund" : "Run the draw";
  return (
    <div className="panel">
      <Meter d={d} />
      <h2 className="t-h3 panel-h">{empty ? "Nothing to draw" : cancels ? "Below the minimum" : "Draw time has passed"}</h2>
      <p className="panel-text">
        {empty ? (
          <>No tickets were sold, so there is nothing to draw. Closing it returns the prize to the operator.</>
        ) : cancels ? (
          <>
            Only {n(d.paidTickets)} of the {n(d.minTickets)} paid tickets it needed sold. Running it now cancels it: the prize goes back to the operator and every
            paid ticket can be refunded in full.
          </>
        ) : (
          <>The randomness comes from ORAO VRF; nobody can choose it, us included.</>
        )}{" "}
        {open ? <>Anyone can do it now.</> : <>The operator’s keeper does it first; from {clock(publicFrom(d))} UTC anyone can.</>}
      </p>
      <button type="button" className="btn btn-primary btn-xl btn-block" onClick={runDraw} disabled={busy || !!disabledReason || !(open || privileged)}>
        {busy && <Busy />}
        {phaseLabel(ph, open || privileged ? verb : `Open to anyone from ${clock(publicFrom(d))} UTC`)}
      </button>
      {costs.oraoFee !== null && !cancels && (open || privileged) && <p className="fee-plain">+ ≈{solRound(costs.oraoFee, 4, 1)} SOL randomness fee, paid by whoever runs it</p>}
      {disabledReason && <p className="helper">{disabledReason}</p>}
      {errors.run && <ErrorNote onDismiss={() => clearError("run")}>{errors.run.message}</ErrorNote>}
      <YourEntryLine />
    </div>
  );
}

function DrawingPanel({ d, now }: { d: DrawView; now: number }) {
  const { drawRandomness: r, entries } = useDrawSol();
  const { phase, errors, settle, cancel, clearError, disabledReason } = useActions();
  const ready = !!r?.fulfilled && !!r.randomness;
  // the randomness picks a position; the ticket number at it is read from the entry that holds it
  const pos = ready ? winningPosition(r!.randomness!, d.nextPos) : null;
  const hit = pos !== null ? entryAtPosition(entries, pos) : null;
  const w = hit && hit.revealed ? hit.tickets[pos! - hit.firstPos] : null;
  const sp = phase.settle;
  const busy = inFlight(sp);
  const cancellable = canCancel(d, now);
  const cp = phase.cancel;
  return (
    <div className="panel">
      <h2 className="t-h3 panel-h">Drawing now</h2>
      <ol className="steps">
        <li className="done">
          <span className="mk">
            <Check />
          </span>
          <span>
            Randomness requested from ORAO for {n(d.nextPos)} tickets · <ProofLink account={d.drawVrfRequest}>request</ProofLink>
          </span>
        </li>
        <li className={ready ? "done" : "now"}>
          <span className="mk">{ready ? <Check /> : <Busy />}</span>
          <span>{ready ? "Randomness landed" : "Waiting for ORAO, usually a few seconds"}</span>
        </li>
        <li className={ready ? "now" : "todo"}>
          <span className="mk">3</span>
          <span>
            {w !== null ? (
              <>
                Winning ticket <b className="c-accent tab">{tnoOf(d, w)}</b> (position {n(pos!)}), computed from the randomness. Settling pays {prizeFig(grandPrize(d))} SOL to its owner.
              </>
            ) : pos !== null ? (
              <>
                Position <b className="c-accent tab">{n(pos)}</b> wins, computed from the randomness. {hit ? `Entry ${hit.seq} holds it but isn’t revealed yet; settling reveals it first.` : "Reading the entry that holds it…"}{" "}
                Settling pays {prizeFig(grandPrize(d))} SOL to its owner.
              </>
            ) : (
              <>Settle: pays {prizeFig(grandPrize(d))} SOL to the winning ticket. Anyone can do it.</>
            )}
          </span>
        </li>
      </ol>
      <button type="button" className="btn btn-primary btn-xl btn-block" onClick={settle} disabled={!ready || busy || !!disabledReason}>
        {busy && <Busy />}
        {!ready ? "Waiting for ORAO…" : phaseLabel(sp, "Settle the draw")}
      </button>
      {errors.settle && <ErrorNote onDismiss={() => clearError("settle")}>{errors.settle.message}</ErrorNote>}
      {!ready && (
        <p className="helper">
          {cancellable ? (
            <>Randomness never arrived within 48 h. Anyone can cancel now; every paid ticket becomes refundable.</>
          ) : (
            <>
              If randomness hasn’t arrived by <span className="nw">{utcLabel(d.drawAt + CANCEL_GRACE_SECS)}</span>, anyone can cancel and every paid ticket is refunded.
            </>
          )}
        </p>
      )}
      {cancellable && (
        <button type="button" className="btn btn-outline btn-block" onClick={cancel} disabled={inFlight(cp) || !!disabledReason}>
          {inFlight(cp) && <Busy />}
          {phaseLabel(cp, "Cancel the draw")}
        </button>
      )}
      {errors.cancel && <ErrorNote onDismiss={() => clearError("cancel")}>{errors.cancel.message}</ErrorNote>}
      <YourEntryLine />
    </div>
  );
}

/** Settled: the winner card. */
function WinnerPanel({ d }: { d: DrawView }) {
  const { myEntries, myState, wallet } = useDrawSol();
  const tx = useSettleTx(d);
  const mine = myEntries.some((e) => holdsWinner(d, e));
  const notMine = !!wallet && myState === "ready" && !mine;
  return (
    <div className="panel winner">
      <img className="winner-bg" src={art("confetti.png")} alt="" aria-hidden="true" width={1600} height={900} decoding="async" />
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
            <b className="nw">{prizeFig(grandPrize(d))} SOL</b>
          </dd>
        </div>
        <div>
          <dt>Settled</dt>
          <dd className="nw">{utcLabel(d.settledAt)}</dd>
        </div>
      </dl>
      {mine && <p className="panel-you accent">You hold the winning ticket. {prizeFig(grandPrize(d))} SOL was paid to your wallet.</p>}
      {notMine && <p className="panel-you">Not one of yours this time.</p>}
      <p className="winner-links">
        {tx?.kind === "found" ? (
          <ProofLink tx={tx.sig}>Prize transaction</ProofLink>
        ) : tx?.kind === "none" ? (
          <span className="c-3">The RPC has no settle transaction indexed.</span>
        ) : tx?.kind === "error" ? (
          <span className="c-3">
            Couldn’t find the prize transaction.{" "}
            <button type="button" className="tbtn" onClick={tx.retry}>
              Try again
            </button>
          </span>
        ) : (
          <span className="c-3">
            <Busy /> Finding the prize transaction…
          </span>
        )}
        <Link className="tbtn" href={`/draw/?n=${d.id}#recompute`}>
          Recompute the result
        </Link>
      </p>
    </div>
  );
}

function CancelledPanel({ d }: { d: DrawView }) {
  const { myEntries, wallet, myState } = useDrawSol();
  const paid = myEntries.filter((e) => !e.isFree);
  const owed = paid.filter((e) => !e.refunded).reduce((s, e) => s + refundOf(e), ZERO);
  const back = paid.filter((e) => e.refunded).reduce((s, e) => s + refundOf(e), ZERO);
  const empty = d.nextPos === 0;
  const why = cancelReason(d);
  return (
    <div className="panel">
      {!empty && <Meter d={d} />}
      <h2 className="t-h3 panel-h">{empty ? "Closed with no tickets" : "Refunds are open"}</h2>
      <p className="panel-text">
        {empty
          ? "Nobody bought a ticket, so there was nothing to draw. The prize went back to the operator."
          : why === "undersold"
            ? `Only ${n(d.paidTickets)} of the ${n(d.minTickets)} paid tickets it needed sold by the draw time, so it was cancelled. Every paid ticket is refunded in full. There is no deadline.`
            : "The randomness never arrived within 48 h of the draw time, so the draw was cancelled. Every paid ticket can be refunded, net of any instant prize it already won. There is no deadline."}
      </p>
      {!empty && (
        <>
          <dl className="panel-sum">
            <div>
              <dt>Your refund</dt>
              <dd>
                {!wallet ? (
                  <span className="c-3">Connect a wallet to check</span>
                ) : myState !== "ready" ? (
                  <span className="c-3">{myState === "error" ? "Can’t read your tickets right now" : "Reading your tickets…"}</span>
                ) : paid.length === 0 ? (
                  <span className="c-3">No paid tickets in this draw</span>
                ) : owed > ZERO ? (
                  <b className="nw">{sol(owed, 2, 4)} SOL</b>
                ) : (
                  <span>
                    <b className="nw">{sol(back, 2, 4)} SOL</b> refunded
                  </span>
                )}
              </dd>
            </div>
          </dl>
          {wallet && owed > ZERO && (
            <a className="btn btn-primary btn-xl btn-block" href="#my-tickets">
              Claim your refund
            </a>
          )}
          <p className="helper">Each refund is its own transaction. Anyone can send it, and it always pays the ticket’s owner.</p>
        </>
      )}
    </div>
  );
}

export function phaseText(ph: Phase): string {
  return STATUS[ph][0];
}
