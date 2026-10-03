"use client";

import { useState, type ReactNode } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { headlineHouseBps, pct, phaseOf } from "@/lib/derive";
import { oneIn, utcLabel } from "@/lib/format";
import { toHex } from "@/lib/fairness";
import { GAMBLE_AWARE_URL, ORAO_PROGRAM_ID, PROGRAM_ID, QUESTION_TERMS_HASHES, SOURCE_URL } from "@/lib/config";
import { vaultPda } from "@/lib/chain";
import { ProofLink } from "./bits";
import { useBuy } from "./BuyContext";
import { Microtext } from "./print/Mark";
import { kindName, prizeFig } from "./fmt";

/**
 * The back of the ticket: the reverse of the hero ticket, at the same width and x, with the same
 * perforation. The six promises are a ledger on the body; the house rules sit on the stub.
 */
export function Rules() {
  const { current: d, draws, myEntries, now } = useDrawSol();
  const { lastSig } = useActions();
  const { showFree } = useBuy();
  const [fullHash, setFullHash] = useState(false);
  if (!d) return null;

  const settledPast = draws.filter((x) => x.status === "settled").sort((a, b) => b.id - a.id)[0];
  const lastRevealTx = Object.entries(lastSig).find(([k]) => k.startsWith("reveal:"))?.[1];
  // the newest revealed paid entry of this wallet: its account holds the revealed results
  const lastRevealed = myEntries.filter((e) => !e.isFree && e.revealed).sort((a, b) => b.seq - a.seq)[0];
  const hash = toHex(d.termsHash);
  const freeLeft = Math.max(0, d.freeCap - d.freeTickets);
  const claimed = myEntries.some((e) => e.isFree);
  const selling = phaseOf(d, now) === "selling";

  const pot = d.kind === "pot";
  const grace = Math.round(d.publicGraceSecs / 60);
  const runRow = {
    p: "Anyone can run and settle the draw.",
    h: (
      <>
        At the draw time the operator’s keeper asks ORAO for randomness; if it hasn’t within {grace} min, any wallet can. Settling, revealing and refunding are
        open to any wallet at any time. If we disappear, anyone can finish the job and the winner still gets paid. If the randomness never arrives within 48 h,
        refunds open.
      </>
    ),
    c: (
      <>
        <ProofLink account={PROGRAM_ID}>Program</ProofLink>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <ProofLink href={SOURCE_URL}>Source</ProofLink>
      </>
    ),
  };
  const randomRow = {
    p: "Nobody chooses the randomness.",
    h: <>Every result comes from ORAO VRF. The request seed is fixed by program state, so the buyer, the operator and whoever runs the draw get no say, us included.</>,
    c: <ProofLink account={ORAO_PROGRAM_ID}>ORAO VRF program</ProofLink>,
  };
  const recomputeRow = {
    p: "Every result can be recomputed.",
    h: <>Instant results and the winning ticket follow from the randomness by plain arithmetic, so this page can redo it in your browser.</>,
    c: settledPast ? (
      <a className="tbtn" href={d.status === "settled" ? "#slip-current" : `#recompute-${settledPast.id}`}>
        Recompute Draw Nº {settledPast.id}
      </a>
    ) : (
      <span className="c-ink-3">once a draw settles</span>
    ),
  };
  const rows: { p: string; h: ReactNode; c: ReactNode }[] = pot
    ? [
        {
          p: "Every lamport is split on-chain.",
          h: (
            <>
              <code>buy_tickets</code> splits every paid ticket inside the instruction: {pct(d.houseBps)} to the house, {pct(d.potBps)} to the pot, {pct(d.instantBps)}{" "}
              to the instant pool. All of it stays in the program’s vault, and the house share can only be withdrawn once the draw has settled, never while a
              refund could still be owed.
            </>
          ),
          c: <ProofLink account={vaultPda(d.address)}>Vault account</ProofLink>,
        },
        {
          p: "Fixed tickets, fixed draw time.",
          h: (
            <>
              {d.ticketCap} paid tickets, drawing on <span className="nw">{utcLabel(d.drawAt)}</span>. Both are written into the draw account and can’t change. A
              sell-out ends sales early; the draw still waits for its time.
            </>
          ),
          c: <ProofLink account={d.address}>Draw account</ProofLink>,
        },
        randomRow,
        {
          p: "An instant result on every ticket, free ones included.",
          h: (
            <>
              About <span className="nw">2 s</span> after you buy, the reveal works out each ticket’s result. A SOL win is a share of the instant pool as it stood
              right after your purchase, so a late reveal can’t inflate it, and it is paid from the pool in the same transaction. Unwon instant pool rolls into the
              pot; the house never takes it.
            </>
          ),
          c: lastRevealTx ? (
            <ProofLink tx={lastRevealTx}>Your last reveal</ProofLink>
          ) : lastRevealed ? (
            <ProofLink account={lastRevealed.address}>Your last revealed entry</ProofLink>
          ) : (
            <ProofLink account={ORAO_PROGRAM_ID}>ORAO VRF program</ProofLink>
          ),
        },
        runRow,
        recomputeRow,
      ]
    : [
        {
          p: "The prize is escrowed before the first ticket sells.",
          h: (
            <>
              <code>create_headline_draw</code> moves the <span className="nw">{prizeFig(d.prizeLamports)} SOL</span> prize into the program’s vault in the same
              instruction that opens the draw. Only the winning ticket can collect it.
            </>
          ),
          c: <ProofLink account={vaultPda(d.address)}>Vault account</ProofLink>,
        },
        {
          p: "The minimum, or a full refund.",
          h: (
            <>
              It draws on <span className="nw">{utcLabel(d.drawAt)}</span> once {d.minTickets} paid tickets sell. Below that at the draw time it is cancelled: the
              prize goes back to the operator and every paid ticket is refunded in full. There are no instant wins, so nothing is paid out before that is decided.
            </>
          ),
          c: <ProofLink account={d.address}>Draw account</ProofLink>,
        },
        randomRow,
        runRow,
        recomputeRow,
      ];
  const atCap = headlineHouseBps(d, d.ticketCap);
  const atMin = headlineHouseBps(d, d.minTickets);
  const count = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"][rows.length] ?? String(rows.length);

  return (
    <section className="sec" id="rules" aria-labelledby="rules-h">
      <div className="back-grid">
        <div className="back-intro">
          <h2 className="t-sec" id="rules-h">
            The back of the ticket
          </h2>
          <p className="t-small sec-sub">
            {count} promises of this {kindName(d.kind)}, and where to check each one.
          </p>
        </div>
        <article className="ticket back" aria-labelledby="rules-h">
          <div className="tk-body">
            <div className="tk-head">
              <span className="t-ticket-head">
                <span className="th-brand">
                  DrawSol<span className="th-sep"> · </span>
                </span>
                conditions of issue
              </span>
              <span className="t-serial tk-serial">Nº {String(d.id).padStart(4, "0")}</span>
            </div>
            <span className="tk-headrule" aria-hidden="true">
              <span className="top" />
              <Microtext />
            </span>
            <ol className="promises">
              {rows.map((r) => (
                <li key={r.p}>
                  <div>
                    <p className="p">{r.p}</p>
                    <p className="h t-small">{r.h}</p>
                  </div>
                  <p className="c t-small">{r.c}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="stub back-stub">
            <div className="stub-head">
              <h3 className="t-stub-head">House rules</h3>
            </div>
            <span className="dbl" aria-hidden="true" />
            <ul className="house-list t-small">
              <li>18+ only. You confirm it once on each device.</li>
              <li>A prize draw with a free entry route: every result is decided by chance, and you can enter free instead of buying.</li>
              <li>
                {pot ? (
                  <>
                    The house keeps {pct(d.houseBps)} of every paid ticket. The other {pct(10_000 - d.houseBps)} goes back to players: {pct(d.potBps)} into the pot and{" "}
                    {pct(d.instantBps)} into instant wins.
                  </>
                ) : atCap !== null && atMin !== null ? (
                  <>
                    The house keeps what the tickets bring in beyond the <span className="nw">{prizeFig(d.prizeLamports)} SOL</span> prize: {pct(atCap)} if every ticket
                    sells, {pct(atMin)} at the {d.minTickets}-ticket minimum.
                  </>
                ) : null}
              </li>
              <li>
                Up to {d.maxPerTx} tickets per purchase and {d.maxPerWallet} per wallet per draw, enforced on-chain.
              </li>
              <li>
                One free entry per wallet,{" "}
                {pot ? "with the same chance as a paid ticket, including instant wins" : "with the same chance of the grand prize as one paid ticket"} ({freeLeft} of{" "}
                {d.freeCap} left).{" "}
                {!claimed && freeLeft > 0 && selling && (
                  <button type="button" className="tbtn" onClick={showFree}>
                    Claim free entry
                  </button>
                )}
              </li>
              <li>
                {d.nextTicket > 0 ? (
                  <>
                    Grand-prize odds are <span className="nw">{oneIn(1, d.nextTicket)}</span> per ticket right now; every ticket counts, free and credit ones too.
                  </>
                ) : (
                  <>Grand-prize odds are one in the number of tickets in the draw; every ticket counts, free and credit ones too.</>
                )}
              </li>
              <li>
                Set a 30-day play limit or take a break from this wallet. Both are enforced by the program.{" "}
                <a className="tbtn" href="#limits">
                  Play limits
                </a>
              </li>
              <li>Priced and paid in SOL. Nothing is converted.</li>
              <li>Devnet only: play money with no cash value.</li>
              <li>
                If it stops being fun, <ProofLink href={GAMBLE_AWARE_URL}>BeGambleAware</ProofLink> can help.
              </li>
            </ul>
            {QUESTION_TERMS_HASHES.includes(hash) && (
              <p className="terms t-fine">
                Draw Nº {d.id}’s published terms (committed in <code>terms_hash</code>) mention an in-app question. It was removed on 2 Oct 2026; it never affected who
                could enter or win, and it was never checked on-chain.
              </p>
            )}
            <p className="terms t-fine">
              These terms are committed on-chain as{" "}
              <code className="nw">{fullHash ? hash : `${hash.slice(0, 8)}…${hash.slice(-8)}`}</code>.{" "}
              <button type="button" className="tbtn" onClick={() => setFullHash((v) => !v)} aria-expanded={fullHash}>
                {fullHash ? "Show short hash" : "Show full hash"}
              </button>
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
