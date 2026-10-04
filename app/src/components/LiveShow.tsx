"use client";

import { useEffect, useRef, useState } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { anyoneCanRun, cancelReason, cancelsAtRequest, entryAtPosition, grandPrize, liveDraw, phaseOf, publicFrom } from "@/lib/derive";
import { campaignOf, usdWhole } from "@/lib/campaigns";
import { winningPosition } from "@/lib/fairness";
import { clock, utcLabel } from "@/lib/format";
import { legacyVaultPda, vaultPda } from "@/lib/chain";
import type { DrawView } from "@/lib/types";
import { Addr, Busy, ErrorNote, Pill, ProofLink, inFlight, phaseLabel } from "./bits";
import { Countdown } from "./Hero";
import { n, plural, prizeFig, tnoOf } from "./fmt";
import { useSettleTx } from "./Recompute";

const ROLL_MS = 6800;
const LOOPS = 2;
/** ease-out quint: a long glide that settles on the ticket */
const ease = (t: number) => 1 - Math.pow(1 - t, 5);

/**
 * Where the roll's cursor is at progress p (0–1): it starts at position 0, runs LOOPS times through every
 * position and slows to a stop on the winning one. Presentation of a result already fixed by ORAO's randomness.
 */
const cursorAt = (p: number, k: number, w: number) => Math.floor(ease(p) * (LOOPS * k + w)) % Math.max(1, k);

type Stage = "countdown" | "due" | "pending" | "rolling" | "won" | "paid" | "cancelled";

/**
 * The /live page: a faceless draw show for streaming (OBS, a 1920×1080 browser source), driven purely by chain
 * state. Countdown to draw_at → "Drawing now" while ORAO is pending → the ticket numbers roll and stop on the
 * winning ticket (the winning position is computed in this browser with fairness.ts from ORAO's randomness;
 * the number at it is read from the entry that holds it) → WON, then PAID once settled, with the winner and
 * the payout link. A draw already settled shows its result at once.
 */
export function LiveShow({ raw }: { raw: string | null }) {
  const { load, draws, current: d, select, now, drawRandomness: r, stillRoll, entries } = useDrawSol();
  const reduced = useReducedMotion();
  const asked = raw !== null && /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : null;
  const next = liveDraw(draws);
  const nextId = next?.id ?? null;
  useEffect(() => {
    if (asked !== null) select(asked);
    else if (nextId !== null) select(nextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, nextId]);

  const fulfilled = !!d && ((d.status === "drawing" && !!r?.fulfilled && !!r.randomness) || d.status === "settled");
  const seen = useRef<{ key: string; pending: boolean } | null>(null);
  const [rollStart, setRollStart] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const key = d?.address.toBase58() ?? "";
  useEffect(() => {
    if (!d) return;
    if (!seen.current || seen.current.key !== key) {
      seen.current = { key, pending: !fulfilled };
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

  if (load.kind === "loading") return <p className="live-msg">Reading the draw from devnet…</p>;
  if (load.kind === "error")
    return (
      <p className="live-msg" role="alert">
        Can’t reach devnet, so no numbers are shown.
      </p>
    );
  if (!d) return <p className="live-msg">{asked !== null ? `There is no Draw № ${asked} on-chain.` : "No draw is open yet. When one opens, it is drawn here, live."}</p>;
  void tick;

  const ph = phaseOf(d, now);
  const rand = d.status === "settled" ? d.randomness : r?.fulfilled ? r.randomness : null;
  // the winning position, from the stored result or from the randomness
  const pos = d.status === "settled" ? d.winningPos : rand ? winningPosition(rand, d.nextPos) : null;
  // the roll runs through every position; on random-number draws each position shows the number assigned to it
  const ordered = d.randomNumbers ? entries.slice().sort((a, b) => a.seq - b.seq) : null;
  const numberAt = (p: number): number | null => {
    if (!ordered) return p;
    const e = entryAtPosition(ordered, p);
    return e && e.revealed ? e.tickets[p - e.firstPos] ?? null : null;
  };
  const w = pos === null ? null : d.status === "settled" ? d.winningTicket : numberAt(pos);
  const progress = stillRoll !== undefined ? stillRoll : rollStart !== null ? Math.min(1, (Date.now() - rollStart) / ROLL_MS) : 1;
  const rolling = pos !== null && progress < 1;

  let stage: Stage;
  if (ph === "cancelled") stage = "cancelled";
  else if (ph === "selling" || ph === "closed") stage = "countdown";
  else if (ph === "due") stage = "due";
  else if (pos === null) stage = "pending";
  else if (rolling) stage = "rolling";
  else stage = d.status === "settled" ? "paid" : "won";

  const cursor = stage === "rolling" && pos !== null ? cursorAt(progress, Math.max(1, d.nextPos), pos) : -1;
  const shown = stage === "rolling" ? numberAt(cursor) : w;
  return <Stage d={d} stage={stage} shown={shown} pos={stage === "won" || stage === "paid" ? pos : null} winning={stage === "won" || stage === "paid" ? w : null} now={now} />;
}

function Stage({ d, stage, shown, pos, winning, now }: { d: DrawView; stage: Stage; shown: number | null; pos: number | null; winning: number | null; now: number }) {
  const settleTx = useSettleTx(d);
  const camp = campaignOf(d.id);
  const prize = prizeFig(grandPrize(d));
  const vault = d.legacy ? legacyVaultPda(d.address) : vaultPda(d.address);
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
      ? d.nextPos === 0
        ? "No tickets were sold, so there is nothing to draw."
        : `Only ${n(d.paidTickets)} of the ${n(d.minTickets)} tickets it needed sold, so running it cancels it and everyone is refunded in full.`
      : "The draw time has passed. Next it is requested on-chain, and ORAO answers with the randomness, usually within seconds.",
    pending: "Randomness requested from ORAO. Waiting for it to land, usually a few seconds.",
    rolling: "ORAO’s randomness has landed. The winning position is computed from it in this browser.",
    won:
      winning === null && pos !== null
        ? `Position ${n(pos)} wins, computed from ORAO’s randomness; its number is written when that entry is revealed. Anyone can settle the draw now to pay the winner.`
        : "Computed from ORAO’s randomness. Anyone can settle the draw now to pay the winner.",
    paid: "Paid from the vault in the settle transaction.",
    cancelled:
      cancelReason(d) === "undersold"
        ? `Only ${n(d.paidTickets)} of the ${n(d.minTickets)} tickets it needed sold. Everyone is refunded in full.`
        : cancelReason(d) === "no-tickets"
          ? "No tickets were sold."
          : "The randomness never arrived within 48 hours. Every paid ticket can be refunded.",
  };
  const figure = shown !== null ? tnoOf(d, shown) : pos !== null ? `position ${n(pos)}` : "#????";
  return (
    <article className={`live stage-${stage}`} aria-labelledby="live-h">
      <header className="live-top">
        <p className="badge-row">
          <Pill tone="dark">Draw № {d.id}</Pill>
          <Pill tone={stage === "paid" || stage === "won" ? "accent" : stage === "cancelled" ? "neutral" : "warn"}>{stage === "countdown" ? "Live" : stage === "paid" ? "Paid" : stage === "won" ? "Won" : stage === "cancelled" ? "Cancelled" : "Drawing"}</Pill>
        </p>
        <h1 className="live-h" id="live-h">
          {camp ? camp.title : `Win ${prize} SOL`}
        </h1>
        <p className="live-prize">
          {stage === "paid" ? "Paid" : "Prize"} <b>{prize} SOL</b>
          {camp ? <span className="c-2"> · headlined as {usdWhole(camp.usd)}</span> : null} ·{" "}
          {stage === "paid" ? (
            <>
              to <Addr k={d.winner} link head={6} tail={6} />
            </>
          ) : (
            <ProofLink account={vault}>in the vault</ProofLink>
          )}
        </p>
      </header>

      <div className="live-main">
        <p className="live-voice" aria-live="polite">
          {(stage === "due" || stage === "pending") && <Busy />}
          {voice[stage]}
        </p>
        <div className="live-figure">
          {stage === "countdown" ? (
            <Countdown secs={d.drawAt - now} className="live-cd" />
          ) : stage === "due" || stage === "pending" ? (
            <p className="live-num c-3" aria-label="Winning ticket not known yet">
              #????
            </p>
          ) : stage === "cancelled" ? (
            <p className="live-num c-3">{n(d.paidTickets)} sold</p>
          ) : (
            <p className={`live-num tab ${stage === "rolling" ? "" : "c-win"}`} aria-label={stage === "rolling" ? undefined : `Winning ticket ${figure}`}>
              {stage === "rolling" && shown === null ? "#·,···" : figure}
            </p>
          )}
        </div>
        <p className="live-sub">{sub[stage]}</p>
        {stage === "paid" && (
          <p className="live-links">
            {settleTx?.kind === "found" ? <ProofLink tx={settleTx.sig}>Payout transaction</ProofLink> : <ProofLink account={d.winningEntry}>Winning entry</ProofLink>}
          </p>
        )}
        <RunControls d={d} stage={stage} now={now} />
      </div>

      <footer className="live-foot">
        <span>
          <b className="tab">{n(d.nextPos)}</b> {plural(d.nextPos, "ticket", "tickets")} in the draw
        </span>
        <span>
          {n(d.paidTickets)} paid{d.freeTickets ? `, ${d.freeTickets} free` : ""}
        </span>
        <span>Draw time {utcLabel(d.drawAt)}</span>
        {winning !== null && <span>Ticket {tnoOf(d, winning)} drawn</span>}
      </footer>
    </article>
  );
}

/** "Anyone can run the draw" once the public window has opened, and "Settle" once the randomness has landed. */
function RunControls({ d, stage, now }: { d: DrawView; stage: Stage; now: number }) {
  const { runDraw, settle, phase, errors, clearError, disabledReason } = useActions();
  if (d.legacy) return null;
  if (stage === "due") {
    const open = anyoneCanRun(d, now);
    const busy = inFlight(phase.run);
    return (
      <div className="live-run">
        {open ? (
          <button type="button" className="btn btn-primary btn-xl" onClick={runDraw} disabled={busy || !!disabledReason}>
            {busy && <Busy />}
            {phaseLabel(phase.run, cancelsAtRequest(d) ? "Anyone: close the draw" : "Anyone: run the draw")}
          </button>
        ) : (
          <p className="c-2">
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
        <button type="button" className="btn btn-primary btn-xl" onClick={settle} disabled={busy || !!disabledReason}>
          {busy && <Busy />}
          {phaseLabel(phase.settle, "Anyone: settle and pay")}
        </button>
        {errors.settle && <ErrorNote onDismiss={() => clearError("settle")}>{errors.settle.message}</ErrorNote>}
      </div>
    );
  }
  return null;
}
