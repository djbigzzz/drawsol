"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { anyoneCanRun, cancelReason, cancelsAtRequest, canCancel, grandPrize, limitsOf, phaseOf, publicFrom, remaining, walletAllowance, type Limits } from "@/lib/derive";
import { clock, oneIn, shortDate, sol, ticketNo, ticketRange, utcLabel } from "@/lib/format";
import { AIRDROP_LAMPORTS, CANCEL_GRACE_SECS, FAUCET_URL, LOW_BALANCE_LAMPORTS, SOLFAUCET_URL } from "@/lib/config";
import { inkAt } from "@/lib/print";
import type { DrawView, EntryView } from "@/lib/types";
import { Busy, Check, ErrorNote, inFlight, Minus, Plus, ProofLink } from "./bits";
import { useBuy, type BuyMode } from "./BuyContext";
import { AdultRow, ConfirmStep, Guarantee } from "./ConfirmStep";
import { FeeLine, useFees } from "./Fee";
import { kindName, plural, solRound, stampDay, prizeFig } from "./fmt";
import { Stamp } from "./print/Stamp";
import { PenLoop, PICKS } from "./Picks";
import { CarbonSlip } from "./print/CarbonSlip";

const AIRDROP_SOL = sol(BigInt(AIRDROP_LAMPORTS), 0, 2);

/** Which buy button the stub and the bar show, in priority order (DESIGN.md §5.5). */
export function useBuyButton() {
  const { current: d, wallet, player, profile, now } = useDrawSol();
  const { disabledReason } = useActions();
  const { paidPart, creditPart } = useBuy();
  const fees = useFees();
  if (!d) return null;
  const allowance = walletAllowance(d, player, creditPart);
  // only the paid part costs SOL; credit tickets are free
  const subtotal = d.ticketPrice * BigInt(paidPart);
  const lim = limitsOf(wallet ? profile : null, now);
  if (!wallet) return { kind: "connect" as const, subtotal };
  if (lim.excluded) return { kind: "excluded" as const, subtotal, lim };
  if (allowance.wallet === 0) return { kind: "cap" as const, subtotal, held: allowance.held };
  if (lim.headroom !== null && subtotal > lim.headroom) return { kind: "limit" as const, subtotal, lim };
  if (wallet.balance !== null && wallet.balance < subtotal + (fees ?? BigInt(0)))
    return { kind: "low" as const, subtotal, balance: wallet.balance, need: fees !== null ? subtotal + fees : null };
  if (disabledReason) return { kind: "disabled" as const, subtotal, reason: disabledReason };
  if (remaining(d) === 0) return { kind: "disabled" as const, subtotal, reason: "Every paid ticket has sold." };
  return { kind: "buy" as const, subtotal };
}

/** "Buy 5 tickets · 0.02 SOL", or with only credits "Use 3 free tickets" (the total is the paid part only). */
export function buyLabel(qty: number, paid: number, subtotal: bigint, short = false) {
  if (paid === 0) return short ? `Use ${qty} free` : `Use ${qty} free ${plural(qty, "ticket", "tickets")}`;
  return short ? `Buy ${qty} · ${sol(subtotal, 2, 4)} SOL` : `Buy ${qty} ${plural(qty, "ticket", "tickets")} · ${sol(subtotal, 2, 4)} SOL`;
}

/** Why a wallet can't buy right now because of its own play limits, in plain words, with the way to them. */
export function LimitNote({ kind, lim, price }: { kind: "excluded" | "limit"; lim: Limits; price: bigint }) {
  if (kind === "excluded")
    return (
      <p className="helper t-small limit-note">
        This wallet is taking a break until <span className="nw">{utcLabel(lim.excludedUntil)}</span>, as it asked. The program won’t sell it tickets or free
        entries before then.{" "}
        <a className="tbtn" href="#limits">
          Play limits
        </a>
      </p>
    );
  const left = lim.headroom ?? BigInt(0);
  return (
    <p className="helper t-small limit-note">
      You’ve spent <span className="nw">{sol(lim.spent, 2, 4)}</span> of your <span className="nw">{sol(lim.limit, 2, 4)} SOL</span> play limit in this 30-day
      period
      {left >= price ? (
        <>
          , so you can pay for {Number(left / price)} more {plural(Number(left / price), "ticket", "tickets")} until it resets
        </>
      ) : (
        <>, so there’s no room for a paid ticket until it resets</>
      )}
      {lim.periodEnd ? (
        <>
          {" "}
          on <span className="nw">{shortDate(lim.periodEnd)}</span>
        </>
      ) : null}
      .{" "}
      <a className="tbtn" href="#limits">
        Play limits
      </a>
    </p>
  );
}

/** "You have 3 free tickets" and the "use credits" control: the quantity splits between credits and paid. */
function CreditsRow() {
  const { credits, useCredits, setUseCredits, creditPart, paidPart, qty } = useBuy();
  if (credits <= 0) return null;
  return (
    <div className="credits">
      <p className="t-body credits-have">
        You have <b className="nw">{credits} free {plural(credits, "ticket", "tickets")}</b>, won as instant prizes.
      </p>
      <label className="age credits-use">
        <input type="checkbox" checked={useCredits} onChange={(e) => setUseCredits(e.target.checked)} />
        <span>
          Use credits{" "}
          <span className="sub">
            {useCredits
              ? paidPart === 0
                ? qty === 1
                  ? "this ticket is free"
                  : `all ${qty} are free`
                : `${creditPart} free, ${paidPart} paid`
              : "pay for every ticket"}
          </span>
        </span>
      </label>
    </div>
  );
}

/**
 * A connected wallet whose devnet balance is below one ticket plus fees, or below 0.05 SOL: the stub
 * offers "Get devnet SOL". null when not connected or the balance hasn't been read (never guessed).
 */
export function useLowBalance() {
  const { current: d, wallet } = useDrawSol();
  const fees = useFees();
  if (!d || !wallet || wallet.balance === null) return null;
  const one = d.ticketPrice + (fees ?? BigInt(0));
  const floor = one > LOW_BALANCE_LAMPORTS ? one : LOW_BALANCE_LAMPORTS;
  return wallet.balance < floor ? { balance: wallet.balance } : null;
}

/** The stub of the draw ticket: where you buy, or run, settle and refund. */
export function BuyPanel() {
  const { current: d, now } = useDrawSol();
  if (!d) return null;
  const ph = phaseOf(d, now);
  return (
    <div className="stub" id="buy" aria-label={ph === "selling" ? "Enter the draw" : "The draw"}>
      {ph === "selling" && <Selling d={d} />}
      {ph === "closed" && <Closed d={d} />}
      {ph === "due" && <Due d={d} now={now} />}
      {ph === "drawing" && <Drawing d={d} now={now} />}
      {ph === "settled" && <Settled d={d} />}
      {ph === "cancelled" && <Cancelled d={d} />}
    </div>
  );
}

const TABS: [BuyMode, string][] = [
  ["buy", "Buy tickets"],
  ["free", "Free entry"],
];

/**
 * "Buy tickets" / "Free entry": two tabs of equal weight (same face, size and weight; the open one is
 * ink with a 3px ink tab rule, the other ink-2). The stub and the mobile bar share one state.
 */
function EntryTabs({ prefix, panel, className = "" }: { prefix: string; panel: string; className?: string }) {
  const { mode, setMode } = useBuy();
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: BuyMode = e.key === "Home" ? "buy" : e.key === "End" ? "free" : mode === "buy" ? "free" : "buy";
    setMode(next);
    document.getElementById(`${prefix}-${next}`)?.focus();
  };
  return (
    <div className={`tabs ${className}`} role="tablist" aria-label="How to enter">
      {TABS.map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="tab"
          id={`${prefix}-${k}`}
          className="tab"
          aria-selected={mode === k}
          aria-controls={panel}
          tabIndex={mode === k ? 0 : -1}
          onClick={() => setMode(k)}
          onKeyDown={onKey}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Selling({ d }: { d: DrawView }) {
  const { step, barMode, closeConfirm, mode } = useBuy();
  const { phase } = useActions();
  const confirm = step === "confirm" && !barMode && mode === "buy";
  return (
    <>
      {/* one head slot: the tabs swap to "Check and pay" in place (160ms crossfade) */}
      <div className={`stub-head ${confirm || barMode ? "" : "has-tabs"}`} key={confirm ? "confirm" : "pick"}>
        {confirm ? (
          <>
            <h2 className="t-stub-head stub-in" id="confirm-h" tabIndex={-1}>
              Check and pay
            </h2>
            <button type="button" className="tbtn stub-in" onClick={closeConfirm} disabled={inFlight(phase.buy)}>
              Change quantity
            </button>
          </>
        ) : (
          barMode ? (
            // below 1024px the sticky bar holds the one interactive tablist; the info-only stub names the mode
            <h2 className="t-stub-head stub-mode">{mode === "free" ? "Free entry" : "Buy tickets"}</h2>
          ) : (
            <>
              <h2 className="sr-only">Enter Draw Nº {d.id}</h2>
              <EntryTabs prefix="tab" panel="stub-panel" />
            </>
          )
        )}
      </div>
      <span className="dbl" aria-hidden="true" />
      {confirm ? (
        <ConfirmStep headingId="confirm-h" inStub />
      ) : barMode ? (
        <div key={mode} className="stub-in">
          {mode === "free" ? <FreeEntry d={d} controls={false} /> : <Pick d={d} controls={false} />}
        </div>
      ) : (
        <div id="stub-panel" role="tabpanel" aria-labelledby={`tab-${mode}`} key={mode} className="stub-in">
          {mode === "free" ? <FreeEntry d={d} controls /> : <Pick d={d} controls />}
        </div>
      )}
    </>
  );
}

function Pick({ d, controls }: { d: DrawView; controls: boolean }) {
  const { wallet, player, myEntries, myState } = useDrawSol();
  const { airdrop, phase, lastSig } = useActions();
  // this wallet's counts are shown only once its accounts have been read
  const mineRead = myState === "ready";
  const spent = player?.spent ?? myEntries.reduce((n, e) => n + e.paidLamports, BigInt(0));
  const won = player?.won ?? myEntries.reduce((n, e) => n + e.solPaid, BigInt(0));
  const { qty, setQty, maxQ, openConfirm, connectThenConfirm, paidPart, creditPart } = useBuy();
  const bb = useBuyButton();
  const low = useLowBalance();
  const allowance = walletAllowance(d, player, creditPart);
  const held = player?.tickets ?? myEntries.reduce((n, e) => n + e.count, 0);
  const subtotal = d.ticketPrice * BigInt(paidPart);
  const label = buyLabel(qty, paidPart, subtotal);
  // the pen only draws on when you choose; not on load
  const [inked, setInked] = useState(false);
  const choose = (n: number) => {
    setInked(true);
    setQty(n);
  };
  // the fixed picks below the allowance, then "Max (N)": the most this wallet can buy in one go now
  const picks = PICKS.filter((p) => p < maxQ);
  const ap = phase.airdrop;
  const airBusy = inFlight(ap);

  const capped = bb?.kind === "cap";
  const lowHelp =
    bb?.kind === "low" ? (
      <>
        You have <span className="nw">{sol(bb.balance, 2, 4)} SOL</span>.{" "}
        {bb.need !== null ? (
          <>
            {qty} {plural(qty, "ticket needs", "tickets need")} <span className="nw">≈{solRound(bb.need, 3, 3)} SOL</span> with fees.
          </>
        ) : (
          <>That’s less than {qty} {plural(qty, "ticket costs", "tickets cost")} with fees.</>
        )}
      </>
    ) : null;

  let btn: { label: string; onClick?: () => void; disabled: boolean };
  switch (bb?.kind) {
    case "connect":
      btn = { label: "Connect wallet to buy", onClick: connectThenConfirm, disabled: false };
      break;
    case "cap":
      btn = { label: `Wallet limit reached (${bb.held} of ${d.maxPerWallet})`, disabled: true };
      break;
    case "excluded":
      btn = { label: `Taking a break until ${shortDate(bb.lim.excludedUntil)}`, disabled: true };
      break;
    case "limit":
      btn = { label: "Over your play limit", disabled: true };
      break;
    case "disabled":
      btn = { label, disabled: true };
      break;
    default:
      btn = { label, onClick: openConfirm, disabled: false };
  }
  const airLabel = ap === "simulating" ? "Asking the devnet faucet…" : ap === "confirming" ? "Confirming on devnet…" : "Get devnet SOL";
  const arrived = ap === "done" && lastSig.airdrop && !low;

  return (
    <div className="stub-pick">
      {bb?.kind === "cap" && (
        <p className="cap-line t-body">
          You hold {bb.held} of {d.maxPerWallet} tickets, the most one wallet can hold in Draw Nº {d.id}.{" "}
          <a className="tbtn" href="#my-tickets">
            See them
          </a>
        </p>
      )}
      {capped && controls && (
        <button type="button" id="stub-buy" className="btn btn-block btn-56 buy-btn" disabled>
          {btn.label}
        </button>
      )}
      {/* below 1024px the bar holds the buttons; the stub states the guarantee and explains */}
      {!controls && !capped && <Guarantee d={d} className="g-top" />}
      {!controls && (bb?.kind === "excluded" || bb?.kind === "limit") && <LimitNote kind={bb.kind} lim={bb.lim} price={d.ticketPrice} />}
      {!controls && !capped && bb?.kind !== "excluded" && <CreditsRow />}
      {!controls && low && <DevnetSol low={low.balance} help={lowHelp} action={bb?.kind !== "low"} />}
      {controls && !capped && (
        <div>
          <div className="qty">
            <button type="button" className="punch" aria-label="One fewer ticket" onClick={() => choose(qty - 1)} disabled={qty <= 1}>
              <Minus />
            </button>
            <output aria-live="polite" aria-label={`${qty} ${plural(qty, "ticket", "tickets")}`}>
              <span className="t-qty">{qty}</span>
              <span className="t-label">{plural(qty, "ticket", "tickets")}</span>
            </output>
            <button type="button" className="punch" aria-label="One more ticket" onClick={() => choose(qty + 1)} disabled={qty >= maxQ}>
              <Plus />
            </button>
          </div>
          <ul className="picks" aria-label="Quick picks">
            {picks.map((p) => (
              <li key={p}>
                <button type="button" aria-pressed={qty === p} onClick={() => choose(p)}>
                  {p}
                  {qty === p && <PenLoop key={`pen-${qty}`} pick={p} inked={inked} />}
                </button>
              </li>
            ))}
            {maxQ > 0 && (
              <li>
                <button type="button" className="max" aria-pressed={qty === maxQ} onClick={() => choose(maxQ)} aria-label={`Max, ${maxQ} ${plural(maxQ, "ticket", "tickets")}`}>
                  Max ({maxQ})
                  {qty === maxQ && <PenLoop key={`pen-max-${qty}`} pick={maxQ + 3} inked={inked} />}
                </button>
              </li>
            )}
          </ul>
          {bb?.kind !== "excluded" && <CreditsRow />}
          <div className="fee-row">
            <FeeLine />
          </div>
          {bb?.kind === "low" ? (
            <button type="button" id="stub-buy" className="btn btn-block btn-56 buy-btn" onClick={airdrop} disabled={airBusy}>
              {airBusy && <Busy />}
              {airLabel}
            </button>
          ) : (
            <button type="button" id="stub-buy" className="btn btn-block btn-56 buy-btn" onClick={btn.onClick} disabled={btn.disabled}>
              {btn.label}
            </button>
          )}
          {bb?.kind === "low" ? (
            <>
              <DevnetSol low={bb.balance} help={lowHelp} action={false} />
              <Guarantee d={d} />
            </>
          ) : (
            <>
              {bb?.kind === "disabled" && <p className="helper t-fine">{bb.reason}</p>}
              {(bb?.kind === "excluded" || bb?.kind === "limit") && <LimitNote kind={bb.kind} lim={bb.lim} price={d.ticketPrice} />}
              <Guarantee d={d} />
              {low && <DevnetSol low={low.balance} action />}
            </>
          )}
          {arrived && (
            <p className="helper t-small">
              {AIRDROP_SOL} devnet SOL arrived from the faucet. <ProofLink tx={lastSig.airdrop}>Faucet transaction</ProofLink>
            </p>
          )}
        </div>
      )}
      <div>
        <dl className="ledger">
          <div>
            <dt>Ticket price, flat</dt>
            <dd>{sol(d.ticketPrice, 2, 4)} SOL</dd>
          </div>
          <div>
            <dt>{d.nextTicket > 0 ? "Grand-prize odds, per ticket" : "Grand-prize odds"}</dt>
            <dd>{d.nextTicket > 0 ? `${oneIn(1, d.nextTicket)} now` : "No tickets yet"}</dd>
          </div>
          {wallet ? (
            <>
              {/* at the limit the sentence above already says how many you hold */}
              {!capped && (
                <div>
                  <dt>You hold</dt>
                  <dd>
                    {mineRead ? (
                      <>
                        {held}
                        {held > 0 && (
                          <a className="tbtn" href="#my-tickets">
                            see them
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="c-ink-3">{myState === "error" ? "can’t read" : "…"}</span>
                    )}
                  </dd>
                </div>
              )}
              {capped ? (
                <>
                  <div>
                    <dt>Your grand-prize odds</dt>
                    <dd>{oneIn(held, d.nextTicket)} now</dd>
                  </div>
                  <div>
                    <dt>Spent</dt>
                    <dd>{sol(spent, 2, 4)} SOL</dd>
                  </div>
                  <div className={won > BigInt(0) ? "won" : ""}>
                    <dt>Won so far</dt>
                    <dd>{sol(won, 2, 4)} SOL</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt>You can still buy</dt>
                  <dd>{mineRead ? Math.min(allowance.wallet, remaining(d)) : <span className="c-ink-3">{myState === "error" ? "—" : "…"}</span>}</dd>
                </div>
              )}
            </>
          ) : (
            <div>
              <dt>Connect a wallet to see your tickets.</dt>
              <dd />
            </div>
          )}
        </dl>
        <p className="limits t-fine">
          {d.maxPerTx} per purchase, {d.maxPerWallet} per wallet.
        </p>
      </div>
    </div>
  );
}

/**
 * "Get devnet SOL": asks the public devnet faucet for 0.5 SOL from the visitor's own browser
 * (`connection.requestAirdrop`), confirms it and re-reads the balance. On failure it says why, plainly,
 * and points to the two web faucets. Devnet SOL is play money; nothing here implies otherwise.
 */
function DevnetSol({ low, help, action }: { low: bigint; help?: ReactNode; action: boolean }) {
  const { airdrop, phase, errors, clearError } = useActions();
  const ap = phase.airdrop;
  const busy = inFlight(ap);
  const err = errors.airdrop;
  return (
    <div className="drip">
      <p className="t-small drip-line">
        {help ?? (
          <>
            You have <span className="nw">{sol(low, 2, 4)} devnet SOL</span>.
          </>
        )}{" "}
        {action && (
          <button type="button" className="tbtn" onClick={airdrop} disabled={busy}>
            {busy && <Busy />}
            {ap === "simulating" ? "Asking the devnet faucet…" : ap === "confirming" ? "Confirming on devnet…" : `Get ${AIRDROP_SOL} devnet SOL`}
          </button>
        )}
      </p>
      <p className="t-fine drip-fine">
        Asks the public devnet faucet for {AIRDROP_SOL} SOL, from your browser. Devnet SOL is play money: it has no value and can’t be cashed out.
      </p>
      {err && (
        <div className="drip-err">
          <ErrorNote onDismiss={() => clearError("airdrop")}>{err.message}</ErrorNote>
          <p className="t-small drip-alt">
            Other ways to get it: <ProofLink href={FAUCET_URL}>faucet.solana.com</ProofLink> (sign in with GitHub there and its airdrop button works for you), or{" "}
            <ProofLink href={SOLFAUCET_URL}>solfaucet.com</ProofLink>. Paste your wallet address there, then come back here.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The "Free entry" tab: plain rules, this draw's free entries left, whether this wallet has claimed,
 * then the claim (≥ 1024px here; below that in the sheet, opened from the bar). The chance line is the
 * interim copy for today's program: a free entry is one ticket in the grand draw and has no instant roll.
 */
function FreeEntry({ d, controls, sheet = false, headingId }: { d: DrawView; controls: boolean; sheet?: boolean; headingId?: string }) {
  const { wallet, player, myEntries, myState, costs, profile, profileState, now } = useDrawSol();
  const { claimFree, phase, errors, clearError, disabledReason } = useActions();
  const lim = limitsOf(wallet ? profile : null, now);
  const rolls = d.kind === "pot" && d.iwDenominator > 0;
  const { adultRemembered, rememberAdult, forgetAdult, closeConfirm } = useBuy();
  const { setVisible } = useWalletModal();
  const low = useLowBalance();
  const [adult, setAdult] = useState(false);

  useEffect(() => {
    if (!sheet || !headingId) return;
    const t = setTimeout(() => document.getElementById(headingId)?.focus({ preventScroll: true }), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeConfirm();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [sheet, headingId, closeConfirm]);

  const freeLeft = Math.max(0, d.freeCap - d.freeTickets);
  const read = myState === "ready";
  const mine = myEntries.find((e) => e.isFree);
  const claimed = read && (!!mine || !!player?.freeClaimed);
  const atCap = read && (player?.tickets ?? 0) >= d.maxPerWallet;
  const fp = phase.free;
  const busy = inFlight(fp);
  const ageOk = adultRemembered || adult;
  // what the claimant's wallet pays: rent for the entry record (+ the player record the first time), from chain
  const rent =
    costs.entryRent !== null && read && profileState === "ready" && (player || costs.playerRent !== null) && (profile || costs.profileRent !== null)
      ? costs.entryRent + (player ? BigInt(0) : costs.playerRent ?? BigInt(0)) + (profile ? BigInt(0) : costs.profileRent ?? BigInt(0))
      : null;
  const fee = rolls && costs.oraoFee !== null ? costs.oraoFee : null;

  const claim = () => {
    if (!ageOk || busy) return;
    if (adult) rememberAdult();
    claimFree();
  };

  const status = !wallet ? (
    <span className="c-ink-3">connect to check</span>
  ) : !read ? (
    <span className="c-ink-3">{myState === "error" ? "can’t read" : "…"}</span>
  ) : claimed ? (
    <>Claimed{mine ? <>: {ticketNo(mine.firstTicket)}</> : null}</>
  ) : (
    "Not claimed"
  );

  let action: ReactNode = null;
  if (claimed) {
    action = (
      <p className="free-done t-body">
        {mine ? (
          <>
            Your free entry is ticket <span className="nw">{ticketNo(mine.firstTicket)}</span>,{" "}
            {d.kind === "pot" ? (
              <>in the draw for the pot{mine.revealed ? "" : ", with its instant result still sealed"}.</>
            ) : (
              <>
                in the draw for <span className="nw">{prizeFig(grandPrize(d))} SOL</span>.
              </>
            )}
          </>
        ) : (
          <>This wallet has claimed its free entry for Draw Nº {d.id}.</>
        )}
      </p>
    );
  } else if (freeLeft === 0) {
    action = (
      <p className="free-done t-body">
        {d.freeCap === 1 ? "The one free entry" : `All ${d.freeCap} free entries`} in Draw Nº {d.id} {d.freeCap === 1 ? "is" : "are"} claimed. The cap is set in the draw
        account; paid tickets are still on sale.
      </p>
    );
  } else if (controls) {
    if (!wallet) {
      action = (
        <button type="button" id={sheet ? undefined : "stub-buy"} className="btn btn-block btn-56 buy-btn" onClick={() => setVisible(true)}>
          Connect wallet to claim
        </button>
      );
    } else {
      const reason = lim.excluded
        ? `This wallet is taking a break until ${utcLabel(lim.excludedUntil)}, so it can’t claim a free entry before then.`
        : atCap
        ? `This wallet holds ${d.maxPerWallet} of ${d.maxPerWallet} tickets, the most one wallet can hold, so there’s no room for a free entry.`
        : !read
          ? myState === "error"
            ? "Can’t read this wallet’s tickets right now, so it can’t claim yet."
            : null
          : null;
      action = (
        <>
          <AdultRow remembered={adultRemembered} checked={adult} onChange={setAdult} onUndo={forgetAdult} disabled={busy} />
          <button
            type="button"
            id={sheet ? undefined : "stub-buy"}
            className="btn btn-block btn-56 claim"
            onClick={claim}
            disabled={!ageOk || busy || atCap || lim.excluded || !read || !!disabledReason}
          >
            {busy && <Busy />}
            {fp === "simulating" ? "Checking with the program…" : fp === "signing" ? "Approve in your wallet…" : fp === "confirming" ? "Confirming on devnet…" : "Claim free entry"}
          </button>
          {!ageOk && !busy && !reason && <p className="c-hint t-fine">Confirm you’re 18 or older to claim.</p>}
          {reason && <p className="c-hint t-fine">{reason}</p>}
          {disabledReason && <p className="c-hint t-fine">{disabledReason}</p>}
          <p className="c-fine t-fine">
            {rolls
              ? "Then sign once more, about 2 s later, to reveal its instant result and take any win."
              : "One signature. The entry goes straight into the draw; there is nothing to reveal."}
          </p>
        </>
      );
    }
  }

  return (
    <div className={`free ${sheet ? "confirm" : ""}`}>
      {sheet && (
        <div className="c-head">
          <h2 className="t-stub-head" id={headingId} tabIndex={-1}>
            Free entry
          </h2>
          <button type="button" className="tbtn" onClick={closeConfirm} disabled={busy}>
            Close
          </button>
        </div>
      )}
      <p className="free-lead t-body">
        {rolls
          ? "A free entry has the same chance as a paid ticket, including instant wins."
          : "A free entry has the same chance of the grand prize as one paid ticket."}
      </p>
      <dl className="ledger">
        <div>
          <dt>Free entries left in Draw Nº {d.id}</dt>
          <dd>
            {freeLeft} of {d.freeCap}
          </dd>
        </div>
        <div>
          <dt>This wallet</dt>
          <dd>{status}</dd>
        </div>
      </dl>
      <p className="free-rules t-small">
        One per wallet while sales are open, no purchase needed. It’s one ticket, numbered like any other, and counts toward the{" "}
        <span className="nw">{d.maxPerWallet}-ticket</span> wallet limit{d.kind === "headline" ? " but not toward the minimum the draw needs" : ""}.{" "}
        {rent !== null ? (
          <>
            There’s no ticket price: your wallet pays only Solana rent for the entry record, <span className="nw">≈{solRound(rent, 4, 1)} SOL</span>
            {fee !== null ? (
              <>
                , ORAO’s randomness fee, <span className="nw">≈{solRound(fee, 4, 1)} SOL</span>,
              </>
            ) : null}{" "}
            and the network fee.
          </>
        ) : (
          <>There’s no ticket price: your wallet pays only Solana rent for the entry record{rolls ? ", the randomness fee" : ""} and the network fee, shown before you sign.</>
        )}
      </p>
      {action}
      {low && !claimed && freeLeft > 0 && <DevnetSol low={low.balance} action />}
      {errors.free && (
        <div className="c-err">
          <ErrorNote onDismiss={() => clearError("free")}>{errors.free.message}</ErrorNote>
        </div>
      )}
    </div>
  );
}

/** "You hold 16 tickets · won 0.08 SOL instantly." */
function YourEntry() {
  const { myEntries, wallet } = useDrawSol();
  if (!wallet) return null;
  const n = myEntries.reduce((s, e) => s + e.count, 0);
  if (n === 0) return null;
  const won = myEntries.reduce((s, e) => s + e.solPaid, BigInt(0));
  return (
    <dl className="ledger">
      <div>
        <dt>Your entry</dt>
        <dd>
          {n} {plural(n, "ticket", "tickets")}
          {won > BigInt(0) && (
            <>
              {" "}
              · won <span className="c-red">{sol(won, 2, 4)} SOL</span>
            </>
          )}
        </dd>
      </div>
    </dl>
  );
}

/** What one entry gets back from claim_refund: what it paid less any instant SOL it already won. */
export const refundOf = (e: EntryView) => (e.paidLamports > e.solPaid ? e.paidLamports - e.solPaid : BigInt(0));

/** Sales are over and the draw waits for its time (sell-out ends sales early; the draw is never early). */
function Closed({ d }: { d: DrawView }) {
  const soldOut = d.paidTickets >= d.ticketCap;
  const undersold = d.kind === "headline" && d.paidTickets < d.minTickets;
  return (
    <>
      <div className="stub-head">
        <h2 className="t-stub-head">Sales closed</h2>
      </div>
      <span className="dbl" aria-hidden="true" />
      <Stamp
        kind="closed"
        className="stamp-closed"
        seed={inkAt(d.address.toBytes(), 8)}
        label="Stamped: sales closed"
        top={`SALES · DRAW Nº ${d.id}`}
        bottom={soldOut ? "SOLD OUT" : stampDay(d.closesAt, true)}
      />
      <p className="stub-body t-small due-body">
        {soldOut ? "Every paid ticket has sold." : "Sales closed at the deadline."} The draw waits for its time,{" "}
        <span className="nw">{utcLabel(d.drawAt)}</span>: it is never drawn early.
        {undersold && (
          <>
            {" "}
            With fewer than {d.minTickets} paid tickets then, it is cancelled and everyone is refunded in full.
          </>
        )}
      </p>
      <ol className="steps">
        <li className="todo">
          <span className="mk" aria-hidden="true">1</span>
          <p className="ttl">At the draw time the keeper asks ORAO for randomness</p>
        </li>
        <li className="todo">
          <span className="mk" aria-hidden="true">2</span>
          <p className="ttl">Randomness lands, usually in a few seconds</p>
        </li>
        <li className="todo">
          <span className="mk" aria-hidden="true">3</span>
          <p className="ttl">
            Anyone settles; <span className="nw">{prizeFig(grandPrize(d))} SOL</span> to the winning ticket
          </p>
        </li>
      </ol>
      <YourEntry />
    </>
  );
}

/** The draw time has passed: the keeper (or the operator) runs it first, then anyone may. */
function Due({ d, now }: { d: DrawView; now: number }) {
  const { phase, errors, runDraw, clearError, disabledReason } = useActions();
  const { costs, config, wallet } = useDrawSol();
  // below 1024px the sticky bar owns the action; the stub explains it (one control, as when selling)
  const { barMode } = useBuy();
  const ph = phase.run;
  const busy = inFlight(ph);
  const soldOut = d.paidTickets >= d.ticketCap;
  const open = anyoneCanRun(d, now);
  const privileged = !!wallet && (d.authority.equals(wallet.address) || (!!config?.keeper && config.keeper.equals(wallet.address)));
  const cancels = cancelsAtRequest(d);
  const empty = d.nextTicket === 0;
  const verb = empty ? "Close the draw" : cancels ? "Cancel and refund" : "Run the draw";
  return (
    <>
      <div className="stub-head">
        <h2 className="t-stub-head">{verb}</h2>
      </div>
      <span className="dbl" aria-hidden="true" />
      {/* out of the flow: the head keeps its open-state height, so both halves share one head rule */}
      <Stamp
        kind="closed"
        className="stamp-closed"
        seed={inkAt(d.address.toBytes(), 8)}
        label="Stamped: sales closed"
        top={`SALES · DRAW Nº ${d.id}`}
        bottom={soldOut ? "SOLD OUT" : stampDay(d.closesAt, true)}
      />
      <p className="stub-body t-small due-body">
        {empty ? (
          <>No tickets were sold, so there is nothing to draw.{d.kind === "headline" ? " Closing it returns the prize to the operator." : ""}</>
        ) : cancels ? (
          <>
            Only {d.paidTickets} of the {d.minTickets} paid tickets it needed sold. Running it now cancels it: the prize goes back to the operator and every paid ticket
            can be refunded in full.
          </>
        ) : (
          <>The randomness comes from ORAO, and nobody can choose it, us included.</>
        )}{" "}
        {open ? (
          <>Anyone can do it now.</>
        ) : (
          <>
            The operator’s keeper does it at the draw time; if it hasn’t by <span className="nw">{clock(publicFrom(d))} UTC</span>, anyone can.
          </>
        )}
      </p>
      {!cancels && (
        <ol className="steps">
          <li className="now">
            <span className="mk" aria-hidden="true">1</span>
            <p className="ttl">Ask ORAO for randomness</p>
          </li>
          <li className="todo">
            <span className="mk" aria-hidden="true">2</span>
            <p className="ttl">Randomness lands, usually in a few seconds</p>
          </li>
          <li className="todo">
            <span className="mk" aria-hidden="true">3</span>
            <p className="ttl">
              Anyone settles; <span className="nw">{prizeFig(grandPrize(d))} SOL</span> to the winning ticket
            </p>
          </li>
        </ol>
      )}
      {!barMode && (
        <button
          type="button"
          className="btn btn-block btn-56"
          style={{ marginTop: cancels ? 24 : 8 }}
          onClick={runDraw}
          disabled={busy || !!disabledReason || !(open || privileged)}
        >
          {busy && <Busy />}
          {ph === "simulating" ? "Checking with the program…" : ph === "signing" ? "Approve in your wallet…" : ph === "confirming" ? "Confirming…" : open || privileged ? verb : `Open to anyone from ${clock(publicFrom(d))} UTC`}
        </button>
      )}
      {costs.oraoFee !== null && !cancels && (open || privileged) && <p className="fee-plain">+ ≈{solRound(costs.oraoFee, 4, 1)} SOL randomness fee, paid by you</p>}
      {disabledReason && <p className="helper t-fine">{disabledReason}</p>}
      {errors.run && (
        <div style={{ marginTop: 16 }}>
          <ErrorNote onDismiss={() => clearError("run")}>{errors.run.message}</ErrorNote>
        </div>
      )}
      <YourEntry />
    </>
  );
}

function Drawing({ d, now }: { d: DrawView; now: number }) {
  const { drawRandomness: r } = useDrawSol();
  const { phase, errors, settle, cancel, clearError, disabledReason } = useActions();
  const { barMode } = useBuy();
  const ready = !!r?.fulfilled && !!r.randomness;
  const sp = phase.settle;
  const busy = inFlight(sp);
  const cancellable = canCancel(d, now);
  const cp = phase.cancel;
  return (
    <>
      <div className="stub-head">
        <h2 className="t-stub-head">Settle the draw</h2>
      </div>
      <span className="dbl" aria-hidden="true" />
      <ol className="steps">
        <li className="done">
          <span className="mk">
            <Check />
          </span>
          <div>
            <p className="ttl">Randomness requested from ORAO for {d.nextTicket} tickets</p>
            <p className="dt">
              <ProofLink account={d.drawVrfRequest}>Request</ProofLink>
            </p>
          </div>
        </li>
        <li className={ready ? "done" : "busy-s"}>
          <span className="mk">{ready ? <Check /> : <Busy />}</span>
          <p className="ttl">{ready ? "Randomness landed" : "Waiting for ORAO, usually a few seconds"}</p>
        </li>
        <li className={ready ? "now" : "todo"}>
          <span className="mk" aria-hidden="true">
            3
          </span>
          <p className="dt" style={{ color: "var(--ink)" }}>
            Settle pays {prizeFig(grandPrize(d))} SOL to the winning ticket. Anyone can press it.
          </p>
        </li>
      </ol>
      {!barMode && (
        <button type="button" className="btn btn-block btn-56" onClick={settle} disabled={!ready || busy || !!disabledReason}>
          {busy && <Busy />}
          {sp === "simulating" ? "Checking with the program…" : sp === "signing" ? "Approve in your wallet…" : sp === "confirming" ? "Confirming…" : "Settle the draw"}
        </button>
      )}
      {errors.settle && (
        <div style={{ marginTop: 16 }}>
          <ErrorNote onDismiss={() => clearError("settle")}>{errors.settle.message}</ErrorNote>
        </div>
      )}
      {/* the safety valve is about randomness that hasn't arrived: once it has landed, the line goes */}
      {!ready && (
        <p className="safety t-fine">
          {cancellable ? (
            <>Randomness never arrived within 48 h. Anyone can cancel now; every paid ticket becomes refundable.</>
          ) : (
            <>
              If randomness hasn’t arrived by <span className="nw">{utcLabel(d.drawAt + CANCEL_GRACE_SECS)}</span>, anyone can cancel and every paid ticket is
              refunded.
            </>
          )}
        </p>
      )}
      {ready && cancellable && (
        <p className="safety t-fine">More than 48 h have passed since the draw time, so the program also lets anyone cancel; settling pays the winner instead.</p>
      )}
      {cancellable && !barMode && (
        <button type="button" className="btn btn-sec btn-block" style={{ marginTop: 16 }} onClick={cancel} disabled={inFlight(cp) || !!disabledReason}>
          {inFlight(cp) && <Busy />}
          Cancel the draw
        </button>
      )}
      {errors.cancel && (
        <div style={{ marginTop: 16 }}>
          <ErrorNote onDismiss={() => clearError("cancel")}>{errors.cancel.message}</ErrorNote>
        </div>
      )}
      <YourEntry />
    </>
  );
}

function Settled({ d }: { d: DrawView }) {
  const { myEntries, myState, wallet, draws } = useDrawSol();
  const mine = myEntries.some((e) => e.firstTicket <= d.winningTicket && d.winningTicket < e.firstTicket + e.count);
  // "not one of yours" only once this wallet's tickets have actually been read
  const notMine = !!wallet && myState === "ready";
  const next = draws.find((x) => x.kind === d.kind && x.status === "open" && x.id !== d.id);
  return (
    <>
      <div className="stub-head">
        <h2 className="t-stub-head">Draw finished</h2>
      </div>
      <span className="dbl" aria-hidden="true" />
      <p className="stub-body t-body" style={{ color: "var(--ink)" }}>
        {mine ? (
          <>
            You hold the winning ticket {ticketNo(d.winningTicket)}. <span className="c-red nw b">{prizeFig(grandPrize(d))} SOL</span> was paid to your wallet.
          </>
        ) : (
          <>Ticket {ticketNo(d.winningTicket)} won.{notMine && " Not one of yours this time."}</>
        )}
      </p>
      <p className="t-small c-ink-2" style={{ marginTop: 16 }}>
        {next ? (
          <>
            The next {kindName(d.kind)}, Nº {next.id}, draws on <span className="nw">{utcLabel(next.drawAt)}</span>.
          </>
        ) : (
          <>The next {kindName(d.kind)} will appear here when it opens. There isn’t one yet.</>
        )}
      </p>
      <CarbonSlip d={d} id="slip-current" />
    </>
  );
}

function Cancelled({ d }: { d: DrawView }) {
  const { myEntries, wallet, myState } = useDrawSol();
  const { barMode } = useBuy();
  const paid = myEntries.filter((e) => !e.isFree);
  const paidTickets = paid.reduce((n, e) => n + e.paidCount, 0);
  const owed = paid.filter((e) => !e.refunded).reduce((n, e) => n + refundOf(e), BigInt(0));
  const back = paid.filter((e) => e.refunded).reduce((n, e) => n + refundOf(e), BigInt(0));
  const credits = paid.filter((e) => !e.refunded).reduce((n, e) => n + e.creditCount, 0);
  const free = myEntries.find((e) => e.isFree);
  const empty = d.nextTicket === 0;
  const why = cancelReason(d);
  return (
    <>
      <div className="stub-head">
        <h2 className="t-stub-head">{empty ? "Closed with no tickets" : "Refunds are open"}</h2>
      </div>
      <span className="dbl" aria-hidden="true" />
      <p className="stub-body t-small">
        {empty
          ? `Nobody bought a ticket, so there was nothing to draw${d.kind === "headline" ? " and the prize went back to the operator" : ""}.`
          : why === "undersold"
            ? `Only ${d.paidTickets} of the ${d.minTickets} paid tickets it needed sold by the draw time, so it was cancelled and the prize went back to the operator. Every paid ticket is refunded in full. There’s no deadline.`
            : "The randomness never arrived within 48 h of the draw time, so the draw was cancelled. Every paid ticket can be refunded, less any instant SOL it already won. There’s no deadline."}
      </p>
      {!empty && (
        <>
          {wallet && myState === "ready" && myEntries.length > 0 ? (
            // a refund receipt: one line per purchase, then the total owed to this wallet
            <dl className="ledger refunds" aria-label={`Your entry: ${paidTickets} paid ${plural(paidTickets, "ticket", "tickets")}`}>
              {paid.slice(0, 4).map((e) => (
                <div key={e.address.toBase58()}>
                  <dt>
                    <span className="nw tab">{ticketRange(e.firstTicket, e.count)}</span> · {e.count} {plural(e.count, "ticket", "tickets")}
                  </dt>
                  <dd className={e.refunded ? "c-ink-3" : ""}>
                    {e.refunded ? "refunded" : `${sol(refundOf(e), 2, 4)} SOL`}
                    {!e.refunded && e.creditCount > 0 ? ` + ${e.creditCount} ${plural(e.creditCount, "credit", "credits")}` : ""}
                  </dd>
                </div>
              ))}
              {paid.length > 4 && (
                <div>
                  <dt>{paid.length - 4} more purchases</dt>
                  <dd>{sol(paid.slice(4).filter((e) => !e.refunded).reduce((n, e) => n + refundOf(e), BigInt(0)), 2, 4)} SOL</dd>
                </div>
              )}
              {free && (
                <div>
                  <dt>
                    Free entry <span className="nw tab">{ticketNo(free.firstTicket)}</span>
                  </dt>
                  <dd className="c-ink-3">nothing to refund</dd>
                </div>
              )}
              <div className="sum">
                <dt>{back > BigInt(0) ? "Still to refund" : "Refundable to you"}</dt>
                <dd>
                  {sol(owed, 2, 4)} SOL{credits > 0 ? ` + ${credits} ${plural(credits, "credit", "credits")}` : ""}
                </dd>
              </div>
            </dl>
          ) : (
            <dl className="ledger">
              <div>
                <dt>Your refund</dt>
                <dd>
                  {!wallet
                    ? "Connect a wallet to check"
                    : myState === "ready"
                      ? "No tickets in this draw"
                      : myState === "error"
                        ? "Can’t read your tickets right now"
                        : "Reading your tickets…"}
                </dd>
              </div>
            </dl>
          )}
          {wallet && owed > BigInt(0) && !barMode && (
            <a className="btn btn-block btn-56" style={{ marginTop: 24 }} href="#my-tickets">
              Go to your refunds
            </a>
          )}
          <p className="t-small c-ink-2" style={{ marginTop: 16 }}>
            Each refund is its own transaction. Anyone can send it, and it always pays the ticket’s owner.
          </p>
        </>
      )}
    </>
  );
}

/**
 * Fixed bottom bar below 1024px: the one quantity control while selling, and the next action
 * (run, settle, refunds) once sales are over, so the "anyone can run it" promise is one tap away.
 */
export function MobileBuyBar() {
  const { current: d, now } = useDrawSol();
  if (!d) return null;
  const ph = phaseOf(d, now);
  if (ph === "selling") return <SellBar d={d} />;
  if (ph === "due" || ph === "drawing" || ph === "cancelled") return <ActionBar d={d} ph={ph} />;
  return null;
}

/**
 * The bar sits right after the hero in the DOM (page.tsx), so on phones and tablets its stepper and Buy
 * button come straight after the vault link in tab and reading order; it is fixed, so nothing moves.
 * The room it needs at the end of the page is kept by <BarSpacer/>, rendered after the footer.
 */
function BarShell({ children, label, hidden, tabs = false }: { children: ReactNode; label: string; hidden?: boolean; tabs?: boolean }) {
  return (
    <div className={`buybar ${tabs ? "has-tabs" : ""}`} role="region" aria-label={label} aria-hidden={hidden ? true : undefined}>
      {children}
    </div>
  );
}

/** True when MobileBuyBar prints a bar (it shows below 1024px); mirrors its branches. */
function useHasBar() {
  const { current: d, now, myEntries, wallet } = useDrawSol();
  if (!d) return false;
  const ph = phaseOf(d, now);
  if (ph === "selling" || ph === "due" || ph === "drawing") return true;
  if (ph === "cancelled") return !!wallet && myEntries.some((e) => !e.isFree && !e.refunded && refundOf(e) > BigInt(0));
  return false;
}

/** Room at the end of the page for the fixed bar (below 1024px only, via .bar-spacer). */
export function BarSpacer() {
  const { current: d, now } = useDrawSol();
  // while selling the bar carries the two entry tabs above its row, so it needs more room
  const tall = !!d && phaseOf(d, now) === "selling";
  return useHasBar() ? <div className={`bar-spacer ${tall ? "tall" : ""}`} aria-hidden="true" /> : null;
}

function SellBar({ d }: { d: DrawView }) {
  const { qty, setQty, maxQ, openConfirm, connectThenConfirm, step, mode, paidPart } = useBuy();
  const { airdrop, phase, errors } = useActions();
  const bb = useBuyButton();
  if (!bb) return null;
  const total = `${sol(bb.subtotal, 2, 4)} SOL`;
  const label = buyLabel(qty, paidPart, bb.subtotal, true);
  const ap = phase.airdrop;
  const stepper = (
    <div className="mini">
      <button type="button" className="punch" aria-label="One fewer ticket" onClick={() => setQty(qty - 1)} disabled={qty <= 1}>
        <Minus />
      </button>
      <output className="t-qty" aria-live="polite" aria-label={`${qty} ${plural(qty, "ticket", "tickets")}`}>
        {qty}
      </output>
      <button type="button" className="punch" aria-label="One more ticket" onClick={() => setQty(qty + 1)} disabled={qty >= maxQ}>
        <Plus />
      </button>
    </div>
  );
  return (
    <BarShell label="Enter the draw" hidden={step === "confirm"} tabs>
      <EntryTabs prefix="bartab" panel="bar-panel" className="bar-tabs" />
      <div className="bar-row" id="bar-panel" role="tabpanel" aria-labelledby={`bartab-${mode}`}>
        {mode === "free" ? (
          <FreeBarRow d={d} />
        ) : (
          <>
            {bb.kind === "cap" ? (
              <span className="bar-note t-small">
                {bb.held} of {d.maxPerWallet} held
              </span>
            ) : bb.kind === "excluded" ? (
              <span className="bar-note t-small">
                On a break until <span className="nw">{shortDate(bb.lim.excludedUntil)}</span>
              </span>
            ) : bb.kind === "limit" ? (
              <span className="bar-note t-small">
                <a className="tbtn" href="#limits">
                  Play limit
                </a>{" "}
                reached
              </span>
            ) : bb.kind === "low" ? (
              errors.airdrop ? (
                <span className="bar-note t-small c-red">
                  Faucet said no.{" "}
                  <a className="tbtn" href="#buy">
                    Details
                  </a>
                </span>
              ) : (
                <span className="bar-note t-small">
                  You have <span className="nw">{sol(bb.balance, 2, 4)} SOL</span>
                </span>
              )
            ) : (
              stepper
            )}
            {bb.kind === "connect" ? (
              <button
                type="button"
                id="bar-buy"
                className="btn"
                onClick={connectThenConfirm}
                aria-label={`Connect wallet to buy ${qty} ${plural(qty, "ticket", "tickets")} for ${total}`}
              >
                <span>
                  Connect wallet<span className="cw-more"> to buy</span>
                </span>
              </button>
            ) : bb.kind === "cap" ? (
              <button type="button" id="bar-buy" className="btn" disabled>
                Limit reached
              </button>
            ) : bb.kind === "excluded" || bb.kind === "limit" ? (
              <button type="button" id="bar-buy" className="btn" disabled>
                {bb.kind === "excluded" ? "Taking a break" : "Over your limit"}
              </button>
            ) : bb.kind === "low" ? (
              <button type="button" id="bar-buy" className="btn" onClick={airdrop} disabled={inFlight(ap)}>
                {inFlight(ap) && <Busy />}
                {ap === "simulating" ? "Asking the faucet…" : ap === "confirming" ? "Confirming…" : "Get devnet SOL"}
              </button>
            ) : (
              <button
                type="button"
                id="bar-buy"
                className="btn"
                onClick={openConfirm}
                disabled={bb.kind === "disabled"}
                aria-label={paidPart === 0 ? `Use ${qty} free ${plural(qty, "ticket", "tickets")}` : `Buy ${qty} ${plural(qty, "ticket", "tickets")} for ${total}`}
              >
                {label}
              </button>
            )}
          </>
        )}
      </div>
    </BarShell>
  );
}

/** The bar on the "Free entry" tab: what's left (or this wallet's claim) and the claim, which opens the sheet. */
function FreeBarRow({ d }: { d: DrawView }) {
  const { wallet, myEntries, myState, player } = useDrawSol();
  const { phase, errors } = useActions();
  const { openConfirm, connectThenConfirm } = useBuy();
  const freeLeft = Math.max(0, d.freeCap - d.freeTickets);
  const read = myState === "ready";
  const mine = myEntries.find((e) => e.isFree);
  const claimed = read && (!!mine || !!player?.freeClaimed);
  const fp = phase.free;
  if (claimed)
    return (
      <>
        <span className="bar-note t-small">In the draw</span>
        <button type="button" id="bar-buy" className="btn" disabled>
          Claimed{mine ? ` · ${ticketNo(mine.firstTicket)}` : ""}
        </button>
      </>
    );
  if (freeLeft === 0)
    return (
      <>
        <span className="bar-note t-small">All {d.freeCap} claimed</span>
        <button type="button" id="bar-buy" className="btn" disabled>
          No free entries left
        </button>
      </>
    );
  return (
    <>
      {errors.free ? (
        <span className="bar-note t-small c-red">
          Didn’t go through.{" "}
          <button type="button" className="tbtn" onClick={openConfirm}>
            Details
          </button>
        </span>
      ) : (
        <span className="bar-note t-small">
          <span className="nw">
            {freeLeft} of {d.freeCap}
          </span>{" "}
          free left
        </span>
      )}
      {wallet ? (
        <button type="button" id="bar-buy" className="btn" onClick={openConfirm} disabled={inFlight(fp)}>
          {inFlight(fp) && <Busy />}
          {fp === "signing" ? "Approve in your wallet…" : fp === "confirming" ? "Confirming…" : "Claim free entry"}
        </button>
      ) : (
        <button type="button" id="bar-buy" className="btn" onClick={connectThenConfirm}>
          <span>
            Connect wallet<span className="cw-more"> to claim</span>
          </span>
        </button>
      )}
    </>
  );
}

function ActionBar({ d, ph }: { d: DrawView; ph: "due" | "drawing" | "cancelled" }) {
  const { drawRandomness: r, myEntries, wallet, now, config } = useDrawSol();
  const { phase, errors, runDraw, settle, cancel, disabledReason } = useActions();
  const failed = (k: "run" | "settle" | "cancel") =>
    errors[k] ? (
      <span className="bar-note t-small c-red">
        Didn’t go through.{" "}
        <a className="tbtn" href="#buy">
          Details
        </a>
      </span>
    ) : null;

  if (ph === "due") {
    const p = phase.run;
    const busy = inFlight(p);
    const cancels = cancelsAtRequest(d);
    const verb = d.nextTicket === 0 ? "Close the draw" : cancels ? "Cancel and refund" : "Run the draw";
    const open = anyoneCanRun(d, now);
    const privileged = !!wallet && (d.authority.equals(wallet.address) || (!!config?.keeper && config.keeper.equals(wallet.address)));
    return (
      <BarShell label="The draw">
        {failed("run") ?? <span className="bar-note t-small">{open ? "Anyone can run it" : `Keeper’s turn until ${clock(publicFrom(d))} UTC`}</span>}
        <button type="button" className="btn" onClick={runDraw} disabled={busy || !!disabledReason || !(open || privileged)}>
          {busy && <Busy />}
          {p === "simulating" ? "Checking…" : p === "signing" ? "Approve in your wallet…" : p === "confirming" ? "Confirming…" : verb}
        </button>
      </BarShell>
    );
  }
  if (ph === "drawing") {
    const ready = !!r?.fulfilled && !!r.randomness;
    const p = phase.settle;
    const busy = inFlight(p);
    // the safety valve lives here too below 1024px (the stub is info only)
    const cancellable = canCancel(d, now);
    const cp = phase.cancel;
    const cancelLabel = cp === "simulating" ? "Checking…" : cp === "signing" ? "Approve in your wallet…" : cp === "confirming" ? "Confirming…" : "Cancel the draw";
    if (cancellable && !ready)
      return (
        <BarShell label="The draw">
          {failed("cancel") ?? <span className="bar-note t-small">Randomness never arrived</span>}
          <button type="button" className="btn" onClick={cancel} disabled={inFlight(cp) || !!disabledReason}>
            {inFlight(cp) && <Busy />}
            {cancelLabel}
          </button>
        </BarShell>
      );
    return (
      <BarShell label="The draw">
        {failed("settle") ??
          (cancellable ? (
            <button type="button" className="tbtn bar-tbtn" onClick={cancel} disabled={inFlight(cp) || !!disabledReason}>
              {inFlight(cp) && <Busy />}
              {cancelLabel}
            </button>
          ) : (
            <span className="bar-note t-small">{ready ? "Anyone can settle" : "Randomness requested"}</span>
          ))}
        <button type="button" className="btn" onClick={settle} disabled={!ready || busy || !!disabledReason}>
          {busy && <Busy />}
          {!ready ? "Waiting for ORAO…" : p === "simulating" ? "Checking…" : p === "signing" ? "Approve in your wallet…" : p === "confirming" ? "Confirming…" : "Settle the draw"}
        </button>
      </BarShell>
    );
  }
  // cancelled
  const owed = myEntries.filter((e) => !e.isFree && !e.refunded).reduce((n, e) => n + refundOf(e), BigInt(0));
  if (!wallet || owed === BigInt(0)) return null;
  return (
    <BarShell label="Refunds">
      <span className="bar-note t-small">
        Your refund <span className="nw b">{sol(owed, 2, 4)} SOL</span>
      </span>
      <a className="btn" href="#my-tickets">
        Go to your refunds
      </a>
    </BarShell>
  );
}

/** The confirm step as a bottom sheet below 1024px. Focus is trapped; scrim and Esc close it. */
export function ConfirmSheet() {
  const { current: d, now } = useDrawSol();
  const { step, barMode, closeConfirm, mode } = useBuy();
  const ref = useRef<HTMLDivElement>(null);
  const open = !!d && barMode && step === "confirm" && phaseOf(d, now) === "selling";

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href], summary, [tabindex]:not([tabindex='-1'])"));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={closeConfirm} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-h" ref={ref}>
        {mode === "free" ? <FreeEntry d={d!} controls sheet headingId="sheet-h" /> : <ConfirmStep headingId="sheet-h" />}
      </div>
    </>
  );
}
