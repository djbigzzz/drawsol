"use client";

import { sol, ticketNo } from "@/lib/format";
import { Stamp } from "./print/Stamp";

export type StubState = "sealed" | "nowin" | "won" | "free" | "drawn" | "refunded";

/** A stub in a strip (Your tickets): 102×132 on desktop, a fifth of the row on phones. */
export function Stub({ serial, state, amount, ink, prize }: { serial: number; state: StubState; amount?: bigint; ink: Uint8Array; prize?: string }) {
  const s = ticketNo(serial);
  const aria =
    state === "won"
      ? `${s}: won ${sol(amount ?? BigInt(0), 2, 4)} SOL, paid`
      : state === "drawn"
        ? `${s}: drawn, won the grand prize`
        : state === "sealed"
          ? `${s}: sealed`
          : state === "free"
            ? `${s}: free entry`
            : state === "refunded"
              ? `${s}: refunded`
              : `${s}: no win`;
  return (
    <div className={`stubby ${state === "won" || state === "drawn" ? "win" : ""} ${state}`} role="listitem" aria-label={aria}>
      <span className={`t-serial ${state === "won" || state === "drawn" ? "c-red" : ""}`} aria-hidden="true">
        {s}
      </span>
      {state === "sealed" && (
        <span className="qm" aria-hidden="true">
          ?
        </span>
      )}
      {state === "won" && <Stamp kind="won" seed={ink} label={`Stamped: won ${sol(amount ?? BigInt(0), 2, 4)} SOL`} />}
      {state === "drawn" && <Stamp kind="drawn" className="drawn" seed={ink} label="Stamped: drawn" mid="GRAND" bottom="PRIZE" />}
      <span className="res" aria-hidden="true">
        {state === "won" ? (
          <>
            <span className="t-stubamt">+{sol(amount ?? BigInt(0), 2, 3)}</span>
            <small>SOL, paid</small>
          </>
        ) : state === "drawn" ? (
          <>
            <span className="t-stubamt">{prize}</span>
            <small>SOL, paid</small>
          </>
        ) : state === "sealed" ? (
          "sealed"
        ) : state === "free" ? (
          "free entry"
        ) : state === "refunded" ? (
          "refunded"
        ) : (
          "no win"
        )}
      </span>
    </div>
  );
}

/**
 * One ticket in the reveal: a halftone cover until its on-chain tier is shown, then the cover
 * lifts off. Losers stay put and say so quietly; winners drop out of the strip and get stamped.
 */
export function RevealStub({
  ticket,
  tier,
  amount,
  shown,
  roll,
  denom,
  ink,
  rowFirst,
  rowLast,
  even,
  width,
}: {
  ticket: number;
  /** undefined = not yet known from chain */
  tier: number | undefined;
  amount: bigint;
  shown: boolean;
  roll: number | null;
  denom: number;
  ink: Uint8Array;
  rowFirst: boolean;
  rowLast: boolean;
  even: boolean;
  width?: number;
}) {
  const known = shown && tier !== undefined;
  const won = known && tier! > 0;
  const s = ticketNo(ticket);
  const amt = sol(amount, 2, 3);
  const big = won && amount >= BigInt(50_000_000);
  return (
    <div
      className={`rstub ${known ? "shown" : ""} ${won ? "win" : ""} ${big ? "big" : ""} ${even ? "even" : ""} ${rowFirst ? "row-first" : ""} ${rowLast ? "row-last" : ""}`}
      role="listitem"
      aria-label={!known ? `${s}: sealed` : won ? `${s}: won ${amt} SOL` : `${s}: no win`}
      style={width ? { width } : undefined}
    >
      <span className="sl" aria-hidden="true">
        <span className="t-serial">{s}</span>
        {known && roll !== null && (
          <span className="roll">
            roll {roll} / {denom}
          </span>
        )}
      </span>
      <span className="res" aria-hidden="true">
        {known &&
          (won ? (
            <>
              <span className="t-stubamt">{amt}</span>
              <small>
                SOL<span className="w"> won</span>
              </small>
            </>
          ) : (
            <span className="none">no win</span>
          ))}
      </span>
      {won && <Stamp kind="won" className="wstamp" seed={ink} label={`Stamped: won ${amt} SOL`} />}
      <span className="cover" aria-hidden="true">
        <span>RESULT</span>
      </span>
    </div>
  );
}
