"use client";

import { useDrawSol } from "@/hooks/context";
import { PROGRAM_ID, SOURCE_URL } from "@/lib/config";
import { ProofLink } from "./bits";
import { Microtext } from "./print/Mark";
import { utcHhmm } from "./fmt";

function Head() {
  return (
    <>
      <div className="tk-head">
        <span className="t-ticket-head">DrawSol · grand draw</span>
        <span className="t-serial c-ink-3">Nº ––––</span>
      </div>
      <span className="tk-headrule" aria-hidden="true">
        <span className="top" />
        <Microtext />
      </span>
    </>
  );
}

/** Loading: the ticket's shape, printed with nothing yet. No numbers, no shimmer. */
export function BoardSkeleton() {
  return (
    <div className="hero" aria-busy="true">
      <aside className="lede" aria-hidden="true" />
      <article className="ticket loading" aria-label="Loading the draw from devnet">
        <div className="tk-body">
          <Head />
          <p className="t-voice skel-voice">Reading the draw from devnet…</p>
          <span className="dbl" aria-hidden="true" />
          <div className="skel-gap" />
        </div>
        <div className="stub">
          <div className="stub-head">
            <span className="t-stub-head c-ink-3">Buy tickets</span>
          </div>
          <span className="dbl" aria-hidden="true" />
        </div>
      </article>
    </div>
  );
}

export function RpcError() {
  const { refresh } = useDrawSol();
  return (
    <div className="hero">
      <aside className="lede" aria-hidden="true" />
      <section className="blank paper" role="alert">
        <Head />
        <div style={{ paddingTop: 48, maxWidth: 640 }}>
          <h1 className="t-sec">Can’t reach devnet.</h1>
          <p className="t-body c-ink-2" style={{ marginTop: 16 }}>
            We couldn’t read the draw from the Solana devnet RPC, so we’re not showing any numbers. Nothing you hold is affected.
          </p>
          <button type="button" className="btn btn-56" style={{ marginTop: 32 }} onClick={refresh}>
            Try again
          </button>
        </div>
      </section>
    </div>
  );
}

export function NoDraw({ reason }: { reason: "no-program" | "no-config" | "no-draws" }) {
  const copy = {
    "no-program": "The DrawSol program isn’t deployed on devnet yet.",
    "no-config": "The program is deployed but not set up yet.",
    "no-draws": "The program is live, but no draw has been opened yet.",
  }[reason];
  return (
    <div className="hero">
      <aside className="lede" aria-hidden="true" />
      <section className="blank unprinted" aria-labelledby="nodraw-h">
        <Head />
        <div className="blank-grid">
          <div>
            <h1 className="t-sec" id="nodraw-h">
              No draw is open yet.
            </h1>
            <p className="t-body c-ink-2" style={{ marginTop: 16, maxWidth: "34em" }}>
              {copy} When one opens, its prize is locked in the vault before the first ticket sells, and this page shows it straight from the chain.
            </p>
          </div>
          <div>
            <p className="t-label">Every draw promises</p>
            <ul className="promise-list">
              <li>The prize is locked before the first ticket sells.</li>
              <li>It is drawn at sell-out or a fixed deadline.</li>
              <li>Nobody chooses the randomness (ORAO VRF).</li>
              <li>Anyone can run and settle it.</li>
            </ul>
            {/* list first, then the link and the (secondary) button: nothing outweighs the heading */}
            <div className="nodraw-act">
              <a className="btn btn-sec" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
                Read the source
              </a>
              <ProofLink account={PROGRAM_ID}>Program on Solscan</ProofLink>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Polls of the current draw keep failing after a good read: keep what was read, say when, and say the page
 * is trying again. One line (two at most on a phone), no box and no rule: a degraded-data notice, not an
 * alarm, so the ticket keeps its place in the first viewport. The lead-in in red ink like the other error
 * lead-ins; the ticket's sold figure also carries "as of" while this shows.
 */
export function StaleNote() {
  const { staleSince, retryIn, refresh } = useDrawSol();
  if (staleSince === null) return null;
  const hhmm = utcHhmm(staleSince);
  return (
    <div className="stale" role="status">
      <p className="stale-msg">
        <span className="stale-lead">Devnet isn’t answering.</span>{" "}
        <span className="nw">Figures as of {hhmm} UTC</span>
        {retryIn !== null ? (
          <>
            {" · "}
            <span className="nw">{retryIn > 0 ? `retrying in ${retryIn} s` : "retrying now…"}</span>
          </>
        ) : null}
        {" · "}
        <button type="button" className="tbtn" onClick={refresh}>
          Try now
        </button>
      </p>
    </div>
  );
}
