"use client";

import { useEffect, useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { useOraoRead } from "@/hooks/useOraoRead";
import { isDefaultKey } from "@/lib/derive";
import { drawRoll, toHex, winningTicket } from "@/lib/fairness";
import { ticketNo } from "@/lib/format";
import type { DrawView } from "@/lib/types";
import { Busy, Check, ProofLink } from "./bits";
import { groupDigits, n } from "./fmt";

export type SettleTx =
  | { kind: "searching" }
  | { kind: "found"; sig: string }
  /** the RPC answered and has no settle transaction for this draw */
  | { kind: "none" }
  /** the search itself failed (RPC error or rate limit): say so, never "not indexed" */
  | { kind: "error"; retry: () => void };

/** The settle_draw transaction of a settled draw, searched once per draw; null for a draw that isn't settled. */
export function useSettleTx(d: DrawView | null): SettleTx | null {
  const { findSettleTx } = useDrawSol();
  const [tx, setTx] = useState<SettleTx>({ kind: "searching" });
  const [nonce, setNonce] = useState(0);
  const key = d && d.status === "settled" ? `${d.address.toBase58()}:${d.settledAt}` : null;
  useEffect(() => {
    if (!d || !key) return;
    let alive = true;
    setTx({ kind: "searching" });
    findSettleTx(d)
      .then((s) => alive && setTx(s ? { kind: "found", sig: s } : { kind: "none" }))
      .catch(() => alive && setTx({ kind: "error", retry: () => setNonce((k) => k + 1) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, findSettleTx, nonce]);
  return key ? tx : null;
}

/** One line for the settlement transaction: its link, the search, an honest "not found" or a retry. */
export function SettleTxLine({ tx, label = "Settlement transaction" }: { tx: SettleTx | null; label?: string }) {
  if (!tx) return null;
  if (tx.kind === "found") return <ProofLink tx={tx.sig}>{label}</ProofLink>;
  if (tx.kind === "none") return <span className="c-3">{label}: the RPC has none indexed for this draw.</span>;
  if (tx.kind === "error")
    return (
      <span className="c-3">
        Couldn’t search for the settlement transaction.{" "}
        <button type="button" className="tbtn" onClick={tx.retry}>
          Try again
        </button>
      </span>
    );
  return (
    <span className="c-3">
      <Busy /> Finding the settlement transaction…
    </span>
  );
}

type Result = { r: bigint; w: number; match: boolean };

/**
 * Recompute the winning ticket in this browser with fairness.ts (real SHA-256) from the randomness stored on
 * the draw, then compare against the program's stored winner and ORAO's own request account.
 */
export function Recompute({ d }: { d: DrawView }) {
  const [res, setRes] = useState<Result | null>(null);
  const [allHex, setAllHex] = useState(false);
  const hex = toHex(d.randomness);
  const { o: orao, retry: readOrao } = useOraoRead(isDefaultKey(d.drawVrfRequest) ? null : d.drawVrfRequest, { enabled: false });
  const oraoLine = orao.kind === "fulfilled" ? (toHex(orao.bytes) === hex ? "match" : "mismatch") : orao.kind === "reading" || orao.kind === "idle" ? "checking" : "unavailable";

  const run = () => {
    setRes({ r: drawRoll(d.randomness), w: winningTicket(d.randomness, d.nextTicket), match: winningTicket(d.randomness, d.nextTicket) === d.winningTicket });
    readOrao();
  };

  return (
    <div className="card recompute" id="recompute" aria-labelledby="recompute-h">
      <h3 className="t-h3" id="recompute-h">
        Recompute the result in your browser
      </h3>
      <p className="panel-text">The winning ticket is plain arithmetic on ORAO’s randomness, so this page can redo it here and compare it with what the program stored.</p>
      <dl className="rc-lines">
        <div>
          <dt>ORAO randomness</dt>
          <dd>
            <code title={hex}>
              {hex.slice(0, 8)}…{hex.slice(-8)}
            </code>{" "}
            <button type="button" className="tbtn" onClick={() => setAllHex((v) => !v)} aria-expanded={allHex}>
              {allHex ? "Hide" : "Show all 64 bytes"}
            </button>
            {allHex && (
              <span className="rc-hex" aria-label="All 64 bytes of randomness">
                {hex.match(/.{1,8}/g)!.map((g, i) => (
                  <code key={i}>{g}</code>
                ))}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>sha256(randomness + “draw”), first 8 bytes as a number</dt>
          <dd className="tab">{res ? `r = ${groupDigits(res.r.toString())}` : "—"}</dd>
        </div>
        <div>
          <dt>r × {n(d.nextTicket)} tickets ÷ 2⁶⁴</dt>
          <dd className="tab">{res ? `= ticket ${ticketNo(res.w)}` : "—"}</dd>
        </div>
        <div>
          <dt>Winner stored on-chain</dt>
          <dd className="tab">{ticketNo(d.winningTicket)}</dd>
        </div>
      </dl>
      <div className="rc-act">
        <button type="button" className={`btn ${res ? "btn-outline" : "btn-primary"}`} onClick={run}>
          {res ? "Run it again" : "Recompute"}
        </button>
        <ProofLink account={d.drawVrfRequest}>ORAO request on Solscan</ProofLink>
      </div>
      {res && (
        <div aria-live="polite" className="rc-res">
          <p className={res.match ? "ok" : "bad"}>
            {res.match ? (
              <>
                <Check /> Match. This browser got {ticketNo(res.w)}, the ticket the program paid.
              </>
            ) : (
              <>No match. On-chain says {ticketNo(d.winningTicket)}; this browser got {ticketNo(res.w)}.</>
            )}
          </p>
          <p className={oraoLine === "mismatch" ? "bad" : ""}>
            {oraoLine === "checking" && (
              <>
                <Busy /> Checking ORAO’s request account…
              </>
            )}
            {oraoLine === "match" && "ORAO’s request account holds the same randomness."}
            {oraoLine === "mismatch" && "ORAO’s request account holds different randomness."}
            {oraoLine === "unavailable" && "ORAO’s request account isn’t readable right now; compare it on Solscan."}
          </p>
        </div>
      )}
    </div>
  );
}
