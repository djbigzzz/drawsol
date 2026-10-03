"use client";

import { useEffect, useId, useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { limitsOf } from "@/lib/derive";
import { sol, utcLabel } from "@/lib/format";
import { GAMBLE_AWARE_URL, LIMIT_INCREASE_DELAY } from "@/lib/config";
import { Busy, ErrorNote, inFlight, ProofLink, SectionGrid } from "./bits";
import { plural } from "./fmt";

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
 * Play limits (SPEC-v3 §2.6): the spend this 30-day period against the limit, setting a limit (lowering is
 * immediate, raising or removing waits 72 h, with a pending note), and a break from playing that can only be
 * extended. Both are stored in the wallet's Profile and enforced by the program on every purchase.
 */
export function PlayLimits() {
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

  // a finished change: clear the form (the profile re-reads on refresh)
  useEffect(() => setAmount(""), [lastSig.limit]);
  useEffect(() => setConfirming(false), [lastSig.exclude]);

  const intro = "A spend limit per 30 days and a break from playing, both enforced by the program for this wallet across every draw.";

  if (!wallet)
    return (
      <SectionGrid id="limits" title="Play limits" sub={intro}>
        <p className="t-body c-ink-2">Connect a wallet to see what it has spent this period, set a limit or take a break.</p>
        <button type="button" className="btn btn-sec" style={{ marginTop: 16 }} onClick={() => setVisible(true)}>
          Connect wallet
        </button>
      </SectionGrid>
    );
  if (profileState !== "ready")
    return (
      <SectionGrid id="limits" title="Play limits" sub={intro}>
        {profileState === "error" ? (
          <p className="t-body c-ink-2">
            Can’t read this wallet’s limits from devnet right now.{" "}
            <button type="button" className="tbtn" onClick={refresh}>
              Try again
            </button>
          </p>
        ) : (
          <p className="t-body c-ink-2" aria-busy="true">
            Reading this wallet’s limits from devnet…
          </p>
        )}
      </SectionGrid>
    );

  const want = parseSol(amount);
  const raise = want !== null && (lim.limit === ZERO ? false : want > lim.limit);
  const breakFor = BREAKS[pick][1];
  const until = Math.max(now + breakFor, lim.excludedUntil);
  const busyL = inFlight(lp);
  const busyE = inFlight(ep);

  return (
    <SectionGrid
      id="limits"
      title="Play limits"
      sub={intro}
      aside={
        <dl className="ledger big">
          <div>
            <dt>Spent this period</dt>
            <dd>{sol(lim.spent, 2, 4)} SOL</dd>
          </div>
          <div>
            <dt>Limit</dt>
            <dd>{lim.limit === ZERO ? "none" : `${sol(lim.limit, 2, 4)} SOL`}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd className="small">{lim.periodEnd ? `resets ${utcLabel(lim.periodEnd).split(",")[0]}` : "starts at your next purchase"}</dd>
          </div>
        </dl>
      }
    >
      <div className="limits-grid">
        <div className="limit-box">
          <h3 className="t-stub-head">Spend limit</h3>
          <p className="t-body">
            {lim.limit === ZERO ? (
              <>This wallet has no limit. Paid tickets count against a limit; free entries and credits don’t.</>
            ) : lim.headroom !== null && lim.headroom > ZERO ? (
              <>
                You can spend <b className="nw">{sol(lim.headroom, 2, 4)} SOL</b> more on tickets before the period resets.
              </>
            ) : (
              <>
                You’ve reached your limit. Paid tickets are blocked until the period resets{lim.periodEnd ? <> on <span className="nw">{utcLabel(lim.periodEnd)}</span></> : null}.
              </>
            )}
          </p>
          {lim.pending && (
            <p className="t-small pending">
              {lim.pending.lamports === ZERO ? "Removing the limit" : <>Raising it to <span className="nw">{sol(lim.pending.lamports, 2, 4)} SOL</span></>} from{" "}
              <span className="nw">{utcLabel(lim.pending.from)}</span>, 72 hours after you asked. Until then the current limit applies. Setting the current limit again
              cancels the change.
            </p>
          )}
          <form
            className="limit-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (want !== null && want > ZERO && !busyL) setLimit(want);
            }}
          >
            <label htmlFor={inputId} className="t-label">
              Limit per 30 days
            </label>
            <div className="limit-row">
              <span className="sol-in">
                <input
                  id={inputId}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={lim.limit === ZERO ? "0.50" : sol(lim.limit, 2, 4)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-describedby={hintId}
                  disabled={busyL}
                />
                <span aria-hidden="true">SOL</span>
              </span>
              <button type="submit" className="btn btn-sec" disabled={busyL || want === null || want === ZERO}>
                {busyL && <Busy />}
                {lp === "signing" ? "Approve in your wallet…" : lp === "confirming" ? "Confirming…" : raise ? "Ask to raise it" : "Set limit"}
              </button>
            </div>
            <p className="t-fine c-ink-2" id={hintId}>
              Lowering it takes effect at once. Raising it, or removing it, takes {LIMIT_INCREASE_DELAY / 3600} hours.
              {raise && want !== null ? ` ${sol(want, 2, 4)} SOL would apply from ${utcLabel(now + LIMIT_INCREASE_DELAY)}.` : ""}
            </p>
            {lim.limit > ZERO && !lim.pending && (
              <button type="button" className="tbtn" onClick={() => setLimit(ZERO)} disabled={busyL}>
                Remove the limit (after 72 hours)
              </button>
            )}
          </form>
          {errors.limit && (
            <div className="c-err">
              <ErrorNote onDismiss={() => clearError("limit")}>{errors.limit.message}</ErrorNote>
            </div>
          )}
        </div>

        <div className="limit-box">
          <h3 className="t-stub-head">Take a break</h3>
          {lim.excluded ? (
            <p className="t-body">
              This wallet is taking a break until <b className="nw">{utcLabel(lim.excludedUntil)}</b>. Until then the program won’t sell it tickets or free entries.
              It can be made longer, never shorter.
            </p>
          ) : (
            <p className="t-body">Stop this wallet buying tickets or claiming free entries for a while. Once set, a break can be made longer but never shorter, by you or by us.</p>
          )}
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
              <button type="button" className="btn btn-sec" onClick={() => setConfirming(true)} disabled={busyE}>
                {lim.excluded ? `Extend the break by ${BREAKS[pick][0]}` : `Take a break for ${BREAKS[pick][0]}`}
              </button>
            </>
          ) : (
            <div className="confirm-break" role="group" aria-labelledby={`${inputId}-cb`}>
              <p className="t-body" id={`${inputId}-cb`}>
                <b>
                  No tickets or free entries from this wallet until <span className="nw">{utcLabel(until)}</span>.
                </b>{" "}
                This can’t be shortened or undone, by you or by us. Tickets you already hold stay in their draws.
              </p>
              <div className="cb-act">
                <button type="button" className="btn" onClick={() => selfExclude(until)} disabled={busyE}>
                  {busyE && <Busy />}
                  {ep === "signing" ? "Approve in your wallet…" : ep === "confirming" ? "Confirming…" : "Confirm the break"}
                </button>
                <button type="button" className="tbtn" onClick={() => setConfirming(false)} disabled={busyE}>
                  Keep things as they are
                </button>
              </div>
            </div>
          )}
          {errors.exclude && (
            <div className="c-err">
              <ErrorNote onDismiss={() => clearError("exclude")}>{errors.exclude.message}</ErrorNote>
            </div>
          )}
          <p className="t-small c-ink-2 limit-help">
            If it stops being fun, <ProofLink href={GAMBLE_AWARE_URL}>BeGambleAware</ProofLink> can help. This wallet’s credits:{" "}
            <span className="nw">
              {lim.credits} free {plural(lim.credits, "ticket", "tickets")}
            </span>
            .
          </p>
        </div>
      </div>
    </SectionGrid>
  );
}
