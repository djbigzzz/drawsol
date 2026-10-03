"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useDrawSol } from "@/hooks/context";
import { anyoneCanRun, grandPrize, headlineHouseBps, pct, phaseOf, publicFrom, remaining, type Phase } from "@/lib/derive";
import { clock, shortDate, sol, ticketNo, utcLabel } from "@/lib/format";
import { winningTicket } from "@/lib/fairness";
import { vaultPda } from "@/lib/chain";
import { inkAt } from "@/lib/print";
import type { DrawView } from "@/lib/types";
import { InstantTable } from "./InstantWins";
export { prizeFig } from "./fmt";
import { Addr, ProofLink } from "./bits";
import { BuyPanel } from "./BuyPanel";
import { drawName, prizeFig, durationParts, kindName, localComma, plural, stampDay, longDay, utcHhmm } from "./fmt";
import { Barcode, yoursText } from "./print/Barcode";
import { Microtext, Specimen } from "./print/Mark";
import { NumberWheel } from "./print/NumberWheel";
import { Stamp } from "./print/Stamp";
import { Holes, useSettleTx } from "./SettledTicket";

const serial = (id: number) => `Nº ${String(id).padStart(4, "0")}`;
const ZERO = BigInt(0);

/** The hero: the lede on the left, the draw ticket (body + stub) on the right. */
export function Hero() {
  return (
    <div className="hero">
      <Lede />
      <DrawTicket />
    </div>
  );
}

/** "55% house · 35% pot · 10% instant wins" */
export const splitLine = (d: DrawView) => `${pct(d.houseBps)} house · ${pct(d.potBps)} pot · ${pct(d.instantBps)} instant wins`;


/** "Draws on Sun 4 Oct, 20:00 UTC once 120 tickets sell. Otherwise everyone is refunded in full." */
export function HeadlinePromise({ d }: { d: DrawView }) {
  return (
    <>
      Draws on <span className="nw">{utcLabel(d.drawAt)}</span> once {d.minTickets} tickets sell. Otherwise everyone is refunded in full.
    </>
  );
}

/* ------------------------------------------------------------------ lede */

export function Lede() {
  const { current: d, now, drawRandomness: r, entries, entriesState } = useDrawSol();
  if (!d) return null;
  const ph = phaseOf(d, now);
  const n = drawName(d);
  const pot = d.kind === "pot";
  const prize = <span className="nw">{prizeFig(grandPrize(d))} SOL</span>;
  const fulfilled = ph === "drawing" && !!r?.fulfilled && !!r.randomness;
  const copy: Record<Phase, [string, ReactNode]> = {
    selling: [
      `${n} is open.`,
      pot ? (
        <>
          The pot grows with every paid ticket: {pct(d.potBps)} of each one, plus whatever the instant pool doesn’t pay out. It draws on{" "}
          <span className="nw">{utcLabel(d.drawAt)}</span>.
        </>
      ) : (
        <>
          One prize of {prize}, escrowed in the vault when the draw opened, and no instant wins. It needs {d.minTickets} paid tickets by the draw time.
        </>
      ),
    ],
    closed: [
      `${n} has closed.`,
      <>
        Sales are over: {d.paidTickets >= d.ticketCap ? "every paid ticket sold" : "the deadline passed"}. It draws at{" "}
        <span className="nw">{utcLabel(d.drawAt)}</span>, not before.
      </>,
    ],
    due: [
      `${n} is due.`,
      anyoneCanRun(d, now) ? (
        <>The draw time has passed and the operator’s keeper hasn’t run it, so anyone can run it now.</>
      ) : (
        <>
          The draw time has passed. The operator’s keeper runs it first; from <span className="nw">{clock(publicFrom(d))} UTC</span> anyone can.
        </>
      ),
    ],
    drawing: [
      `${n} is being drawn.`,
      fulfilled ? (
        <>
          ORAO’s randomness has landed and picks ticket <span className="nw">{ticketNo(winningTicket(r!.randomness!, d.nextTicket))}</span>. Anyone can settle the draw
          now to pay the winner {prize}.
        </>
      ) : (
        <>Randomness has been requested from ORAO. Once it lands, anyone can settle the draw and pay the winner.</>
      ),
    ],
    settled: [
      `${n} is settled.`,
      <>
        Ticket <span className="nw">{ticketNo(d.winningTicket)}</span> won {prize}.
      </>,
    ],
    cancelled: [
      `${n} was cancelled.`,
      d.nextTicket === 0 ? (
        <>No ticket was sold, so there was nothing to draw.</>
      ) : d.kind === "headline" && d.paidTickets < d.minTickets ? (
        <>
          Only {d.paidTickets} of the {d.minTickets} tickets it needed sold, so it didn’t draw. Everyone is refunded in full.
        </>
      ) : (
        <>The randomness never arrived in time, so every paid ticket can be refunded.</>
      ),
    ],
  };
  const [h, s] = copy[ph];
  return (
    <aside className="lede">
      <div>
        <h1 className="t-lede-h">{h}</h1>
        <p className="t-lede">{s}</p>
      </div>
      {pot && ph !== "cancelled" && <InstantTable d={d} entries={entries} state={entriesState} selling={ph === "selling"} />}
      {d.kind === "headline" && ph !== "cancelled" && ph !== "settled" && <HeadlineTerms d={d} />}
    </aside>
  );
}

/** How a headline draw pays: the escrow, the minimum, the house share at sell-out and at the minimum. */
function HeadlineTerms({ d }: { d: DrawView }) {
  const atCap = headlineHouseBps(d, d.ticketCap);
  const atMin = headlineHouseBps(d, d.minTickets);
  return (
    <div className="odds">
      <p className="odds-head">
        <b>How this draw pays</b>
        <i>no instant wins</i>
      </p>
      <dl className="ledger odds-ledger">
        <div>
          <dt>Grand prize, escrowed</dt>
          <dd>{prizeFig(d.prizeLamports)} SOL</dd>
        </div>
        <div>
          <dt>Minimum to draw</dt>
          <dd>
            {d.minTickets} paid {plural(d.minTickets, "ticket", "tickets")}
          </dd>
        </div>
        {atCap !== null && (
          <div>
            <dt>House share at sell-out</dt>
            <dd>{pct(atCap)}</dd>
          </div>
        )}
        {atMin !== null && (
          <div>
            <dt>House share at the minimum</dt>
            <dd>{pct(atMin)}</dd>
          </div>
        )}
      </dl>
      <p className="odds-notes t-small">
        A headline draw has no instant wins: a draw that can still be refunded never pays anything out first. Below the minimum at the draw time, it is
        cancelled, the prize goes back to the operator and every paid ticket is refunded.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ ticket */

export function DrawTicket() {
  const { current: d, now, vaultLamports, entries, entriesState, myEntries } = useDrawSol();
  const settleTx = useSettleTx(d);
  if (!d) return null;
  const ph = phaseOf(d, now);
  const settled = ph === "settled";
  const cancelled = ph === "cancelled";
  const pot = d.kind === "pot";

  const mine = myEntries.flatMap((e) => Array.from({ length: e.count }, (_, i) => e.firstTicket + i));
  const free = entriesState === "ready" ? entries.filter((e) => e.isFree).map((e) => e.firstTicket) : [];
  const left = remaining(d);
  const extra = d.freeTickets + d.creditTickets;
  const barLabel =
    `${d.paidTickets} of ${d.ticketCap} paid tickets sold` +
    (d.freeTickets > 0 ? `, plus ${d.freeTickets} free ${plural(d.freeTickets, "entry", "entries")}` : "") +
    (d.creditTickets > 0 ? ` and ${d.creditTickets} credit ${plural(d.creditTickets, "ticket", "tickets")}` : "") +
    "." +
    (d.kind === "headline" ? ` It needs ${d.minTickets} paid tickets to draw.` : "") +
    (settled ? ` Ticket ${ticketNo(d.winningTicket)} was drawn.` : "") +
    yoursText(mine);

  const vault = vaultLamports !== null ? `${sol(vaultLamports, 2, 3)} SOL` : null;
  // a pot draw's figure is the pot itself; its instant pool is the line under it, and joins at the draw
  const figure = pot && !settled ? d.potLamports : grandPrize(d);
  const prize = prizeFig(figure);
  const prizeLabel = settled
    ? "Grand prize, paid"
    : cancelled
      ? pot
        ? "Pot, not awarded"
        : "Prize, not awarded"
      : pot
        ? ph === "selling"
          ? "The pot, and rising"
          : "The pot"
        : "Grand prize";

  return (
    <article className={`ticket ph-${ph} kind-${d.kind}`} aria-labelledby="ticket-h">
      <div className="tk-body">
        <div className="tk-head">
          <span className="t-ticket-head" id="ticket-h">
            DrawSol · {kindName(d.kind)}
          </span>
          <span className="t-serial tk-serial">{serial(d.id)}</span>
        </div>
        <span className="tk-headrule" aria-hidden="true">
          <span className="top" />
          <Microtext />
        </span>
        {settled && <Holes />}

        {/* prize block */}
        <div className="tk-prize">
          <p className="t-label">{prizeLabel}</p>
          <div className="tk-prize-row">
            <p className={`t-prize ${cancelled ? "dim" : ""} ${prize.length > 3 ? "long" : ""}`} aria-label={`${prize} SOL`}>
              {prize}
              <span className="u">SOL</span>
            </p>
            {settled ? (
              <Stamp
                kind="drawn"
                className="stamp-hero drawn"
                seed={inkAt(d.randomness, 0)}
                label={`Stamped: drawn ${longDay(d.settledAt)}`}
                mid={stampDay(d.settledAt)}
                bottom={`DRAW Nº ${d.id}`}
              />
            ) : cancelled ? (
              <Stamp kind="cancelled" className="stamp-hero" seed={inkAt(d.address.toBytes(), 16)} label="Stamped: cancelled, refunds open" top={`DRAW Nº ${d.id}`} />
            ) : (
              <Stamp
                kind="locked"
                className="stamp-hero"
                seed={inkAt(d.address.toBytes(), 0)}
                label={pot ? "Stamped: pot locked in the vault" : "Stamped: prize locked in the vault"}
                top={`${pot ? "POT" : "PRIZE"} · DRAW Nº ${d.id}`}
              />
            )}
          </div>
          {pot && !settled && !cancelled && (
            <p className="tk-pool t-small">
              {d.instantPoolLamports > ZERO ? (
                <>
                  Plus <span className="nw b">{sol(d.instantPoolLamports, 2, 4)} SOL</span> in the instant pool. Unwon instant pool rolls into the pot.
                </>
              ) : (
                <>The instant pool is empty right now. Unwon instant pool rolls into the pot.</>
              )}
            </p>
          )}
          {d.kind === "headline" && (ph === "selling" || ph === "closed") && (
            <p className="tk-pool t-small">
              <HeadlinePromise d={d} />
            </p>
          )}
        </div>

        {/* proofline: exactly one proof link on the ticket face */}
        <p className="tk-proof t-body tk-proofline">
          {settled ? (
            <>
              <strong>
                Paid from the vault on{" "}
                <span className="nw">
                  {shortDate(d.settledAt)}, {clock(d.settledAt)} UTC
                </span>
                .
              </strong>{" "}
              <br />
              {settleTx?.kind === "found" ? (
                <ProofLink tx={settleTx.sig}>Prize transaction</ProofLink>
              ) : settleTx?.kind === "none" ? (
                <span className="c-ink-3">The RPC has no settle transaction indexed for this draw.</span>
              ) : settleTx?.kind === "error" ? (
                <span className="c-ink-3">
                  Couldn’t search for the prize transaction.{" "}
                  <button type="button" className="tbtn" onClick={settleTx.retry}>
                    Try again
                  </button>
                </span>
              ) : null}
            </>
          ) : cancelled ? (
            <>
              <strong>This draw was cancelled before a winner was drawn.</strong> Every paid ticket can claim a refund from the vault
              {vault ? (
                <>
                  , which holds <span className="nw">{vault}</span>
                </>
              ) : null}
              .<br />
              <ProofLink account={vaultPda(d.address)}>Check the vault on Solscan</ProofLink>
            </>
          ) : pot ? (
            <>
              <strong>Every lamport is in the program vault.</strong>{" "}
              {vault ? (
                <>
                  It holds <span className="nw">{vault}</span>: the pot, the instant pool and the house share.
                </>
              ) : null}
              <br />
              <ProofLink account={vaultPda(d.address)}>Check the vault on Solscan</ProofLink>
            </>
          ) : (
            <>
              <strong>Escrowed in the program vault when the draw opened.</strong>{" "}
              {vault ? (
                <>
                  The vault holds <span className="nw">{vault}</span>: {d.revenueLamports > ZERO ? "the prize and sales so far" : "the prize"}.
                </>
              ) : null}
              <br />
              <ProofLink account={vaultPda(d.address)}>Check the vault on Solscan</ProofLink>
            </>
          )}
        </p>
        {pot && <p className="tk-split t-small">{splitLine(d)}, every lamport on-chain.</p>}

        <span className="dbl tk-facts-rule" aria-hidden="true" />
        <div className="tk-facts">
          <FactLeft d={d} ph={ph} now={now} />
          <FactRight d={d} ph={ph} />
        </div>

        <div className="tk-bar">
          <Barcode
            slots={d.ticketCap + extra}
            taken={d.nextTicket}
            free={free}
            mine={mine}
            drawn={settled ? d.winningTicket : -1}
            minAt={d.kind === "headline" && d.paidTickets < d.minTickets && ph !== "cancelled" ? d.minTickets + extra : undefined}
            minLabel={`min ${d.minTickets}`}
            label={barLabel}
            leftLabel={ph === "selling" ? `${left} left` : left > 0 ? `${left} unsold` : undefined}
          />
        </div>
        <Specimen />
      </div>
      <BuyPanel />
    </article>
  );
}

/* ------------------------------------------------------------------ facts */

export function Countdown({ secs, verb = "Closes", className = "t-fact" }: { secs: number; verb?: string; className?: string }) {
  const t = durationParts(secs);
  const [label, setLabel] = useState("");
  const minuteKey = Math.floor(secs / 60);
  useEffect(() => {
    const parts = t.d > 0 ? [[t.d, "day"], [t.h, "hour"], [t.m, "minute"]] : t.h > 0 ? [[t.h, "hour"], [t.m, "minute"]] : [[t.m, "minute"], [t.s, "second"]];
    const words = (parts as [number, string][]).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`);
    setLabel(`${verb} in ${words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]}`);
    // updated once a minute (the aria-label is off the live region)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey, verb]);
  const underHour = secs < 3600;
  return (
    <p className="fig" role="timer" aria-live="off" aria-label={label}>
      {underHour ? (
        <>
          <NumberWheel className={className} value={String(t.m)} />
          <span className="unit">min</span>
          <NumberWheel className={className} value={String(t.s).padStart(2, "0")} seconds />
          <span className="unit">s left</span>
        </>
      ) : (
        <>
          {t.d > 0 && (
            <>
              <NumberWheel className={className} value={String(t.d)} />
              <span className="unit">d</span>
            </>
          )}
          <NumberWheel className={className} value={String(t.h)} />
          <span className="unit">h</span>
          <NumberWheel className={className} value={String(t.m).padStart(t.d > 0 || t.h > 0 ? 2 : 1, "0")} />
          <span className="unit">min left</span>
        </>
      )}
    </p>
  );
}

function FactLeft({ d, ph, now }: { d: DrawView; ph: Phase; now: number }) {
  const { drawRandomness: r } = useDrawSol();
  const local = useLocal(d.drawAt);
  const sameTime = d.closesAt === d.drawAt;
  if (ph === "selling")
    return (
      <div className="fact fact-time">
        <Countdown secs={d.closesAt - now} />
        <p className="abs">
          {sameTime ? "Draws" : "Sales close"} <span className="nw">{utcLabel(d.closesAt)}</span>
        </p>
        <p className="note note-d">
          {sameTime ? (
            <>Sales close then, or at sell-out; the draw is at that time either way.</>
          ) : (
            <>
              Or at sell-out. The draw is at <span className="nw">{utcLabel(d.drawAt)}</span>.
            </>
          )}
          {local ? (
            <>
              {" "}
              That’s <span className="nw">{local}</span> your time.
            </>
          ) : null}
        </p>
        <p className="note note-m">
          Or at sell-out; the draw waits for its time.
          {local ? (
            <span className="lt">
              {" "}
              That’s <span className="nw">{localShort(local, d.drawAt)}</span> your time.
            </span>
          ) : null}
        </p>
      </div>
    );
  if (ph === "closed")
    return (
      <div className="fact fact-time">
        <span className="t-label">{d.paidTickets >= d.ticketCap ? "Sold out · draws in" : "Sales closed · draws in"}</span>
        <Countdown secs={d.drawAt - now} verb="Draws" />
        <p className="abs">
          Draws <span className="nw">{utcLabel(d.drawAt)}</span>
        </p>
      </div>
    );
  if (ph === "due") {
    const open = anyoneCanRun(d, now);
    return (
      <div className="fact fact-time">
        <span className="t-label">Due since</span>
        <p className="fig">
          <span className="t-fact">{clock(d.drawAt)}</span>
          <span className="unit">UTC</span>
        </p>
        <p className="abs">
          {open ? (
            <>Anyone can run it now.</>
          ) : (
            <>
              The keeper runs it; from <span className="nw">{clock(publicFrom(d))} UTC</span> anyone can.
            </>
          )}
        </p>
      </div>
    );
  }
  if (ph === "drawing") {
    const ready = !!r?.fulfilled && !!r.randomness;
    const w = ready ? winningTicket(r!.randomness!, d.nextTicket) : null;
    return (
      <div className="fact fact-time">
        <span className="t-label">Winning ticket</span>
        <p className="fig">
          <span className={`t-fact ${w === null ? "c-ink-3" : ""}`}>{w === null ? "#????" : ticketNo(w)}</span>
        </p>
        <p className="note" style={{ marginTop: 8 }}>
          {w === null ? "Waiting for ORAO, usually a few seconds." : "Computed from ORAO’s randomness. Final once settled."}
        </p>
      </div>
    );
  }
  if (ph === "settled")
    return (
      <div className="fact fact-time">
        <span className="t-label">Winning ticket</span>
        <p className="fig">
          <span className="t-fact c-red">{ticketNo(d.winningTicket)}</span>
        </p>
        <p className="note" style={{ marginTop: 8 }}>
          out of {d.nextTicket} tickets
        </p>
      </div>
    );
  // cancelled
  return (
    <div className="fact fact-time">
      <span className="t-label">Refunded so far</span>
      <p className="fig">
        <span className="t-fact">{sol(d.refundedLamports, 2, 4)}</span>
        <span className="unit">of</span>
        <span className="t-fact">{sol(d.revenueLamports, 2, 4)}</span>
        <span className="unit">SOL</span>
      </p>
      <p className="note" style={{ marginTop: 8 }}>
        Each paid ticket is refunded from the vault when its owner claims it.
      </p>
    </div>
  );
}

function FactRight({ d, ph }: { d: DrawView; ph: Phase }) {
  const { myEntries, wallet, myState, staleSince } = useDrawSol();
  if (ph === "settled")
    return (
      <div className="fact fact-sold">
        <span className="t-label">Paid to</span>
        <p className="fig">
          <span className="t-rowtotal">
            <Addr k={d.winner} />
          </span>
        </p>
        <p className="note" style={{ marginTop: 8 }}>
          <span className="nw">{prizeFig(grandPrize(d))} SOL</span>, in the settle transaction.
        </p>
      </div>
    );
  if (ph === "cancelled") {
    const owed = myEntries.filter((e) => !e.isFree && !e.refunded).reduce((n, e) => n + (e.paidLamports > e.solPaid ? e.paidLamports - e.solPaid : ZERO), ZERO);
    return (
      <div className="fact fact-sold">
        <span className="t-label">Your refund</span>
        {!wallet ? (
          <p className="note">Connect a wallet to check.</p>
        ) : myState === "ready" ? (
          <p className="fig">
            <span className="t-fact">{sol(owed, 2, 4)}</span>
            <span className="unit">SOL</span>
          </p>
        ) : (
          <p className="note">{myState === "error" ? "Can’t read your tickets right now." : "Reading your tickets…"}</p>
        )}
      </div>
    );
  }
  if (ph === "drawing")
    return (
      <div className="fact fact-sold">
        {/* an empty label line, so this figure sits on the same line as the one beside it */}
        <span className="t-label" aria-hidden="true">
          &nbsp;
        </span>
        <p className="fig">
          <span className="t-fact">{d.nextTicket}</span>
          <span className="unit">tickets in the draw</span>
        </p>
        <p className="note">{mixNote(d)}</p>
      </div>
    );
  const empty = d.nextTicket === 0;
  const headline = d.kind === "headline";
  const short = Math.max(0, d.minTickets - d.paidTickets);
  return (
    <div className="fact fact-sold">
      <p className="fig">
        <span className="t-fact">{d.paidTickets}</span>
        <span className="unit">of {d.ticketCap} sold</span>
        {staleSince !== null && <i className="asof nw">as of {utcHhmm(staleSince)} UTC</i>}
      </p>
      <p className="note">
        {headline
          ? short > 0
            ? `${short} more to reach the minimum of ${d.minTickets}.`
            : `Minimum of ${d.minTickets} reached; it draws.`
          : ph !== "selling"
            ? `${d.nextTicket} ${plural(d.nextTicket, "ticket", "tickets")} in the draw.`
            : empty
              ? `The first ticket is ${ticketNo(0)}.`
              : `${remaining(d)} left${d.freeTickets + d.creditTickets > 0 ? `, plus ${mixNote(d, true)}` : ""}.`}
      </p>
    </div>
  );
}

/** "186 paid, 2 free, 7 on credits." / "2 free entries and 7 credit tickets" */
function mixNote(d: DrawView, phrase = false) {
  const parts: string[] = [];
  if (d.freeTickets) parts.push(`${d.freeTickets} free ${plural(d.freeTickets, "entry", "entries")}`);
  if (d.creditTickets) parts.push(`${d.creditTickets} credit ${plural(d.creditTickets, "ticket", "tickets")}`);
  if (phrase) return parts.join(" and ");
  return `${d.paidTickets} paid${d.freeTickets ? `, ${d.freeTickets} free` : ""}${d.creditTickets ? `, ${d.creditTickets} on credits` : ""}.`;
}

/** "06:13" when the local day is the UTC day, else the whole "Mon 5 Oct, 01:13". */
function localShort(local: string, unix: number) {
  const [day, time] = local.split(", ");
  return day && time && utcLabel(unix).startsWith(day) ? time : local;
}

/** Local time, only when the viewer isn’t on UTC. Client-only, so the prerender stays stable. */
function useLocal(unix: number) {
  const [s, setS] = useState<string | null>(null);
  useEffect(() => setS(localComma(unix)), [unix]);
  return s;
}
