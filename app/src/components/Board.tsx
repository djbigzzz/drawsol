"use client";

import { useDrawSol, useActions } from "@/hooks/context";
import { SplitFlap } from "./SplitFlap";
import { Addr, Check, ErrorNote, OnAirLamp, Spinner, Stat, Verify } from "./bits";
import { WinnerCard } from "./WinnerCard";
import {
  canCancel,
  instantNumer,
  maxEntries,
  phaseOf,
  prizeText,
  remaining,
  type Phase,
} from "@/lib/derive";
import { localLabel, oneIn, pad2, shortDate, sol, splitDuration, ticketNo, utcLabel } from "@/lib/format";
import { winningTicket } from "@/lib/fairness";
import { CANCEL_GRACE_SECS } from "@/lib/config";
import type { DrawView } from "@/lib/types";
import { vaultPda } from "@/lib/chain";

const LAMP: Record<Phase, { text: string; lit: boolean }> = {
  selling: { text: "On air", lit: true },
  due: { text: "Sales closed", lit: false },
  drawing: { text: "Drawing", lit: true },
  settled: { text: "Result", lit: false },
  cancelled: { text: "Cancelled", lit: false },
};

export function Board() {
  const { current: d, now, vaultLamports } = useDrawSol();
  if (!d) return null;
  const phase = phaseOf(d, now);
  const lamp = LAMP[phase];

  return (
    <section className="frame" aria-labelledby="board-title">
      {/* slate */}
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 md:px-8 md:py-4">
        <div className="flex items-baseline gap-3">
          <h1 id="board-title" className="display text-[22px] tracking-[0.06em] md:text-[24px]">
            Draw Nº {d.id.toString().padStart(4, "0")}
          </h1>
          <span className="eyebrow hidden xs:inline">opened {shortDate(d.createdAt)}</span>
          <Verify account={d.address} />
        </div>
        <OnAirLamp lit={lamp.lit}>{lamp.text}</OnAirLamp>
      </div>

      {/* prize */}
      <div className="px-4 pb-6 pt-6 md:px-8 md:pb-8 md:pt-8">
        <div className="eyebrow mb-3">
          {phase === "settled" ? "Prize — paid to the winner" : phase === "cancelled" ? "Prize — not awarded" : "Grand prize"}
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <span className="hidden md:inline">
            <SplitFlap value={prizeText(d.prizeLamports)} size={128} color="var(--brass)" separators="." label={`Prize ${prizeText(d.prizeLamports)} SOL`} />
          </span>
          <span className="md:hidden">
            <SplitFlap value={prizeText(d.prizeLamports)} size={80} color="var(--brass)" separators="." label={`Prize ${prizeText(d.prizeLamports)} SOL`} gap={3} />
          </span>
          <span className="display pb-2 text-[40px] text-brass md:pb-3 md:text-[56px]">SOL</span>
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] leading-[20px] text-dim">
          <span className="inline-flex items-center gap-2 text-cream">
            <Check className="text-green" />
            Locked in the vault before sales opened
          </span>
          <span>
            Vault holds{" "}
            <span className="mono text-cream">{vaultLamports !== null ? `${sol(vaultLamports, 2, 3)} SOL` : "…"}</span>
          </span>
          <Verify account={vaultPda(d.address)} label="vault" />
        </p>
      </div>

      <hr className="brass-rule mx-4 md:mx-8" />

      {phase === "selling" && <Selling d={d} now={now} />}
      {phase === "due" && <Due d={d} />}
      {phase === "drawing" && <Drawing d={d} now={now} />}
      {phase === "settled" && (
        <div className="px-4 py-6 md:px-8 md:py-8">
          <WinnerCard d={d} />
        </div>
      )}
      {phase === "cancelled" && <Cancelled d={d} />}

      {(phase === "selling" || phase === "due") && <OddsRow d={d} />}
    </section>
  );
}

function Countdown({ secs }: { secs: number }) {
  const t = splitDuration(secs);
  const groups =
    t.d > 0
      ? [
          [pad2(t.d), "days"],
          [pad2(t.h), "hrs"],
          [pad2(t.m), "min"],
        ]
      : [
          [pad2(t.h), "hrs"],
          [pad2(t.m), "min"],
          [pad2(t.s), "sec"],
        ];
  const label = groups.map(([v, l]) => `${v} ${l}`).join(" ");
  return (
    <div className="flex items-start gap-2" role="timer" aria-label={`Closes in ${label}`}>
      {groups.map(([v, l], i) => (
        <div key={l} className="flex items-start gap-2">
          {i > 0 && <span className="display pt-1 text-[36px] text-dim md:text-[44px]">:</span>}
          <div className="flex flex-col items-center gap-2">
            <SplitFlap value={v} size={44} label={`${v} ${l}`} gap={3} />
            <span className="eyebrow text-[10px]">{l}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Meter({ value, max }: { value: number; max: number }) {
  const N = 30;
  const filled = max > 0 ? (value / max) * N : 0;
  return (
    <div className="flex h-3 gap-[2px]" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label="Tickets sold">
      {Array.from({ length: N }, (_, i) => {
        const f = Math.max(0, Math.min(1, filled - i));
        return (
          <span key={i} className="relative flex-1 bg-panel">
            <span className="absolute inset-y-0 left-0 bg-cream" style={{ width: `${f * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
}

function Selling({ d, now }: { d: DrawView; now: number }) {
  const digits = Math.max(3, d.ticketCap.toString().length);
  const left = remaining(d);
  return (
    <div className="grid gap-8 px-4 py-6 md:grid-cols-2 md:gap-8 md:px-8 md:py-8">
      <Stat label="Sales close in">
        <Countdown secs={d.closesAt - now} />
      </Stat>
      <Stat label="Tickets sold">
        <div className="flex items-end gap-3">
          <SplitFlap value={d.paidTickets.toString().padStart(digits, "0")} size={44} label={`${d.paidTickets} of ${d.ticketCap} sold`} gap={3} />
          <span className="display pb-1 text-[28px] text-dim">/ {d.ticketCap}</span>
        </div>
        <div className="mt-4 max-w-[320px]">
          <Meter value={d.paidTickets} max={d.ticketCap} />
        </div>
        <div className="mt-2 text-[13px] text-dim">
          <span className="text-cream">{left}</span> left
          {d.freeTickets > 0 && <> · plus {d.freeTickets} free {d.freeTickets === 1 ? "entry" : "entries"}</>}
        </div>
      </Stat>
      <p className="text-[14px] leading-[22px] md:col-span-2">
        Draw at sell-out or <span className="mono text-cream">{utcLabel(d.closesAt)}</span> — whichever comes first.{" "}
        <span className="text-dim">That&apos;s {localLabel(d.closesAt)} your time. The close time is fixed in the draw account.</span>{" "}
        <Verify account={d.address} label="closes_at" />
      </p>
    </div>
  );
}

function OddsRow({ d }: { d: DrawView }) {
  const numer = instantNumer(d);
  return (
    <div className="grid grid-cols-3 border-t border-line">
      <div className="border-r border-line px-3 py-5 sm:px-4 md:px-8">
        <div className="eyebrow mb-2"><span className="sm:hidden">Grand draw</span><span className="hidden sm:inline">Grand draw, per ticket</span></div>
        {d.nextTicket > 0 ? (
          <>
            <div className="display text-[22px] leading-[24px] sm:text-[32px] sm:leading-[32px]">{oneIn(1, d.nextTicket)}</div>
            <div className="mt-2 text-[12px] leading-[16px] text-dim sm:text-[13px] sm:leading-[18px]">now · worst case {oneIn(1, maxEntries(d))}</div>
          </>
        ) : (
          <>
            <div className="display text-[22px] leading-[24px] sm:text-[32px] sm:leading-[32px]">No tickets yet</div>
            <div className="mt-2 text-[12px] leading-[16px] text-dim sm:text-[13px] sm:leading-[18px]">the first entry gets ticket {ticketNo(0)}</div>
          </>
        )}
      </div>
      <div className="border-r border-line px-3 py-5 sm:px-4 md:px-8">
        <div className="eyebrow mb-2"><span className="sm:hidden">Instant win</span><span className="hidden sm:inline">Instant win, per ticket</span></div>
        <div className="display text-[22px] leading-[24px] sm:text-[32px] sm:leading-[32px]">{oneIn(numer, d.iwDenominator)}</div>
        <div className="mt-2 text-[12px] leading-[16px] text-dim sm:text-[13px] sm:leading-[18px]">demo odds, boosted</div>
      </div>
      <div className="px-3 py-5 sm:px-4 md:px-8">
        <div className="eyebrow mb-2">Ticket</div>
        <div className="display text-[22px] leading-[24px] sm:text-[32px] sm:leading-[32px]">{sol(d.ticketPrice, 2, 4)} SOL</div>
        <div className="mt-2 text-[12px] leading-[16px] text-dim sm:text-[13px] sm:leading-[18px]">flat price, no bulk discount</div>
      </div>
    </div>
  );
}

function Due({ d }: { d: DrawView }) {
  const { phase, errors, runDraw, clearError, disabledReason } = useActions();
  const ph = phase.run;
  const busy = ph === "simulating" || ph === "signing" || ph === "confirming";
  const soldOut = d.paidTickets >= d.ticketCap;
  const empty = d.nextTicket === 0;
  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <div className="eyebrow mb-2">{soldOut ? "Sold out" : "Deadline passed"}</div>
          <p className="display text-[36px] leading-[36px] md:text-[44px] md:leading-[44px]">
            {empty ? "No tickets were sold" : "The draw is due"}
          </p>
          <p className="mt-3 max-w-[520px] text-[15px] leading-[24px] text-dim">
            {empty ? (
              <>Running it closes the draw and returns the prize and reserve to the operator. Anyone can press it.</>
            ) : (
              <>
                {d.nextTicket} tickets are in. Anyone can run the draw — it asks ORAO VRF for randomness, and nobody
                (you, us, or ORAO) gets to choose the result. {soldOut ? "Every paid ticket has sold." : `Sales closed ${utcLabel(d.closesAt)}.`}
              </>
            )}
          </p>
        </div>
        <button className="btn" onClick={runDraw} disabled={busy || !!disabledReason}>
          {busy && <Spinner />}
          {ph === "signing" ? "Approve in wallet…" : ph === "confirming" ? "Confirming…" : empty ? "Close the draw" : "Run the draw"}
        </button>
      </div>
      {errors.run && (
        <div className="mt-4">
          <ErrorNote onDismiss={() => clearError("run")}>{errors.run.message}</ErrorNote>
        </div>
      )}
    </div>
  );
}

function Drawing({ d, now }: { d: DrawView; now: number }) {
  const { drawRandomness: r } = useDrawSol();
  const { phase, errors, settle, cancel, clearError, disabledReason } = useActions();
  const ready = !!r?.fulfilled && !!r.randomness;
  const w = ready ? winningTicket(r!.randomness!, d.nextTicket) : null;
  const sp = phase.settle;
  const busy = sp === "simulating" || sp === "signing" || sp === "confirming";
  const cancellable = canCancel(d, now);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-start">
        <div>
          <div className="eyebrow mb-3">Winning ticket</div>
          <SplitFlap
            value={w !== null ? ticketNo(w) : "#????"}
            size={72}
            color={w !== null ? "var(--brass)" : undefined}
            separators=""
            label={w !== null ? `Winning ticket ${ticketNo(w)} (computed, not yet settled)` : "Waiting for randomness"}
            gap={3}
          />
          {w !== null && <div className="mt-2 text-[13px] text-dim">computed from ORAO&apos;s randomness — final once settled</div>}
        </div>

        <ol className="space-y-4 text-[14px] leading-[20px]">
          <li className="flex items-start gap-3">
            <span className="mono mt-[2px] w-5 text-green">
              <Check />
            </span>
            <div>
              <div>Randomness requested from ORAO VRF for {d.nextTicket} tickets</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Verify account={d.drawVrfRequest} label="request" />
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className={`mono mt-[2px] w-5 ${ready ? "text-green" : "text-dim"}`}>{ready ? <Check /> : <Spinner />}</span>
            <div>{ready ? "Randomness landed on-chain" : "Waiting for ORAO to fulfil — usually a few seconds"}</div>
          </li>
          <li className="flex items-start gap-3">
            <span className="mono mt-[2px] w-5 text-dim">3</span>
            <div className="flex-1">
              <div>Settle: pays the prize straight to the winning wallet. Anyone can press it.</div>
              <button className="btn mt-4" disabled={!ready || busy || !!disabledReason} onClick={settle}>
                {busy && <Spinner />}
                {sp === "signing" ? "Approve in wallet…" : sp === "confirming" ? "Confirming…" : "Settle draw"}
              </button>
            </div>
          </li>
        </ol>
      </div>
      {errors.settle && (
        <div className="mt-4">
          <ErrorNote onDismiss={() => clearError("settle")}>{errors.settle.message}</ErrorNote>
        </div>
      )}
      <div className="mt-6 border-t border-line pt-4 text-[13px] leading-[20px] text-dim">
        {cancellable ? (
          <div className="flex flex-wrap items-center gap-4">
            <span>Randomness never arrived within 48 h of closing. Anyone can now cancel; every paid ticket becomes refundable.</span>
            <button className="btn small ghost" onClick={cancel} disabled={!!disabledReason}>
              Cancel draw
            </button>
          </div>
        ) : (
          <>
            Safety valve: if randomness doesn&apos;t arrive by {utcLabel(d.closesAt + CANCEL_GRACE_SECS)}, anyone can cancel and
            every paid ticket is refunded.
          </>
        )}
      </div>
    </div>
  );
}

function Cancelled({ d }: { d: DrawView }) {
  const { myEntries, wallet } = useDrawSol();
  const refundable = myEntries.filter((e) => !e.isFree && !e.refunded);
  const owed = refundable.reduce((n, e) => n + e.paidLamports, BigInt(0));
  const empty = d.nextTicket === 0;
  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <p className="display text-[36px] leading-[36px] md:text-[44px] md:leading-[44px]">
        {empty ? "Closed with no tickets" : "Refunds are open"}
      </p>
      <p className="mt-3 max-w-[560px] text-[15px] leading-[24px] text-dim">
        {empty
          ? "Nobody bought a ticket before the deadline, so the prize and reserve went back to the operator."
          : "The randomness for this draw never arrived in time, so it was cancelled. Every paid ticket can be refunded in full from the vault — no deadline."}
      </p>
      {!empty && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Refunded so far">
            <div className="mono">{sol(d.refundedLamports, 2, 4)} / {sol(d.proceedsLamports, 2, 4)} SOL</div>
          </Stat>
          <Stat label="Your refund">
            <div className="mono">{wallet ? `${sol(owed, 2, 4)} SOL` : "Connect to check"}</div>
          </Stat>
          <Stat label="Authority">
            <Addr k={d.authority} />
          </Stat>
        </div>
      )}
      {wallet && refundable.length > 0 && (
        <a className="btn mt-6" href="#my-tickets">
          Refund my {refundable.length} {refundable.length === 1 ? "entry" : "entries"} ↓
        </a>
      )}
    </div>
  );
}
