"use client";

import { useEffect, useRef, useState } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { anyoneCanRun, cancelReason, cancelsAtRequest, grandPrize, liveDraw, phaseOf, publicFrom } from "@/lib/derive";
import { winningTicket } from "@/lib/fairness";
import { clock, ticketNo, utcLabel } from "@/lib/format";
import { vaultPda } from "@/lib/chain";
import { inkAt, ticketInk } from "@/lib/print";
import type { DrawView } from "@/lib/types";
import { Addr, Busy, ErrorNote, inFlight, ProofLink } from "./bits";
import { Countdown } from "./DrawTicket";
import { drawName, kindName, plural, prizeFig } from "./fmt";
import { Barcode } from "./print/Barcode";
import { CarbonSlip } from "./print/CarbonSlip";
import { Microtext } from "./print/Mark";
import { Stamp } from "./print/Stamp";
import { useSettleTx } from "./SettledTicket";

const ROLL_MS = 6800;
const LOOPS = 2;
/** ease-out quint: a long glide that settles on the ticket */
const ease = (t: number) => 1 - Math.pow(1 - t, 5);

/**
 * Where the roll's cursor is at progress p (0–1): it starts at #0000, runs LOOPS times through every ticket
 * and slows to a stop on the winning ticket. Presentation of a result already fixed by ORAO's randomness.
 */
const cursorAt = (p: number, n: number, w: number) => Math.floor(ease(p) * (LOOPS * n + w)) % Math.max(1, n);

type Stage = "countdown" | "due" | "pending" | "rolling" | "won" | "paid" | "cancelled";

/**
 * The /live page: built to be streamed with no presenter, driven purely by chain state (the draw is polled
 * every 5 s around its time, the ORAO request every 2 s). Countdown to draw_at → "Drawing now" while ORAO is
 * pending → the barcode of every ticket rolls and stops on the winning ticket (computed in this browser with
 * fairness.ts from ORAO's randomness) → WON, then PAID once settled, with the winner and the payout link →
 * the recompute slip. The roll plays only when the randomness lands while the page is open (or is waiting to
 * be settled); a draw already settled shows its result at once.
 */
export function LiveShow({ raw }: { raw: string | null }) {
  const { load, draws, current: d, select, now, drawRandomness: r, stillRoll } = useDrawSol();
  const reduced = useReducedMotion();
  const asked = raw !== null && /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : null;
  const next = liveDraw(draws, now);
  const nextId = next?.id ?? null;
  useEffect(() => {
    if (asked !== null) select(asked);
    else if (nextId !== null) select(nextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, nextId]);

  // the roll: started by the randomness landing (or a fulfilled draw waiting to be settled when the page opens)
  const fulfilled = !!d && ((d.status === "drawing" && !!r?.fulfilled && !!r.randomness) || d.status === "settled");
  const seen = useRef<{ key: string; pending: boolean } | null>(null);
  const [rollStart, setRollStart] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const key = d?.address.toBase58() ?? "";
  useEffect(() => {
    if (!d) return;
    if (!seen.current || seen.current.key !== key) {
      seen.current = { key, pending: !fulfilled };
      // opened on a draw whose randomness has landed but isn't settled yet: it is happening now, so roll
      setRollStart(fulfilled && d.status === "drawing" && !reduced ? Date.now() : null);
      return;
    }
    if (fulfilled && seen.current.pending) {
      seen.current.pending = false;
      setRollStart(reduced ? null : Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fulfilled, reduced]);
  useEffect(() => {
    if (rollStart === null) return;
    let raf = 0;
    const step = () => {
      setTick((t) => t + 1);
      if (Date.now() - rollStart < ROLL_MS) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rollStart]);

  if (load.kind === "loading") return <p className="live-voice t-voice">Reading the draw from devnet…</p>;
  if (load.kind === "error")
    return (
      <p className="live-voice t-voice" role="alert">
        Can’t reach devnet, so no numbers are shown.
      </p>
    );
  if (!d)
    return (
      <p className="live-voice t-voice">
        {asked !== null ? `There is no Draw Nº ${asked} on-chain.` : "No draw is open yet. When one opens, it is drawn here, live."}
      </p>
    );
  void tick;

  const ph = phaseOf(d, now);
  const rand = d.status === "settled" ? d.randomness : r?.fulfilled ? r.randomness : null;
  const w = d.status === "settled" ? d.winningTicket : rand ? winningTicket(rand, d.nextTicket) : null;
  const progress = stillRoll !== undefined ? stillRoll : rollStart !== null ? Math.min(1, (Date.now() - rollStart) / ROLL_MS) : 1;
  const rolling = w !== null && progress < 1;

  let stage: Stage;
  if (ph === "cancelled") stage = "cancelled";
  else if (ph === "selling" || ph === "closed") stage = "countdown";
  else if (ph === "due") stage = "due";
  else if (w === null) stage = "pending";
  else if (rolling) stage = "rolling";
  else stage = d.status === "settled" ? "paid" : "won";

  const cursor = stage === "rolling" && w !== null ? cursorAt(progress, d.nextTicket, w) : -1;
  const shown = stage === "rolling" ? cursor : w;
  return <Stage d={d} stage={stage} shown={shown} cursor={cursor} winning={stage === "won" || stage === "paid" ? w : null} now={now} />;
}

function Stage({ d, stage, shown, cursor, winning, now }: { d: DrawView; stage: Stage; shown: number | null; cursor: number; winning: number | null; now: number }) {
  const { drawRandomness: r } = useDrawSol();
  const settleTx = useSettleTx(d);
  const pot = d.kind === "pot";
  const prize = prizeFig(grandPrize(d));
  const voice: Record<Stage, string> = {
    countdown: "Drawing in",
    due: "Drawing now",
    pending: "Drawing now",
    rolling: "Every ticket, one by one",
    won: "The winning ticket",
    paid: "The winning ticket",
    cancelled: "Not drawn",
  };
  const sub: Record<Stage, string> = {
    countdown: `Live at ${clock(d.drawAt)} UTC. The randomness comes from ORAO VRF, and nobody can choose it.`,
    due: cancelsAtRequest(d)
      ? d.nextTicket === 0
        ? "No tickets were sold, so there is nothing to draw."
        : `Only ${d.paidTickets} of the ${d.minTickets} tickets it needed sold, so running it cancels it and everyone is refunded in full.`
      : "The draw time has passed. Next it is requested on-chain, and ORAO answers with the randomness, usually within seconds.",
    pending: "Randomness requested from ORAO. Waiting for it to land, usually a few seconds.",
    rolling: "ORAO’s randomness has landed. The winning ticket is computed from it in this browser.",
    won: "Computed from ORAO’s randomness. Anyone can settle the draw now to pay the winner.",
    paid: "Paid from the vault in the settle transaction.",
    cancelled:
      cancelReason(d) === "undersold"
        ? `Only ${d.paidTickets} of the ${d.minTickets} tickets it needed sold. Everyone is refunded in full.`
        : cancelReason(d) === "no-tickets"
          ? "No tickets were sold."
          : "The randomness never arrived within 48 hours. Every paid ticket can be refunded.",
  };
  const extra = d.freeTickets + d.creditTickets;
  return (
    <article className={`live-ticket stage-${stage} kind-${d.kind}`} aria-labelledby="live-h">
      <div className="tk-head">
        <span className="t-ticket-head" id="live-h">
          DrawSol · {kindName(d.kind)} · live
        </span>
        <span className="t-serial">Nº {String(d.id).padStart(4, "0")}</span>
      </div>
      <span className="tk-headrule" aria-hidden="true">
        <span className="top" />
        <Microtext />
      </span>

      <div className="live-main">
        <div className="live-left">
          <p className="live-voice t-voice" aria-live="polite">
            {(stage === "due" || stage === "pending") && <Busy />}
            {voice[stage]}
          </p>
          <div className="live-figure">
            {stage === "countdown" ? (
              <Countdown secs={d.drawAt - now} verb="Draws" className="t-live" />
            ) : stage === "due" || stage === "pending" ? (
              <p className="t-live c-ink-3" aria-label="Winning ticket not known yet">
                #????
              </p>
            ) : stage === "cancelled" ? (
              <p className="t-live c-ink-3">{d.paidTickets} sold</p>
            ) : (
              <p className={`t-live ${stage === "rolling" ? "" : "c-red"}`} aria-label={stage === "rolling" ? undefined : `Winning ticket ${ticketNo(shown ?? 0)}`}>
                {ticketNo(shown ?? 0)}
              </p>
            )}
            {winning !== null && (
              <Stamp
                kind="won"
                className="live-won"
                seed={ticketInk(d.status === "settled" ? d.randomness : r?.randomness ?? d.address.toBytes(), winning)}
                label={`Stamped: ticket ${ticketNo(winning)} won`}
              />
            )}
          </div>
          <p className="live-sub t-body">{sub[stage]}</p>
        </div>

        <div className="live-right">
          <p className="t-label">{stage === "paid" ? "Paid" : pot ? (stage === "countdown" ? "The pot, and rising" : "The pot") : "Grand prize"}</p>
          <p className="t-live-prize">
            {prize}
            <span className="u">SOL</span>
          </p>
          {stage === "paid" ? (
            <div className="live-paid">
              <Stamp kind="paid" className="live-paid-stamp" seed={inkAt(d.randomness, 16)} label="Stamped: paid" top={`DRAW Nº ${d.id}`} bottom="DRAWSOL" />
              <p className="t-body">
                to <Addr k={d.winner} className="b" />
                <br />
                {settleTx?.kind === "found" ? (
                  <ProofLink tx={settleTx.sig}>Payout transaction</ProofLink>
                ) : (
                  <ProofLink account={d.winningEntry}>Winning entry</ProofLink>
                )}
              </p>
            </div>
          ) : stage === "cancelled" ? (
            <Stamp kind="cancelled" className="live-cx" seed={inkAt(d.address.toBytes(), 16)} label="Stamped: cancelled, refunds open" top={`DRAW Nº ${d.id}`} />
          ) : (
            <p className="t-body c-ink-2">
              {pot ? "Pot and unwon instant pool, in the vault. " : "Escrowed in the vault. "}
              <ProofLink account={vaultPda(d.address)}>Vault on Solscan</ProofLink>
            </p>
          )}
        </div>
        {/* paid: the arithmetic, in the same frame (a third column at stream width) */}
        {stage === "paid" && (
          <div className="live-slip">
            <CarbonSlip d={d} id="live-recompute" />
          </div>
        )}
      </div>

      <div className="live-bar">
        <Barcode
          big
          slots={stage === "countdown" ? d.ticketCap + extra : Math.max(1, d.nextTicket)}
          taken={d.nextTicket}
          drawn={winning ?? -1}
          cursor={cursor}
          minAt={d.kind === "headline" && d.paidTickets < d.minTickets && stage === "countdown" ? d.minTickets + extra : undefined}
          minLabel={`min ${d.minTickets}`}
          label={`${d.nextTicket} ${plural(d.nextTicket, "ticket", "tickets")} in ${drawName(d)}.${winning !== null ? ` Ticket ${ticketNo(winning)} was drawn.` : ""}`}
          leftLabel={stage === "countdown" ? `${Math.max(0, d.ticketCap - d.paidTickets)} left` : undefined}
        />
      </div>

      <div className="live-foot">
        <p className="t-small">
          <b className="nw">
            {d.nextTicket} {plural(d.nextTicket, "ticket", "tickets")}
          </b>{" "}
          in the draw · {d.paidTickets} paid{d.freeTickets ? `, ${d.freeTickets} free` : ""}
          {d.creditTickets ? `, ${d.creditTickets} on credits` : ""} · draw time <span className="nw">{utcLabel(d.drawAt)}</span>
        </p>
        <RunControls d={d} stage={stage} now={now} />
      </div>
    </article>
  );
}

/**
 * The obvious "anyone can run the draw" control, only once the public grace window has passed (the keeper or
 * the operator before that), and "Settle the draw" for anyone once the randomness has landed.
 */
function RunControls({ d, stage, now }: { d: DrawView; stage: Stage; now: number }) {
  const { runDraw, settle, phase, errors, clearError, disabledReason } = useActions();
  if (stage === "due") {
    const open = anyoneCanRun(d, now);
    const busy = inFlight(phase.run);
    return (
      <div className="live-run">
        {open ? (
          <>
            <p className="t-small">The keeper hasn’t run it, so anyone can.</p>
            <button type="button" className="btn btn-56" onClick={runDraw} disabled={busy || !!disabledReason}>
              {busy && <Busy />}
              {phase.run === "signing" ? "Approve in your wallet…" : phase.run === "confirming" ? "Confirming…" : cancelsAtRequest(d) ? "Anyone: close the draw" : "Anyone: run the draw"}
            </button>
          </>
        ) : (
          <p className="t-small c-ink-2">
            The operator’s keeper runs it now. If it hasn’t by <span className="nw">{clock(publicFrom(d))} UTC</span>, anyone can, from this page.
          </p>
        )}
        {errors.run && <ErrorNote onDismiss={() => clearError("run")}>{errors.run.message}</ErrorNote>}
      </div>
    );
  }
  if (stage === "won") {
    const busy = inFlight(phase.settle);
    return (
      <div className="live-run">
        <button type="button" className="btn btn-56" onClick={settle} disabled={busy || !!disabledReason}>
          {busy && <Busy />}
          {phase.settle === "signing" ? "Approve in your wallet…" : phase.settle === "confirming" ? "Confirming…" : "Anyone: settle and pay"}
        </button>
        {errors.settle && <ErrorNote onDismiss={() => clearError("settle")}>{errors.settle.message}</ErrorNote>}
      </div>
    );
  }
  return null;
}
