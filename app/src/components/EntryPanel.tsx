"use client";

import { useId, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { limitsOf, remaining, walletAllowance, type Limits } from "@/lib/derive";
import { shortDate, sol, ticketNo, utcLabel } from "@/lib/format";
import { AIRDROP_LAMPORTS, FAUCET_URL, LOW_BALANCE_LAMPORTS, SOLFAUCET_URL } from "@/lib/config";
import type { DrawView, EntryView } from "@/lib/types";
import { Busy, ErrorNote, Minus, Plus, ProofLink, inFlight, phaseLabel } from "./bits";
import { useBuy, type BuyMode } from "./BuyContext";
import { AdultRow } from "./Sheet";
import { FeeLine, useFees } from "./Fee";
import { Meter } from "./Hero";
import { n, plural, solRound, usd } from "./fmt";

const AIRDROP_SOL = sol(BigInt(AIRDROP_LAMPORTS), 0, 2);
const PRESETS = [1, 5, 10, 25, 50, 100, 250, 500];

/** What one entry gets back from claim_refund: what it paid less any instant SOL it already won. */
export const refundOf = (e: EntryView) => (e.paidLamports > e.solPaid ? e.paidLamports - e.solPaid : BigInt(0));

/** Which buy button the panel and the bar show, in priority order. */
export function useBuyButton() {
  const { current: d, wallet, player, profile, now } = useDrawSol();
  const { disabledReason } = useActions();
  const { paidPart } = useBuy();
  const fees = useFees();
  if (!d) return null;
  const allowance = walletAllowance(d, player, 0);
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

/**
 * A connected wallet whose devnet balance is below one ticket plus fees, or below 0.05 SOL: the panel offers
 * "Get devnet SOL". null when not connected or the balance hasn't been read (never guessed).
 */
export function useLowBalance() {
  const { current: d, wallet } = useDrawSol();
  const fees = useFees();
  if (!d || !wallet || wallet.balance === null) return null;
  const one = d.ticketPrice + (fees ?? BigInt(0));
  const floor = one > LOW_BALANCE_LAMPORTS ? one : LOW_BALANCE_LAMPORTS;
  return wallet.balance < floor ? { balance: wallet.balance } : null;
}

/** "Enter now · $5.00" / "Enter now · 0.0419 SOL" */
export function enterLabel(subtotal: bigint, price: number | null, short = false) {
  const u = usd(subtotal, price);
  const amount = u ?? `${sol(subtotal, 2, 4)} SOL`;
  return short ? `Enter now` : `Enter now · ${amount}`;
}

/** Why a wallet can't buy right now because of its own play limits, in plain words, with the way to them. */
export function LimitNote({ kind, lim, price }: { kind: "excluded" | "limit"; lim: Limits; price: bigint }) {
  if (kind === "excluded")
    return (
      <p className="helper">
        This wallet is taking a break until <span className="nw">{utcLabel(lim.excludedUntil)}</span>, as it asked. The program won’t sell it tickets or free entries
        before then.{" "}
        <a className="tbtn" href="#play-safe">
          Play safe
        </a>
      </p>
    );
  const left = lim.headroom ?? BigInt(0);
  return (
    <p className="helper">
      You’ve spent <span className="nw">{sol(lim.spent, 2, 4)}</span> of your <span className="nw">{sol(lim.limit, 2, 4)} SOL</span> spend limit this 30-day period
      {left >= price ? <>, so you can pay for {Number(left / price)} more {plural(Number(left / price), "ticket", "tickets")} until it resets</> : <>, so there’s no room for a paid ticket until it resets</>}
      {lim.periodEnd ? <> on {shortDate(lim.periodEnd)}</> : null}.{" "}
      <a className="tbtn" href="#play-safe">
        Play safe
      </a>
    </p>
  );
}

const TABS: [BuyMode, string][] = [
  ["buy", "Paid tickets"],
  ["free", "Free entry"],
];

/** "Paid tickets" / "Free entry": two tabs of equal weight. */
function EntryTabs() {
  const { mode, setMode } = useBuy();
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: BuyMode = e.key === "Home" ? "buy" : e.key === "End" ? "free" : mode === "buy" ? "free" : "buy";
    setMode(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="How to enter">
      {TABS.map(([k, label]) => (
        <button key={k} type="button" role="tab" id={`tab-${k}`} className="tab-btn" aria-selected={mode === k} aria-controls="entry-tabpanel" tabIndex={mode === k ? 0 : -1} onClick={() => setMode(k)} onKeyDown={onKey}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** The entry panel while selling: the meter, the two tabs, the picker or the free entry. */
export function EntryPanel({ d }: { d: DrawView }) {
  const { mode } = useBuy();
  return (
    <div className="panel">
      <Meter d={d} />
      <EntryTabs />
      <div id="entry-tabpanel" role="tabpanel" aria-labelledby={`tab-${mode}`} key={mode}>
        {mode === "free" ? <FreeEntry d={d} /> : <Picker d={d} />}
      </div>
    </div>
  );
}

/** How many tickets: the slider, the price and stepper, presets, the live total and the one button. */
function Picker({ d }: { d: DrawView }) {
  const { solUsd, player, myEntries, myState } = useDrawSol();
  const { airdrop, phase, lastSig } = useActions();
  const { qty, setQty, maxQ, openConfirm, connectThenConfirm, showFree } = useBuy();
  const bb = useBuyButton();
  const low = useLowBalance();
  const sliderId = useId();
  const subtotal = d.ticketPrice * BigInt(qty);
  const price = usd(d.ticketPrice, solUsd);
  const total = usd(subtotal, solUsd);
  const held = player?.tickets ?? myEntries.reduce((s, e) => s + e.count, 0);
  const ap = phase.airdrop;
  const airBusy = inFlight(ap);
  const capped = bb?.kind === "cap";
  const pct = maxQ > 1 ? ((qty - 1) / (maxQ - 1)) * 100 : 0;

  let btn: { label: string; onClick?: () => void; disabled: boolean };
  switch (bb?.kind) {
    case "connect":
      btn = { label: "Connect wallet to enter", onClick: connectThenConfirm, disabled: false };
      break;
    case "cap":
      btn = { label: `Wallet limit reached (${bb.held} of ${d.maxPerWallet})`, disabled: true };
      break;
    case "excluded":
      btn = { label: `Taking a break until ${shortDate(bb.lim.excludedUntil)}`, disabled: true };
      break;
    case "limit":
      btn = { label: "Over your spend limit", disabled: true };
      break;
    case "disabled":
      btn = { label: enterLabel(subtotal, solUsd), disabled: true };
      break;
    default:
      btn = { label: enterLabel(subtotal, solUsd), onClick: openConfirm, disabled: false };
  }
  const arrived = ap === "done" && lastSig.airdrop && !low;

  return (
    <div className="picker">
      {capped ? (
        <p className="panel-text">
          You hold {bb.held} of {d.maxPerWallet} tickets, the most one wallet can hold in Draw № {d.id}.{" "}
          <a className="tbtn" href="#my-tickets">
            See them
          </a>
        </p>
      ) : (
        <>
          <h2 className="t-h3 picker-h">How many tickets?</h2>
          {maxQ > 1 && (
            <div className="slider">
              <input
                id={sliderId}
                type="range"
                min={1}
                max={maxQ}
                step={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                style={{ "--pct": `${pct}%` } as React.CSSProperties}
                aria-label="Number of tickets"
                aria-valuetext={`${qty} ${plural(qty, "ticket", "tickets")}`}
              />
              <div className="slider-ends tab" aria-hidden="true">
                <span>1</span>
                <span>{n(maxQ)}</span>
              </div>
            </div>
          )}
          <div className="price-row">
            <p className="per">
              {price ? (
                <>
                  <b className="c-accent">{price}</b> <span>per ticket</span>
                  <span className="per-sol nw">{sol(d.ticketPrice, 2, 5)} SOL</span>
                </>
              ) : (
                <>
                  <b className="c-accent nw">{sol(d.ticketPrice, 2, 5)} SOL</b> <span>per ticket</span>
                </>
              )}
            </p>
            <div className="stepper">
              <button type="button" className="step" aria-label="One fewer ticket" onClick={() => setQty(qty - 1)} disabled={qty <= 1}>
                <Minus />
              </button>
              <output className="step-n tab" aria-live="polite" aria-label={`${qty} ${plural(qty, "ticket", "tickets")}`}>
                {n(qty)}
              </output>
              <button type="button" className="step" aria-label="One more ticket" onClick={() => setQty(qty + 1)} disabled={qty >= maxQ}>
                <Plus />
              </button>
            </div>
          </div>
          {maxQ > 1 && (
            <ul className="chips" aria-label="Quick picks">
              {PRESETS.filter((p) => p < maxQ).slice(-5).map((p) => (
                <li key={p}>
                  <button type="button" className="chip tab" aria-pressed={qty === p} onClick={() => setQty(p)}>
                    {p}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className="chip tab" aria-pressed={qty === maxQ} onClick={() => setQty(maxQ)} aria-label={`Max, ${maxQ} ${plural(maxQ, "ticket", "tickets")}`}>
                  Max · {n(maxQ)}
                </button>
              </li>
            </ul>
          )}
          <div className="total-row">
            <p className="total-label">
              Total ({n(qty)} {plural(qty, "ticket", "tickets")})
            </p>
            <p className="total tab" aria-live="polite">
              {total ? (
                <>
                  <b className="c-accent">{total}</b>
                  <span className="total-sol nw">{sol(subtotal, 2, 4)} SOL</span>
                </>
              ) : (
                <b className="c-accent nw">{sol(subtotal, 2, 4)} SOL</b>
              )}
            </p>
          </div>
          <FeeLine />
          {bb?.kind === "low" ? (
            <button type="button" id="enter-btn" className="btn btn-primary btn-xl btn-block" onClick={airdrop} disabled={airBusy}>
              {airBusy && <Busy />}
              {ap === "simulating" ? "Asking the devnet faucet…" : ap === "confirming" ? "Confirming on devnet…" : "Get devnet SOL"}
            </button>
          ) : (
            <button type="button" id="enter-btn" className="btn btn-primary btn-xl btn-block" onClick={btn.onClick} disabled={btn.disabled}>
              {btn.label}
            </button>
          )}
          <p className="under">
            {d.guaranteed ? (
              <>
                Drawn {utcLabel(d.drawAt)}, guaranteed. The full end prize once {n(d.minTickets)} tickets sell; below that, {d.potBps / 100}% of ticket sales. No refunds.
              </>
            ) : (
              <>Drawn at the deadline once {n(d.minTickets)} tickets sell, otherwise everyone is refunded in full.</>
            )}
          </p>
          <p className="free-link">
            <button type="button" className="tbtn" onClick={showFree}>
              Free entry, no purchase needed
            </button>
          </p>
          {bb?.kind === "low" && (
            <DevnetSol
              low={bb.balance}
              action={false}
              help={
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
              }
            />
          )}
          {bb?.kind === "disabled" && <p className="helper">{bb.reason}</p>}
          {(bb?.kind === "excluded" || bb?.kind === "limit") && <LimitNote kind={bb.kind} lim={bb.lim} price={d.ticketPrice} />}
          {low && bb?.kind !== "low" && <DevnetSol low={low.balance} action />}
          {arrived && (
            <p className="helper">
              {AIRDROP_SOL} devnet SOL arrived from the faucet. <ProofLink tx={lastSig.airdrop}>Faucet transaction</ProofLink>
            </p>
          )}
        </>
      )}
      <p className="cap-note">
        Up to {n(d.maxPerTx)} per purchase · {n(d.maxPerWallet)} entries max per person
        {myState === "ready" && held > 0 ? (
          <>
            {" "}
            · you hold {held}{" "}
            <a className="tbtn" href="#my-tickets">
              see them
            </a>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}

/**
 * "Get devnet SOL": asks the public devnet faucet for 0.5 SOL from the visitor's own browser
 * (`connection.requestAirdrop`), confirms it and re-reads the balance. On failure it says why, plainly,
 * and points to the two web faucets. Devnet SOL is play money; nothing here implies otherwise.
 */
export function DevnetSol({ low, help, action }: { low: bigint; help?: ReactNode; action: boolean }) {
  const { airdrop, phase, errors, clearError } = useActions();
  const ap = phase.airdrop;
  const busy = inFlight(ap);
  const err = errors.airdrop;
  return (
    <div className="drip">
      <p>
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
      <p className="drip-fine">Asks the public devnet faucet for {AIRDROP_SOL} SOL, from your browser. Devnet SOL is play money: it has no value and can’t be cashed out.</p>
      {err && (
        <div className="drip-err">
          <ErrorNote onDismiss={() => clearError("airdrop")}>{err.message}</ErrorNote>
          <p className="drip-fine">
            Other ways to get it: <ProofLink href={FAUCET_URL}>faucet.solana.com</ProofLink> (sign in with GitHub there and its airdrop button works for you), or{" "}
            <ProofLink href={SOLFAUCET_URL}>solfaucet.com</ProofLink>. Paste your wallet address there, then come back here.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The "Free entry" tab: plain rules, this draw's free entries left, whether this wallet has claimed, then the
 * claim. A free entry is one ticket in the grand draw with the same chance as a paid ticket.
 */
function FreeEntry({ d }: { d: DrawView }) {
  const { wallet, player, myEntries, myState, costs, profile, profileState, now } = useDrawSol();
  const { claimFree, phase, errors, clearError, disabledReason } = useActions();
  const { adultRemembered, rememberAdult, forgetAdult } = useBuy();
  const lim = limitsOf(wallet ? profile : null, now);
  const { setVisible } = useWalletModal();
  const low = useLowBalance();
  const [adult, setAdult] = useState(false);

  const freeLeft = Math.max(0, d.freeCap - d.freeTickets);
  const read = myState === "ready";
  const mine = myEntries.find((e) => e.isFree);
  const claimed = read && (!!mine || !!player?.freeClaimed);
  const atCap = read && (player?.tickets ?? 0) >= d.maxPerWallet;
  const fp = phase.free;
  const busy = inFlight(fp);
  const ageOk = adultRemembered || adult;
  const rent =
    costs.entryRent !== null && read && profileState === "ready" && (player || costs.playerRent !== null) && (profile || costs.profileRent !== null)
      ? costs.entryRent + (player ? BigInt(0) : costs.playerRent ?? BigInt(0)) + (profile ? BigInt(0) : costs.profileRent ?? BigInt(0))
      : null;

  const claim = () => {
    if (!ageOk || busy) return;
    if (adult) rememberAdult();
    claimFree();
  };

  let action: ReactNode = null;
  if (claimed) {
    action = (
      <p className="free-done">
        {mine ? (
          <>
            Your free entry is ticket <b className="nw tab">{ticketNo(mine.firstTicket)}</b>, in the draw with every other ticket.
          </>
        ) : (
          <>This wallet has claimed its free entry for Draw № {d.id}.</>
        )}
      </p>
    );
  } else if (freeLeft === 0) {
    action = (
      <p className="free-done">
        {d.freeCap === 1 ? "The one free entry" : `All ${d.freeCap} free entries`} in Draw № {d.id} {d.freeCap === 1 ? "is" : "are"} claimed. The cap is set in the draw
        account; paid tickets are still on sale.
      </p>
    );
  } else if (!wallet) {
    action = (
      <button type="button" className="btn btn-primary btn-xl btn-block" onClick={() => setVisible(true)}>
        Connect wallet to claim
      </button>
    );
  } else {
    const reason = lim.excluded
      ? `This wallet is taking a break until ${utcLabel(lim.excludedUntil)}, so it can’t claim a free entry before then.`
      : atCap
        ? `This wallet holds ${d.maxPerWallet} of ${d.maxPerWallet} tickets, the most one wallet can hold, so there’s no room for a free entry.`
        : !read && myState === "error"
          ? "Can’t read this wallet’s tickets right now, so it can’t claim yet."
          : null;
    action = (
      <>
        <AdultRow remembered={adultRemembered} checked={adult} onChange={setAdult} onUndo={forgetAdult} disabled={busy} />
        <button type="button" className="btn btn-primary btn-xl btn-block" onClick={claim} disabled={!ageOk || busy || atCap || lim.excluded || !read || !!disabledReason}>
          {busy && <Busy />}
          {phaseLabel(fp, "Claim free entry")}
        </button>
        {!ageOk && !busy && !reason && <p className="helper">Confirm you’re 18 or older to claim.</p>}
        {reason && <p className="helper">{reason}</p>}
        {disabledReason && <p className="helper">{disabledReason}</p>}
      </>
    );
  }

  return (
    <div className="free">
      <h2 className="t-h3 picker-h">Free entry</h2>
      <p className="panel-text">
        One free ticket per wallet, no purchase needed. It has the same chance of the end prize{d.schedule.length ? " and the instant prizes" : ""} as a paid ticket and is numbered like any
        other.
      </p>
      <dl className="panel-sum">
        <div>
          <dt>Free entries left</dt>
          <dd className="tab">
            {freeLeft} of {d.freeCap}
          </dd>
        </div>
        <div>
          <dt>This wallet</dt>
          <dd>{!wallet ? <span className="c-3">connect to check</span> : !read ? <span className="c-3">{myState === "error" ? "can’t read" : "…"}</span> : claimed ? <>Claimed{mine ? `: ${ticketNo(mine.firstTicket)}` : ""}</> : "Not claimed"}</dd>
        </div>
      </dl>
      <p className="helper">
        There’s no ticket price: your wallet pays only Solana rent for the entry record
        {rent !== null ? <>, ≈{solRound(rent, 4, 1)} SOL,</> : null} and the network fee. It counts toward the {d.maxPerWallet}-ticket wallet limit but not toward
        the {n(d.minTickets)} that {d.guaranteed ? "lock in the full end prize" : "the draw needs"}.
      </p>
      {action}
      {low && !claimed && freeLeft > 0 && <DevnetSol low={low.balance} action />}
      {errors.free && <ErrorNote onDismiss={() => clearError("free")}>{errors.free.message}</ErrorNote>}
    </div>
  );
}
