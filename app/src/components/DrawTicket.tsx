"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useDrawSol } from "@/hooks/context";
import { activeTiers, instantNumer, phaseOf, remaining, type Phase } from "@/lib/derive";
import { clock, oneIn, shortDate, sol, ticketNo, utcLabel } from "@/lib/format";
import { winningTicket } from "@/lib/fairness";
import { vaultPda } from "@/lib/chain";
import { inkAt } from "@/lib/print";
import type { DrawView } from "@/lib/types";
import { Addr, ProofLink } from "./bits";
import { BuyPanel } from "./BuyPanel";
import { durationParts, localComma, plural, stampDay, longDay } from "./fmt";
import { Barcode, yoursText } from "./print/Barcode";
import { Microtext, Specimen } from "./print/Mark";
import { NumberWheel } from "./print/NumberWheel";
import { Stamp } from "./print/Stamp";
import { Holes, useSettleTx } from "./SettledTicket";

const serial = (id: number) => `Nº ${String(id).padStart(4, "0")}`;

/** The hero: the lede on the left, the draw ticket (body + stub) on the right. */
export function Hero() {
  return (
    <div className="hero">
      <Lede />
      <DrawTicket />
    </div>
  );
}

/* ------------------------------------------------------------------ lede */

export function Lede() {
  const { current: d, now, drawRandomness: r } = useDrawSol();
  if (!d) return null;
  const ph = phaseOf(d, now);
  const n = `Draw Nº ${d.id}`;
  const soldOut = d.paidTickets >= d.ticketCap;
  const prize = <span className="nw">{sol(d.prizeLamports, 0, 4)} SOL</span>;
  const fulfilled = ph === "drawing" && !!r?.fulfilled && !!r.randomness;
  const copy: Record<Phase, [string, ReactNode]> = {
    selling: [
      `${n} is open.`,
      <>
        One prize of {prize}, locked away before the first ticket {d.nextTicket === 0 ? "sells" : "sold"}. {d.ticketCap} tickets at{" "}
        <span className="nw">{sol(d.ticketPrice, 2, 4)} SOL</span>, and every ticket gets an instant result.
      </>,
    ],
    due: [
      `${n} has closed.`,
      <>
        Sales are over: {soldOut ? "every ticket sold" : <>the deadline passed at <span className="nw">{utcLabel(d.closesAt)}</span></>}. The draw is due, and
        anyone can run it.
      </>,
    ],
    drawing: [
      `${n} is being drawn.`,
      fulfilled ? (
        <>
          ORAO’s randomness has landed and picks ticket <span className="nw">{ticketNo(winningTicket(r!.randomness!, d.nextTicket))}</span>. Anyone can settle the
          draw now to pay the winner {prize}.
        </>
      ) : (
        <>Randomness has been requested from ORAO. Once it lands, anyone can settle the draw and pay the winner.</>
      ),
    ],
    settled: [
      `${n} is settled.`,
      <>
        Ticket <span className="nw">{ticketNo(d.winningTicket)}</span> won the {prize} prize.
      </>,
    ],
    cancelled: [`${n} was cancelled.`, <>The randomness never arrived in time, so every paid ticket can be refunded in full.</>],
  };
  const [h, s] = copy[ph];
  // the instant-win odds only matter while tickets can be bought
  const showOdds = ph === "selling";
  const tiers = activeTiers(d);
  return (
    <aside className="lede">
      <div>
        <h1 className="t-lede-h">{h}</h1>
        <p className="t-lede">{s}</p>
      </div>
      {showOdds && tiers.length > 0 && (
        <div className="odds">
          <p className="odds-head">
            <b>Instant wins</b>
            <i>demo odds, boosted</i>
          </p>
          <table>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.index}>
                  <td className="nw">{sol(t.amount, 2, 4)} SOL</td>
                  <td>{oneIn(t.odds, d.iwDenominator)}</td>
                </tr>
              ))}
              <tr className="sum">
                <td>Any instant win</td>
                <td>{oneIn(instantNumer(d), d.iwDenominator)}</td>
              </tr>
            </tbody>
          </table>
          <p className="cap t-small">Decided by ORAO randomness about <span className="nw">2 s</span> after you pay. Wins are paid in the reveal transaction.</p>
        </div>
      )}
    </aside>
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

  const mine = myEntries.flatMap((e) => Array.from({ length: e.count }, (_, i) => e.firstTicket + i));
  const free = entriesState === "ready" ? entries.filter((e) => e.isFree).map((e) => e.firstTicket) : [];
  const left = remaining(d);
  const barLabel =
    `${d.paidTickets} of ${d.ticketCap} tickets sold` +
    (d.freeTickets > 0 ? `, plus ${d.freeTickets} free ${plural(d.freeTickets, "entry", "entries")}` : "") +
    "." +
    (settled ? ` Ticket ${ticketNo(d.winningTicket)} was drawn.` : "") +
    yoursText(mine);

  const vault = vaultLamports !== null ? `${sol(vaultLamports, 2, 3)} SOL` : null;
  const prize = sol(d.prizeLamports, 0, 4);

  return (
    <article className={`ticket ph-${ph}`} aria-labelledby="ticket-h">
      <div className="tk-body">
        <div className="tk-head">
          <span className="t-ticket-head" id="ticket-h">
            DrawSol · grand draw
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
          <p className="t-label">{settled ? "Grand prize, paid" : cancelled ? "Prize, not awarded" : "Grand prize"}</p>
          <div className="tk-prize-row">
            <p className={`t-prize ${cancelled ? "dim" : ""}`} aria-label={`${prize} SOL`}>
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
              <Stamp kind="locked" className="stamp-hero" seed={inkAt(d.address.toBytes(), 0)} label="Stamped: prize locked in the vault" top={`PRIZE · DRAW Nº ${d.id}`} />
            )}
          </div>
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
              {settleTx ? <ProofLink tx={settleTx}>Prize transaction</ProofLink> : settleTx === null ? <span className="c-ink-3">Transaction not indexed.</span> : null}
            </>
          ) : cancelled ? (
            <>
              <strong>This draw was cancelled before a winner was drawn.</strong> Every paid ticket can claim a full refund from the vault
              {vault ? (
                <>
                  , which holds <span className="nw">{vault}</span>
                </>
              ) : null}
              .<br />
              <ProofLink account={vaultPda(d.address)}>Check the vault on Solscan</ProofLink>
            </>
          ) : (
            <>
              <strong>Locked in the program vault before the first ticket {d.nextTicket === 0 ? "sells" : "sold"}.</strong>{" "}
              {vault ? (
                <>
                  The vault holds <span className="nw">{vault}</span>:{" "}
                  {d.proceedsLamports > BigInt(0) ? "the prize, the instant-win reserve and sales so\u00a0far" : "the prize and the instant-win reserve"}.
                </>
              ) : null}
              <br />
              <ProofLink account={vaultPda(d.address)}>Check the vault on Solscan</ProofLink>
            </>
          )}
        </p>

        <span className="dbl tk-facts-rule" aria-hidden="true" />
        <div className="tk-facts">
          <FactLeft d={d} ph={ph} now={now} />
          <FactRight d={d} ph={ph} />
        </div>

        <div className="tk-bar">
          <Barcode
            slots={d.ticketCap + d.freeTickets}
            taken={d.nextTicket}
            free={free}
            mine={mine}
            drawn={settled ? d.winningTicket : -1}
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

function Countdown({ secs }: { secs: number }) {
  const t = durationParts(secs);
  const [label, setLabel] = useState("");
  const minuteKey = Math.floor(secs / 60);
  useEffect(() => {
    const parts = t.d > 0 ? [[t.d, "day"], [t.h, "hour"], [t.m, "minute"]] : t.h > 0 ? [[t.h, "hour"], [t.m, "minute"]] : [[t.m, "minute"], [t.s, "second"]];
    const words = (parts as [number, string][]).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`);
    setLabel(`Closes in ${words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]}`);
    // updated once a minute (the aria-label is off the live region)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteKey]);
  const underHour = secs < 3600;
  return (
    <p className="fig" role="timer" aria-live="off" aria-label={label}>
      {underHour ? (
        <>
          <NumberWheel className="t-fact" value={String(t.m)} />
          <span className="unit">min</span>
          <NumberWheel className="t-fact" value={String(t.s).padStart(2, "0")} seconds />
          <span className="unit">s left</span>
        </>
      ) : (
        <>
          {t.d > 0 && (
            <>
              <NumberWheel className="t-fact" value={String(t.d)} />
              <span className="unit">d</span>
            </>
          )}
          <NumberWheel className="t-fact" value={String(t.h)} />
          <span className="unit">h</span>
          <NumberWheel className="t-fact" value={String(t.m).padStart(t.d > 0 || t.h > 0 ? 2 : 1, "0")} />
          <span className="unit">min left</span>
        </>
      )}
    </p>
  );
}

function FactLeft({ d, ph, now }: { d: DrawView; ph: Phase; now: number }) {
  const { drawRandomness: r } = useDrawSol();
  const local = useLocal(d.closesAt);
  if (ph === "selling")
    return (
      <div className="fact fact-time">
        <Countdown secs={d.closesAt - now} />
        <p className="abs">
          Closes <span className="nw">{utcLabel(d.closesAt)}</span>
        </p>
        <p className="note note-d">
          or when the last ticket sells, whichever comes first.
          {local ? (
            <>
              {" "}
              That’s <span className="nw">{local}</span> your time.
            </>
          ) : null}
        </p>
        <p className="note note-m">
          Or at sell-out, whichever is first.
          {local ? (
            <span className="lt">
              {" "}
              That’s <span className="nw">{localShort(local, d.closesAt)}</span> your time.
            </span>
          ) : null}
        </p>
      </div>
    );
  if (ph === "due") {
    const soldOut = d.paidTickets >= d.ticketCap;
    return (
      <div className="fact fact-time">
        <span className="t-label">{soldOut ? "Sold out" : "Closed"}</span>
        <p className="fig">
          <span className="t-fact">{utcLabel(d.closesAt).split(",")[0]}</span>
        </p>
        <p className="abs">{soldOut ? "Every paid ticket sold before the deadline." : `at ${clock(d.closesAt)} UTC, the fixed deadline.`}</p>
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
        <span className="t-fact">{sol(d.proceedsLamports, 2, 4)}</span>
        <span className="unit">SOL</span>
      </p>
      <p className="note" style={{ marginTop: 8 }}>
        Each paid ticket is refunded from the vault when its owner claims it.
      </p>
    </div>
  );
}

function FactRight({ d, ph }: { d: DrawView; ph: Phase }) {
  const { myEntries, wallet, myState } = useDrawSol();
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
          <span className="nw">{sol(d.prizeLamports, 0, 4)} SOL</span>, in the settle transaction.
        </p>
      </div>
    );
  if (ph === "cancelled") {
    const owed = myEntries.filter((e) => !e.isFree && !e.refunded).reduce((n, e) => n + e.paidLamports, BigInt(0));
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
        <p className="note">
          {d.paidTickets} paid, {d.freeTickets} free.
        </p>
      </div>
    );
  const empty = d.nextTicket === 0;
  return (
    <div className="fact fact-sold">
      <p className="fig">
        <span className="t-fact">{d.paidTickets}</span>
        <span className="unit">of {d.ticketCap} sold</span>
      </p>
      <p className="note">
        {ph === "due"
          ? `${d.nextTicket} ${plural(d.nextTicket, "ticket", "tickets")} in the draw.`
          : empty
            ? `The first ticket is ${ticketNo(0)}.`
            : `${remaining(d)} left${d.freeTickets > 0 ? `, plus ${d.freeTickets} free ${plural(d.freeTickets, "entry", "entries")}` : ""}.`}
      </p>
    </div>
  );
}

/** "06:13" when the local day is the UTC day, else the whole "Mon 5 Oct, 01:13". */
function localShort(local: string, unix: number) {
  const [day, time] = local.split(", ");
  return day && time && utcLabel(unix).startsWith(day) ? time : local;
}

/** Local close time, only when the viewer isn’t on UTC. Client-only, so the prerender stays stable. */
function useLocal(unix: number) {
  const [s, setS] = useState<string | null>(null);
  useEffect(() => setS(localComma(unix)), [unix]);
  return s;
}
