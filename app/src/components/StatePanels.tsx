"use client";

import { useDrawSol } from "@/hooks/context";
import { PROGRAM_ID, SOURCE_URL } from "@/lib/config";
import { ProofLink } from "./bits";
import { utcHhmm } from "./fmt";

/** Loading: the card's shape with no numbers and no shimmer, just the shape and one line. */
export function HeroSkeleton() {
  return (
    <section className="hero hero-skel" aria-busy="true" aria-label="Loading the draw from devnet">
      <div className="hero-prize">
        <div className="skel sk-pill" />
        <div className="skel sk-h1" />
        <div className="skel sk-line" />
        <div className="skel sk-line short" />
        <p className="skel-note">Reading the draw from devnet…</p>
      </div>
      <div className="hero-panel">
        <div className="skel sk-line" />
        <div className="skel sk-bar" />
        <div className="skel sk-h2" />
        <div className="skel sk-bar" />
        <div className="skel sk-btn" />
      </div>
    </section>
  );
}

export function RpcError() {
  const { refresh } = useDrawSol();
  return (
    <section className="hero card hero-msg" role="alert">
      <h1 className="t-h2">Can’t reach devnet</h1>
      <p className="t-body c-2">We couldn’t read the draw from the Solana devnet RPC, so no numbers are shown. Nothing you hold is affected.</p>
      <div className="msg-act">
        <button type="button" className="btn btn-primary" onClick={refresh}>
          Try again
        </button>
      </div>
    </section>
  );
}

export function NoDraw({ reason }: { reason: "no-program" | "no-config" | "no-draws" }) {
  const copy = {
    "no-program": "The DrawSol program isn’t deployed on devnet yet.",
    "no-config": "The program is deployed but not set up yet.",
    "no-draws": "The program is live, but no draw has been opened yet.",
  }[reason];
  return (
    <section className="hero card hero-msg" aria-labelledby="nodraw-h">
      <h1 className="t-h2" id="nodraw-h">
        No draw is open right now
      </h1>
      <p className="t-body c-2">{copy} When one opens, this page shows it straight from the chain: its prize, its tickets and its draw time.</p>
      <div className="msg-act">
        <a className="btn btn-outline" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
          Read the source
        </a>
        <ProofLink account={PROGRAM_ID}>Program on Solscan</ProofLink>
      </div>
    </section>
  );
}

/**
 * Polls of the current draw keep failing after a good read: keep what was read, say when, and say the page is
 * trying again. A quiet notice, not an alarm; the sold figure also carries "as of" while this shows.
 */
export function StaleNote() {
  const { staleSince, retryIn, refresh } = useDrawSol();
  if (staleSince === null) return null;
  return (
    <div className="stale" role="status">
      <p>
        <b>Devnet isn’t answering.</b> Figures as of {utcHhmm(staleSince)} UTC
        {retryIn !== null ? <> · {retryIn > 0 ? `retrying in ${retryIn} s` : "retrying now…"}</> : null} ·{" "}
        <button type="button" className="tbtn" onClick={refresh}>
          Try now
        </button>
      </p>
    </div>
  );
}
