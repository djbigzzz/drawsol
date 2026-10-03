"use client";

import { useEffect, useId, useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { limitsOf } from "@/lib/derive";
import { sol, utcLabel } from "@/lib/format";
import { GAMBLE_AWARE_URL, LIMIT_INCREASE_DELAY } from "@/lib/config";
import { Busy, ErrorNote, ProofLink, inFlight, phaseLabel } from "./bits";

const LAMPORTS = BigInt(1_000_000_000);
const ZERO = BigInt(0);

/** "0.5" / "2" / ".25" → lamports; null when it isn't a plain positive amount with at most 9 decimals. */
export function parseSol(raw: string): bigint | null {
  const s = raw.trim().replace(",", ".");
  const m = s.match(/^(\d*)(?:\.(\d{0,9}))?$/);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) return null;
  const whole = BigInt(m[1] || "0");
  const frac = BigInt((m[2] ?? "").padEnd(9, "0") || "0");
  return whole * LAMPORTS + frac;
}

const BREAKS: [string, number][] = [
  ["24 hours", 86400],
  ["7 days", 7 * 86400],
  ["30 days", 30 * 86400],
  ["6 months", 182 * 86400],
];

/**
 * Play safe (SPEC-v3 §2.6), kept small: a spend limit per 30 days (lowering is immediate, raising or removing
 * waits 72 h) and a break from playing that can only be extended. Both live in the wallet's Profile and are
 * enforced by the program on every purchase.
 */
export function PlaySafe() {
  const { wallet, profile, profileState, now, refresh } = useDrawSol();
  const { setLimit, selfExclude, phase, errors, clearError, lastSig } = useActions();
  const { setVisible } = useWalletModal();
  const [amount, setAmount] = useState("");
  const [pick, setPick] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const lim = limitsOf(wallet ? profile : null, now);
  const lp = phase.limit;
  const ep = phase.exclude;

  useEffect(() => setAmount(""), [lastSig.limit]);
  useEffect(() => setConfirming(false), [lastSig.exclude]);

  const want = parseSol(amount);
  const raise = want !== null && (lim.limit === ZERO ? false : want > lim.limit);
  const breakFor = BREAKS[pick][1];
  const until = Math.max(now + breakFor, lim.excludedUntil);
  const busyL = inFlight(lp);
  const busyE = inFlight(ep);

  return (
    <section className="sec sec-safe" id="play-safe" aria-labelledby="play-safe-h">
      <details className="safe">
        <summary>
          <span className="t-h3" id="play-safe-h">
            Play safe
          </span>
          <span className="safe-sub">
            18+ · set a spend limit or take a break, enforced by the program ·{" "}
            <ProofLink href={GAMBLE_AWARE_URL}>BeGambleAware</ProofLink>
          </span>
        </summary>
        <div className="safe-body">
          {!wallet ? (
            <div className="card pad">
              <p className="panel-text">Connect a wallet to see what it has spent this period, set a limit or take a break.</p>
              <button type="button" className="btn btn-outline" onClick={() => setVisible(true)}>
                Connect wallet
              </button>
            </div>
          ) : profileState !== "ready" ? (
            <div className="card pad">
              {profileState === "error" ? (
                <p className="panel-text">
                  Can’t read this wallet’s limits from devnet right now.{" "}
                  <button type="button" className="tbtn" onClick={refresh}>
                    Try again
                  </button>
                </p>
              ) : (
                <p className="panel-text" aria-busy="true">
                  <Busy /> Reading this wallet’s limits from devnet…
                </p>
              )}
            </div>
          ) : (
            <div className="safe-grid">
              <div className="card pad">
                <h3 className="t-h4">Spend limit</h3>
                <dl className="panel-sum">
                  <div>
                    <dt>Spent this period</dt>
                    <dd className="tab">{sol(lim.spent, 2, 4)} SOL</dd>
                  </div>
                  <div>
                    <dt>Limit</dt>
                    <dd className="tab">{lim.limit === ZERO ? "none" : `${sol(lim.limit, 2, 4)} SOL`}</dd>
                  </div>
                  <div>
                    <dt>Period</dt>
                    <dd>{lim.periodEnd ? `resets ${utcLabel(lim.periodEnd).split(",")[0]}` : "starts at your next purchase"}</dd>
                  </div>
                </dl>
                {lim.pending && (
                  <p className="helper">
                    {lim.pending.lamports === ZERO ? "Removing the limit" : <>Raising it to {sol(lim.pending.lamports, 2, 4)} SOL</>} from{" "}
                    <span className="nw">{utcLabel(lim.pending.from)}</span>, 72 hours after you asked. Until then the current limit applies.
                  </p>
                )}
                <form
                  className="limit-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (want !== null && want > ZERO && !busyL) setLimit(want);
                  }}
                >
                  <label htmlFor={inputId} className="lbl">
                    Limit per 30 days, in SOL
                  </label>
                  <div className="limit-row">
                    <input id={inputId} className="input" inputMode="decimal" autoComplete="off" placeholder={lim.limit === ZERO ? "0.50" : sol(lim.limit, 2, 4)} value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby={hintId} disabled={busyL} />
                    <button type="submit" className="btn btn-outline" disabled={busyL || want === null || want === ZERO}>
                      {busyL && <Busy />}
                      {phaseLabel(lp, raise ? "Ask to raise it" : "Set limit")}
                    </button>
                  </div>
                  <p className="helper" id={hintId}>
                    Lowering it takes effect at once. Raising it, or removing it, takes {LIMIT_INCREASE_DELAY / 3600} hours.
                    {raise && want !== null ? ` ${sol(want, 2, 4)} SOL would apply from ${utcLabel(now + LIMIT_INCREASE_DELAY)}.` : ""}
                  </p>
                  {lim.limit > ZERO && !lim.pending && (
                    <button type="button" className="tbtn" onClick={() => setLimit(ZERO)} disabled={busyL}>
                      Remove the limit (after 72 hours)
                    </button>
                  )}
                </form>
                {errors.limit && <ErrorNote onDismiss={() => clearError("limit")}>{errors.limit.message}</ErrorNote>}
              </div>

              <div className="card pad">
                <h3 className="t-h4">Take a break</h3>
                <p className="panel-text">
                  {lim.excluded ? (
                    <>
                      This wallet is taking a break until <b className="nw">{utcLabel(lim.excludedUntil)}</b>. Until then the program won’t sell it tickets or free
                      entries. It can be made longer, never shorter.
                    </>
                  ) : (
                    <>Stop this wallet buying tickets or claiming free entries for a while. Once set, a break can be made longer but never shorter, by you or by us.</>
                  )}
                </p>
                {!confirming ? (
                  <>
                    <div className="breaks" role="radiogroup" aria-label="How long">
                      {BREAKS.map(([label], i) => (
                        <label key={label} className="brk">
                          <input type="radio" name="break" checked={pick === i} onChange={() => setPick(i)} />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    <button type="button" className="btn btn-outline" onClick={() => setConfirming(true)} disabled={busyE}>
                      {lim.excluded ? `Extend the break by ${BREAKS[pick][0]}` : `Take a break for ${BREAKS[pick][0]}`}
                    </button>
                  </>
                ) : (
                  <div className="confirm-break" role="group" aria-labelledby={`${inputId}-cb`}>
                    <p className="panel-text" id={`${inputId}-cb`}>
                      <b>
                        No tickets or free entries from this wallet until <span className="nw">{utcLabel(until)}</span>.
                      </b>{" "}
                      This can’t be shortened or undone, by you or by us. Tickets you already hold stay in their draws.
                    </p>
                    <div className="cb-act">
                      <button type="button" className="btn btn-primary" onClick={() => selfExclude(until)} disabled={busyE}>
                        {busyE && <Busy />}
                        {phaseLabel(ep, "Confirm the break")}
                      </button>
                      <button type="button" className="tbtn" onClick={() => setConfirming(false)} disabled={busyE}>
                        Keep things as they are
                      </button>
                    </div>
                  </div>
                )}
                {errors.exclude && <ErrorNote onDismiss={() => clearError("exclude")}>{errors.exclude.message}</ErrorNote>}
              </div>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
