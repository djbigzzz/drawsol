"use client";

import { useEffect, useMemo, useState } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { Check, ErrorNote, Spinner } from "./bits";
import { phaseOf, remaining, walletAllowance } from "@/lib/derive";
import { sol, ticketNo } from "@/lib/format";
import { FAUCET_URL } from "@/lib/config";

const PRESETS = [1, 5, 10, 25];

/** UI-only skill question. Not enforced on-chain (SPEC §4.1) — the copy says so. */
const SKILL = {
  q: "A split-flap board reads 097. Three more tickets sell. What does it read now?",
  options: ["097", "100", "103"],
  answer: 1,
};

export function BuyPanel() {
  const { current: d, now, wallet, player, costs, myEntries } = useDrawSol();
  const { buy, phase, errors, clearError, claimFree, disabledReason } = useActions();
  const { setVisible } = useWalletModal();
  const [qty, setQty] = useState(5);
  const [skill, setSkill] = useState<number | null>(null);
  const [adult, setAdult] = useState(false);

  const allowance = d ? walletAllowance(d, player) : null;
  const maxQ = d ? (wallet ? allowance!.max : Math.min(d.maxPerTx, remaining(d))) : 0;

  useEffect(() => {
    if (maxQ > 0 && qty > maxQ) setQty(maxQ);
    if (maxQ > 0 && qty < 1) setQty(1);
  }, [maxQ, qty]);

  const fees = useMemo(() => {
    if (costs.oraoFee === null || costs.entryRent === null) return null;
    return costs.oraoFee + costs.entryRent + (player ? BigInt(0) : costs.playerRent ?? BigInt(0));
  }, [costs, player]);

  if (!d) return null;
  const ph = phaseOf(d, now);

  if (ph !== "selling") {
    const myTickets = myEntries.reduce((n, e) => n + e.count, 0);
    const myWon = myEntries.reduce((n, e) => n + e.instantPaid, BigInt(0));
    const iWon = myEntries.some((e) => e.firstTicket <= d.winningTicket && d.winningTicket < e.firstTicket + e.count);
    const msg = {
      due: ["Sales closed", d.paidTickets >= d.ticketCap ? "Sold out. The draw is due — anyone can run it from the board." : "The deadline has passed. The draw is due — anyone can run it from the board."],
      drawing: ["Sales closed", "The draw is running. Results land on the board as soon as ORAO delivers."],
      settled: ["Draw finished", "This draw has a winner. A new draw will show up here when the operator opens one — there isn't one yet."],
      cancelled: ["Refunds open", "This draw was cancelled. Paid tickets can be refunded in full from My tickets."],
    }[ph];
    return (
      <aside className="frame px-4 py-6 md:px-6" aria-label="Tickets">
        <div className="eyebrow mb-2">Tickets</div>
        <div className="display text-[32px] leading-[32px]">{msg[0]}</div>
        <p className="mt-3 text-[14px] leading-[22px] text-dim">{msg[1]}</p>
        {wallet && myTickets > 0 && (
          <div className="mt-6 border-t border-line pt-4">
            <div className="eyebrow mb-2">Your entry</div>
            <div className="mono text-[13px] leading-[22px]">
              {myTickets} {myTickets === 1 ? "ticket" : "tickets"}
              {myWon > BigInt(0) && <span className="text-brass"> · won {sol(myWon, 2, 4)} SOL instantly</span>}
            </div>
            {ph === "settled" && (
              <div className={`mt-1 text-[13px] ${iWon ? "text-brass" : "text-dim"}`}>
                {iWon ? `You hold the winning ticket ${ticketNo(d.winningTicket)}.` : `Ticket ${ticketNo(d.winningTicket)} won — not one of yours this time.`}
              </div>
            )}
          </div>
        )}
        {ph === "cancelled" && (
          <a className="btn ghost small mt-6" href="#my-tickets">
            Go to my tickets ↓
          </a>
        )}
      </aside>
    );
  }

  const q = Math.max(1, Math.min(qty, Math.max(1, maxQ)));
  const subtotal = d.ticketPrice * BigInt(q);
  const total = fees !== null ? subtotal + fees : null;
  const bp = phase.buy;
  const busy = bp === "simulating" || bp === "signing" || bp === "confirming";
  const lowBalance = wallet && wallet.balance !== null && total !== null && wallet.balance < total;
  const capReached = wallet && allowance && allowance.wallet === 0;
  const held = allowance?.held ?? 0;
  const after = held + q;
  const share = ((after / (d.nextTicket + q)) * 100).toFixed(after / (d.nextTicket + q) < 0.1 ? 1 : 0);
  const skillWrong = skill !== null && skill !== SKILL.answer;
  const ready = skill === SKILL.answer && adult;

  let cta: React.ReactNode;
  let ctaAction: (() => void) | null = null;
  if (!wallet) {
    cta = "Connect wallet to buy";
    ctaAction = () => setVisible(true);
  } else if (capReached) {
    cta = `Wallet limit reached (${held}/${d.maxPerWallet})`;
  } else if (lowBalance) {
    cta = "Not enough devnet SOL";
  } else if (bp === "simulating") {
    cta = "Checking with the program…";
  } else if (bp === "signing") {
    cta = "Approve in your wallet…";
  } else if (bp === "confirming") {
    cta = "Confirming on devnet…";
  } else {
    cta = `Buy ${q} ${q === 1 ? "ticket" : "tickets"} · ${sol(subtotal, 2, 4)} SOL`;
    if (ready) ctaAction = () => buy(q);
  }

  const freeLeft = d.freeCap - d.freeTickets;
  const fp = phase.free;
  const freeBusy = fp === "simulating" || fp === "signing" || fp === "confirming";

  return (
    <aside className="frame" aria-label="Buy tickets" id="buy">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-4 md:px-6">
        <h2 className="display text-[28px] leading-[28px]">Tickets</h2>
        <span className="mono text-[13px] text-dim">
          <span className="text-cream">{sol(d.ticketPrice, 2, 4)} SOL</span> each
        </span>
      </div>

      <div className="space-y-6 px-4 py-6 md:px-6">
        {/* quantity */}
        <div>
          <label htmlFor="qty" className="eyebrow mb-2 block">
            How many
          </label>
          <div className="stepper">
            <button onClick={() => setQty(q - 1)} disabled={q <= 1 || busy} aria-label="One fewer">
              −
            </button>
            <input
              id="qty"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQ}
              value={q}
              disabled={busy}
              onChange={(e) => setQty(Math.max(1, Math.min(maxQ || 1, Number(e.target.value) || 1)))}
            />
            <button onClick={() => setQty(q + 1)} disabled={q >= maxQ || busy} aria-label="One more">
              +
            </button>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button key={p} className="preset" aria-pressed={q === p} disabled={p > maxQ || busy} onClick={() => setQty(p)}>
                {p}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[12px] leading-[18px] text-dim">
            Up to {d.maxPerTx} per purchase · {d.maxPerWallet} per wallet
            {wallet && allowance && <> · you can buy {allowance.max} more</>}
          </div>
        </div>

        {/* receipt */}
        <dl className="mono space-y-2 border-y border-dashed border-line py-4 text-[13px] leading-[20px]">
          <div className="flex justify-between gap-4">
            <dt className="text-dim">
              {q} × {sol(d.ticketPrice, 2, 4)}
            </dt>
            <dd>{sol(subtotal, 2, 4)} SOL</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-dim">ORAO fee + account rent</dt>
            <dd>{fees !== null ? `≈ ${sol(fees, 3, 4)} SOL` : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 text-cream">
            <dt>You pay</dt>
            <dd>{total !== null ? `≈ ${sol(total, 3, 4)} SOL` : `${sol(subtotal, 2, 4)} SOL + fees`}</dd>
          </div>
        </dl>

        <p className="text-[13px] leading-[20px] text-dim">
          After this you&apos;ll hold <span className="text-cream">{after}</span> {after === 1 ? "ticket" : "tickets"} — {share}% of the
          draw today. New tickets start at <span className="mono text-cream">{ticketNo(d.nextTicket)}</span>. Each one also rolls
          for an instant win, paid when it&apos;s revealed.
        </p>

        {/* skill question */}
        <fieldset>
          <legend className="eyebrow mb-2">Skill question</legend>
          <p className="mb-3 text-[14px] leading-[20px]">{SKILL.q}</p>
          <div className="grid grid-cols-3 gap-2">
            {SKILL.options.map((o, i) => (
              <label key={o} className="choice mono justify-center">
                <input type="radio" name="skill" className="sr-only" checked={skill === i} onChange={() => setSkill(i)} />
                {o}
              </label>
            ))}
          </div>
          <p className={`mt-2 text-[12px] leading-[18px] ${skillWrong ? "text-cream" : "text-dim"}`}>
            {skillWrong ? "Not quite — count again." : "Checked here in the app only, not on-chain."}
          </p>
        </fieldset>

        <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-[20px]">
          <input type="checkbox" className="mt-[3px] h-4 w-4 accent-[#F3EAD6]" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>I&apos;m 18 or older and I understand this is a devnet demo with play money.</span>
        </label>

        <div className="space-y-3">
          <button className="btn block" disabled={!ctaAction || busy || !!disabledReason} onClick={() => ctaAction?.()}>
            {busy && <Spinner />}
            {cta}
          </button>
          {wallet && !ready && !busy && !capReached && !lowBalance && (
            <p className="text-center text-[12px] text-dim">Answer the question and confirm you&apos;re 18+ to continue.</p>
          )}
          {lowBalance && (
            <p className="text-[13px] leading-[20px] text-dim">
              You have {sol(wallet!.balance!, 2, 4)} SOL. Get free devnet SOL from the{" "}
              <a className="link" href={FAUCET_URL} target="_blank" rel="noopener noreferrer">
                Solana faucet ↗
              </a>
              .
            </p>
          )}
          {disabledReason && <p className="text-[12px] text-dim">{disabledReason}</p>}
          {errors.buy && <ErrorNote onDismiss={() => clearError("buy")}>{errors.buy.message}</ErrorNote>}
        </div>
      </div>

      {/* free entry */}
      <div className="border-t border-line px-4 py-4 text-[13px] leading-[20px] md:px-6">
        {player?.freeClaimed ? (
          <span className="inline-flex items-center gap-2 text-dim">
            <Check className="text-green" /> Free entry claimed for this wallet
          </span>
        ) : freeLeft > 0 ? (
          <div className="flex items-center justify-between gap-4">
            <span className="text-dim">
              <span className="text-cream">Free entry</span> — 1 per wallet, grand draw only. {freeLeft} of {d.freeCap} left.
            </span>
            <button
              className="btn small ghost flex-none"
              onClick={wallet ? claimFree : () => setVisible(true)}
              disabled={freeBusy || !!disabledReason || !!capReached}
            >
              {freeBusy && <Spinner />}
              {fp === "signing" ? "Approve…" : fp === "confirming" ? "Confirming…" : "Claim"}
            </button>
          </div>
        ) : (
          <span className="text-dim">All {d.freeCap} free entries have been claimed.</span>
        )}
        {errors.free && (
          <div className="mt-3">
            <ErrorNote onDismiss={() => clearError("free")}>{errors.free.message}</ErrorNote>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Fixed bottom bar on small screens while sales are open. */
export function MobileBuyBar() {
  const { current: d, now } = useDrawSol();
  if (!d || phaseOf(d, now) !== "selling") return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-brass/50 bg-black lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="page flex h-16 items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="mono text-[13px] leading-[18px]">{sol(d.ticketPrice, 2, 4)} SOL / ticket</div>
          <div className="text-[12px] leading-[16px] text-dim">{remaining(d)} of {d.ticketCap} left</div>
        </div>
        <a className="btn small" href="#buy">
          Buy tickets
        </a>
      </div>
    </div>
  );
}
