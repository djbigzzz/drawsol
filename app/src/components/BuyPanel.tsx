"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { canCancel, phaseOf, remaining, walletAllowance } from "@/lib/derive";
import { oneIn, sol, ticketNo, ticketRange, utcLabel } from "@/lib/format";
import { CANCEL_GRACE_SECS, FAUCET_URL } from "@/lib/config";
import { inkAt } from "@/lib/print";
import type { DrawView } from "@/lib/types";
import { Busy, Check, ErrorNote, inFlight, Minus, Plus, ProofLink } from "./bits";
import { useBuy } from "./BuyContext";
import { ConfirmStep } from "./ConfirmStep";
import { FeeLine, useFees } from "./Fee";
import { plural, solRound, stampDay } from "./fmt";
import { Stamp } from "./print/Stamp";
import { CarbonSlip } from "./print/CarbonSlip";

const PICKS = [1, 5, 10, 25];

/** Which buy button the stub and the bar show, in priority order (DESIGN.md §5.5). */
export function useBuyButton() {
  const { current: d, wallet, player } = useDrawSol();
  const { disabledReason } = useActions();
  const { qty } = useBuy();
  const fees = useFees();
  if (!d) return null;
  const allowance = walletAllowance(d, player);
  const subtotal = d.ticketPrice * BigInt(qty);
  if (!wallet) return { kind: "connect" as const, subtotal };
  if (allowance.wallet === 0) return { kind: "cap" as const, subtotal, held: allowance.held };
  if (wallet.balance !== null && wallet.balance < subtotal + (fees ?? BigInt(0)))
    return { kind: "low" as const, subtotal, balance: wallet.balance, need: fees !== null ? subtotal + fees : null };
  if (disabledReason) return { kind: "disabled" as const, subtotal, reason: disabledReason };
  if (remaining(d) === 0) return { kind: "disabled" as const, subtotal, reason: "Every ticket has sold." };
  return { kind: "buy" as const, subtotal };
}

/** The stub of the draw ticket: where you buy, or run, settle and refund. */
export function BuyPanel() {
  const { current: d, now } = useDrawSol();
  if (!d) return null;
  const ph = phaseOf(d, now);
  return (
    <div className="stub" id="buy" aria-label={ph === "selling" ? "Buy tickets" : "The draw"}>
      {ph === "selling" && <Selling d={d} />}
      {ph === "due" && <Due d={d} />}
      {ph === "drawing" && <Drawing d={d} now={now} />}
      {ph === "settled" && <Settled d={d} />}
      {ph === "cancelled" && <Cancelled d={d} />}
    </div>
  );
}

function Selling({ d }: { d: DrawView }) {
  const { step, barMode, closeConfirm } = useBuy();
  const { phase } = useActions();
  const confirm = step === "confirm" && !barMode;
  return (
    <>
      {/* one head slot: "Buy tickets" swaps to "Check and pay" in place (160ms crossfade) */}
      <div className="stub-head" key={confirm ? "confirm" : "pick"}>
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
          <>
            <h2 className="t-stub-head">{barMode ? "Tickets" : "Buy tickets"}</h2>
            <span className="price">
              <b>{sol(d.ticketPrice, 2, 4)} SOL</b> each, flat
            </span>
          </>
        )}
      </div>
      <span className="dbl" aria-hidden="true" />
      {confirm ? <ConfirmStep headingId="confirm-h" inStub /> : <Pick d={d} controls={!barMode} />}
    </>
  );
}

function Pick({ d, controls }: { d: DrawView; controls: boolean }) {
  const { wallet, player, myEntries, myState } = useDrawSol();
  const { claimFree, phase, errors, clearError, disabledReason } = useActions();
  // this wallet's counts are shown only once its accounts have been read
  const mineRead = myState === "ready";
  const spent = player?.spent ?? myEntries.reduce((n, e) => n + e.paidLamports, BigInt(0));
  const won = player?.won ?? myEntries.reduce((n, e) => n + e.instantPaid, BigInt(0));
  const { setVisible } = useWalletModal();
  const { qty, setQty, maxQ, openConfirm, connectThenConfirm } = useBuy();
  const bb = useBuyButton();
  const allowance = walletAllowance(d, player);
  const held = player?.tickets ?? myEntries.reduce((n, e) => n + e.count, 0);
  const subtotal = d.ticketPrice * BigInt(qty);
  // the pen only draws on when you choose; not on load
  const [inked, setInked] = useState(false);
  const choose = (n: number) => {
    setInked(true);
    setQty(n);
  };

  const freeLeft = Math.max(0, d.freeCap - d.freeTickets);
  const myFree = myEntries.find((e) => e.isFree);
  const fp = phase.free;
  const freeBusy = inFlight(fp);

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
    case "low":
      btn = { label: "Not enough devnet SOL", disabled: true };
      break;
    case "disabled":
      btn = { label: `Buy ${qty} ${plural(qty, "ticket", "tickets")}`, disabled: true };
      break;
    default:
      btn = { label: `Buy ${qty} ${plural(qty, "ticket", "tickets")}`, onClick: openConfirm, disabled: false };
  }

  return (
    <div className="stub-pick stub-in">
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
      {!controls && lowHelp && <p className="helper t-small">{lowHelp}</p>}
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
            {PICKS.map((p) => (
              <li key={p}>
                <button type="button" aria-pressed={qty === p} disabled={p > maxQ} onClick={() => choose(p)}>
                  {p}
                  {qty === p && <PenLoop key={`pen-${qty}`} pick={p} inked={inked} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="total">
            <span className="k t-small">
              <span className="tab">{qty}</span> × {sol(d.ticketPrice, 2, 4)} SOL
            </span>
            <b className="t-rowtotal">{sol(subtotal, 2, 4)} SOL</b>
          </div>
          <FeeLine />
          {bb?.kind === "low" ? (
            <a id="stub-buy" className="btn btn-block btn-56 buy-btn btn-out" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">
              Get devnet SOL
              <span className="sr-only"> (opens the Solana faucet in a new tab)</span>
            </a>
          ) : (
            <button type="button" id="stub-buy" className="btn btn-block btn-56 buy-btn" onClick={btn.onClick} disabled={btn.disabled}>
              {btn.label}
            </button>
          )}
          {bb?.kind === "low" ? (
            <p className="helper t-small">{lowHelp}</p>
          ) : bb?.kind === "disabled" ? (
            <p className="helper t-fine">{bb.reason}</p>
          ) : (
            <p className="after-buy t-small">Results land about <span className="nw">2 s</span> after you pay.</p>
          )}
        </div>
      )}
      <div>
        <dl className="ledger">
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
                  <dd>{mineRead ? Math.min(allowance.wallet, remaining(d)) : <span className="c-ink-3">…</span>}</dd>
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
        <p className="freeline t-fine">
          {myFree ? (
            <>Free entry claimed: {ticketNo(myFree.firstTicket)}.</>
          ) : freeLeft > 0 ? (
            <>
              Free entry: one per wallet, grand draw only. {freeLeft} of {d.freeCap} left.{" "}
              <button type="button" className="tbtn" onClick={wallet ? claimFree : () => setVisible(true)} disabled={freeBusy || !!disabledReason}>
                {freeBusy && <Busy />}
                {fp === "signing" ? "Approve in your wallet…" : fp === "confirming" ? "Confirming…" : "Claim free entry"}
              </button>
            </>
          ) : (
            <>All {d.freeCap} free entries are claimed.</>
          )}
        </p>
        {errors.free && (
          <div style={{ marginTop: 16 }}>
            <ErrorNote onDismiss={() => clearError("free")}>{errors.free.message}</ErrorNote>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A ballpoint loop around the chosen quick pick: open, overshooting and crossing itself at the
 * top right, heavier where the pen pressed (1.5 → 2.2px), and turned a few degrees per pick so it
 * never reads as a border. Draws on only when you choose (not on load).
 */
function PenLoop({ pick, inked }: { pick: number; inked: boolean }) {
  const turn = ((pick * 37) % 17) - 8; // −8…+8°, fixed per pick
  return (
    <svg className={`pen ${inked ? "anim" : ""}`} style={{ transform: `rotate(${turn}deg)` }} viewBox="0 0 60 40" preserveAspectRatio="none" aria-hidden="true">
      <path className="p1" d="M50 11C40 3 14 4 6 15C0 25 12 37 30 37C47 37 58 29 56 18C55 11 49 5 38 3" vectorEffect="non-scaling-stroke" />
      <path className="p2" d="M6 15C0 25 12 37 30 37C47 37 58 29 56 18" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** "You hold 16 tickets · won 0.08 SOL instantly." */
function YourEntry() {
  const { myEntries, wallet } = useDrawSol();
  if (!wallet) return null;
  const n = myEntries.reduce((s, e) => s + e.count, 0);
  if (n === 0) return null;
  const won = myEntries.reduce((s, e) => s + e.instantPaid, BigInt(0));
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

function Due({ d }: { d: DrawView }) {
  const { phase, errors, runDraw, clearError, disabledReason } = useActions();
  const { costs } = useDrawSol();
  // below 1024px the sticky bar owns the action; the stub explains it (one control, as when selling)
  const { barMode } = useBuy();
  const ph = phase.run;
  const busy = inFlight(ph);
  const soldOut = d.paidTickets >= d.ticketCap;
  const empty = d.nextTicket === 0;
  const verb = empty ? "Close the draw" : "Run the draw";
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
          <>No tickets were sold. Closing returns the prize and reserve to the operator. Anyone can do it.</>
        ) : (
          <>Anyone can run it. The randomness comes from ORAO, and nobody can choose it, us included.</>
        )}
      </p>
      {!empty && (
        <ol className="steps">
          <li className="now">
            <span className="mk" aria-hidden="true">1</span>
            <p className="ttl">You ask ORAO for randomness</p>
          </li>
          <li className="todo">
            <span className="mk" aria-hidden="true">2</span>
            <p className="ttl">Randomness lands, usually in a few seconds</p>
          </li>
          <li className="todo">
            <span className="mk" aria-hidden="true">3</span>
            <p className="ttl">
              Anyone settles; <span className="nw">{sol(d.prizeLamports, 0, 4)} SOL</span> to the winning ticket
            </p>
          </li>
        </ol>
      )}
      {!barMode && (
        <button type="button" className="btn btn-block btn-56" style={{ marginTop: empty ? 24 : 8 }} onClick={runDraw} disabled={busy || !!disabledReason}>
          {busy && <Busy />}
          {ph === "simulating" ? "Checking with the program…" : ph === "signing" ? "Approve in your wallet…" : ph === "confirming" ? "Confirming…" : verb}
        </button>
      )}
      {costs.oraoFee !== null && !empty && <p className="fee-plain">+ ≈{solRound(costs.oraoFee, 4, 1)} SOL randomness fee, paid by you</p>}
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
            Settle pays {sol(d.prizeLamports, 0, 4)} SOL to the winning ticket. Anyone can press it.
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
              If randomness hasn’t arrived by <span className="nw">{utcLabel(d.closesAt + CANCEL_GRACE_SECS)}</span>, anyone can cancel and every paid ticket is
              refunded.
            </>
          )}
        </p>
      )}
      {ready && cancellable && (
        <p className="safety t-fine">More than 48 h have passed since the close, so the program also lets anyone cancel; settling pays the winner instead.</p>
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
  const { myEntries, myState, wallet } = useDrawSol();
  const mine = myEntries.some((e) => e.firstTicket <= d.winningTicket && d.winningTicket < e.firstTicket + e.count);
  // "not one of yours" only once this wallet's tickets have actually been read
  const notMine = !!wallet && myState === "ready";
  return (
    <>
      <div className="stub-head">
        <h2 className="t-stub-head">Draw finished</h2>
      </div>
      <span className="dbl" aria-hidden="true" />
      <p className="stub-body t-body" style={{ color: "var(--ink)" }}>
        {mine ? (
          <>
            You hold the winning ticket {ticketNo(d.winningTicket)}. <span className="c-red nw b">{sol(d.prizeLamports, 0, 4)} SOL</span> was paid to your wallet.
          </>
        ) : (
          <>Ticket {ticketNo(d.winningTicket)} won.{notMine && " Not one of yours this time."}</>
        )}
      </p>
      <p className="t-small c-ink-2" style={{ marginTop: 16 }}>
        A new draw will appear here when the operator opens one. There isn’t one yet.
      </p>
      <CarbonSlip d={d} id="slip-current" />
    </>
  );
}

function Cancelled({ d }: { d: DrawView }) {
  const { myEntries, wallet, myState } = useDrawSol();
  const { barMode } = useBuy();
  const paid = myEntries.filter((e) => !e.isFree);
  const paidTickets = paid.reduce((n, e) => n + e.count, 0);
  const owed = paid.filter((e) => !e.refunded).reduce((n, e) => n + e.paidLamports, BigInt(0));
  const back = paid.filter((e) => e.refunded).reduce((n, e) => n + e.paidLamports, BigInt(0));
  const free = myEntries.find((e) => e.isFree);
  const empty = d.nextTicket === 0;
  return (
    <>
      <div className="stub-head">
        <h2 className="t-stub-head">{empty ? "Closed with no tickets" : "Refunds are open"}</h2>
      </div>
      <span className="dbl" aria-hidden="true" />
      <p className="stub-body t-small">
        {empty
          ? "Nobody bought a ticket, so the prize and reserve went back to the operator."
          : "The randomness never arrived within 48 h of closing, so the draw was cancelled. Every paid ticket can be refunded in full. There’s no deadline."}
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
                  <dd className={e.refunded ? "c-ink-3" : ""}>{e.refunded ? "refunded" : `${sol(e.paidLamports, 2, 4)} SOL`}</dd>
                </div>
              ))}
              {paid.length > 4 && (
                <div>
                  <dt>{paid.length - 4} more purchases</dt>
                  <dd>{sol(paid.slice(4).filter((e) => !e.refunded).reduce((n, e) => n + e.paidLamports, BigInt(0)), 2, 4)} SOL</dd>
                </div>
              )}
              {free && (
                <div>
                  <dt>
                    Free entry <span className="nw tab">{ticketNo(free.firstTicket)}</span>
                  </dt>
                  <dd className="c-ink-3">not refundable</dd>
                </div>
              )}
              <div className="sum">
                <dt>{back > BigInt(0) ? "Still to refund" : "Refundable to you"}</dt>
                <dd>{sol(owed, 2, 4)} SOL</dd>
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
function BarShell({ children, label, hidden }: { children: ReactNode; label: string; hidden?: boolean }) {
  return (
    <div className="buybar" role="region" aria-label={label} aria-hidden={hidden ? true : undefined}>
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
  if (ph === "cancelled") return !!wallet && myEntries.some((e) => !e.isFree && !e.refunded && e.paidLamports > BigInt(0));
  return false;
}

/** Room at the end of the page for the fixed bar (below 1024px only, via .bar-spacer). */
export function BarSpacer() {
  return useHasBar() ? <div className="bar-spacer" aria-hidden="true" /> : null;
}

function SellBar({ d }: { d: DrawView }) {
  const { qty, setQty, maxQ, openConfirm, connectThenConfirm, step } = useBuy();
  const bb = useBuyButton();
  if (!bb) return null;
  const total = `${sol(bb.subtotal, 2, 4)} SOL`;
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
    <BarShell label="Buy tickets" hidden={step === "confirm"}>
      {bb.kind === "cap" ? (
        <span className="bar-note t-small">
          {bb.held} of {d.maxPerWallet} held
        </span>
      ) : bb.kind === "low" ? (
        <span className="bar-note t-small">
          You have <span className="nw">{sol(bb.balance, 2, 4)} SOL</span>
        </span>
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
      ) : bb.kind === "low" ? (
        <a id="bar-buy" className="btn btn-out" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">
          Get devnet SOL
          <span className="sr-only"> (opens the Solana faucet in a new tab)</span>
        </a>
      ) : (
        <button
          type="button"
          id="bar-buy"
          className="btn"
          onClick={openConfirm}
          disabled={bb.kind === "disabled"}
          aria-label={`Buy ${qty} ${plural(qty, "ticket", "tickets")} for ${total}`}
        >
          Buy {qty} · {total}
        </button>
      )}
    </BarShell>
  );
}

function ActionBar({ d, ph }: { d: DrawView; ph: "due" | "drawing" | "cancelled" }) {
  const { drawRandomness: r, myEntries, wallet, now } = useDrawSol();
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
    const verb = d.nextTicket === 0 ? "Close the draw" : "Run the draw";
    return (
      <BarShell label="The draw">
        {failed("run") ?? <span className="bar-note t-small">Sales closed</span>}
        <button type="button" className="btn" onClick={runDraw} disabled={busy || !!disabledReason}>
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
  const owed = myEntries.filter((e) => !e.isFree && !e.refunded).reduce((n, e) => n + e.paidLamports, BigInt(0));
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
  const { step, barMode, closeConfirm } = useBuy();
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
        <ConfirmStep headingId="sheet-h" />
      </div>
    </>
  );
}
