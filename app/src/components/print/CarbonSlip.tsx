"use client";

import { useState } from "react";
import { useOraoRead } from "@/hooks/useOraoRead";
import { isDefaultKey } from "@/lib/derive";
import { drawRoll, toHex, winningTicket } from "@/lib/fairness";
import { ticketNo } from "@/lib/format";
import type { DrawView } from "@/lib/types";
import { Busy, Check, ProofLink } from "../bits";
import { groupDigits } from "../fmt";

type Result = { r: bigint; w: number; match: boolean };

/**
 * The carbon copy: a duplicate-book slip that redoes the winning-ticket arithmetic in this browser
 * with fairness.ts (real SHA-256), then compares against the program and ORAO's own account.
 * The arithmetic needs no network, so it prints at once; the ORAO comparison fills in when its read lands
 * (one read shared with the draw record, so the two never disagree).
 */
export function CarbonSlip({ d, tilt = false, id }: { d: DrawView; tilt?: boolean; id?: string }) {
  const [res, setRes] = useState<Result | null>(null);
  const [runs, setRuns] = useState(0);
  const [allHex, setAllHex] = useState(false);
  const hex = toHex(d.randomness);
  const n = `Draw Nº ${d.id}`;
  const { o: orao, retry: readOrao } = useOraoRead(isDefaultKey(d.drawVrfRequest) ? null : d.drawVrfRequest, { enabled: false });
  const oraoLine =
    orao.kind === "fulfilled" ? (toHex(orao.bytes) === hex ? "match" : "mismatch") : orao.kind === "reading" || orao.kind === "idle" ? "checking" : "unavailable";

  const run = () => {
    const r = drawRoll(d.randomness);
    const w = winningTicket(d.randomness, d.nextTicket);
    setRes({ r, w, match: w === d.winningTicket });
    setRuns((x) => x + 1);
    // a failed or pending read is tried again on every run; a fulfilled one is final
    readOrao();
  };

  const pen = (i: number) => ({ className: "vl inked appear", style: { animationDelay: `${i * 120}ms` } });

  return (
    <div className={`slip carbon ${tilt ? "tilt" : ""}`} id={id} aria-labelledby={`${id ?? "slip"}-h`}>
      <p className="t-small c-ink-2" style={{ fontStyle: "italic" }}>
        Carbon copy
      </p>
      <h3 className="t-stub-head" id={`${id ?? "slip"}-h`}>
        Recompute <span className="nw">{n}</span> in this browser
      </h3>
      <div className="slip-lines">
        <div className="slip-line">
          <span className="lb">ORAO randomness</span>
          <span className="vl nw" title={hex}>
            {hex.slice(0, 8)}…{hex.slice(-8)}{" "}
            <button type="button" className="tbtn" onClick={() => setAllHex((v) => !v)} aria-expanded={allHex}>
              {allHex ? "Hide" : "Show all 64 bytes"}
            </button>
          </span>
        </div>
        {allHex && (
          <div className="slip-hex" aria-label="All 64 bytes of randomness">
            {hex.match(/.{1,8}/g)!.map((g, i) => (
              <span key={i} className="nw">
                {g}
              </span>
            ))}
          </div>
        )}
        <div className="slip-line">
          <span className="lb">
            <span className="lg">sha256(randomness + “draw”), first 8 bytes as a number</span>
            <span className="sh">First 8 bytes of sha256</span>
          </span>
          {res ? <span key={`a${runs}`} {...pen(0)}>r = {groupDigits(res.r.toString())}</span> : <span className="vl dash">—</span>}
        </div>
        <div className="slip-line">
          <span className="lb">
            <span className="lg">r × {d.nextTicket} tickets ÷ 2⁶⁴</span>
            <span className="sh">r × {d.nextTicket} ÷ 2⁶⁴</span>
          </span>
          {res ? <span key={`b${runs}`} {...pen(1)}>= ticket {ticketNo(res.w)}</span> : <span className="vl dash">—</span>}
        </div>
        <div className="slip-line">
          <span className="lb">
            <span className="lg">Winner stored on-chain</span>
            <span className="sh">Stored winner</span>
          </span>
          <span className="vl">{ticketNo(d.winningTicket)}</span>
        </div>
      </div>
      <div className="go">
        <button type="button" className={`btn btn-15 ${res ? "btn-blue-sec" : "btn-blue"}`} onClick={run}>
          {res ? "Run it again" : "Recompute"}
        </button>
      </div>
      {res && (
        <div aria-live="polite">
          <p className="res t-small appear" key={`r${runs}`} style={{ animationDelay: "240ms" }}>
            {res.match ? (
              <>
                <span className="ok">
                  <Check /> Match.
                </span>{" "}
                This browser got {ticketNo(res.w)}, the ticket the program paid.
              </>
            ) : (
              <>
                <span className="no">No match.</span> On-chain says {ticketNo(d.winningTicket)}; this browser got {ticketNo(res.w)}.
              </>
            )}
          </p>
          <p className={`orao t-small appear ${oraoLine === "mismatch" ? "bad" : ""}`} style={{ animationDelay: "360ms" }}>
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
      {/* 16px keeps this link's 44px hit area clear of the Recompute button above */}
      <p className="t-small" style={{ marginTop: 16 }}>
        <ProofLink account={d.drawVrfRequest}>ORAO request on Solscan</ProofLink>
      </p>
    </div>
  );
}
