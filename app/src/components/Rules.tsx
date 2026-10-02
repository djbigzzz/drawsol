"use client";

import { useState, type ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { maxEntries } from "@/lib/derive";
import { oneIn, sol, utcLabel } from "@/lib/format";
import { toHex } from "@/lib/fairness";
import { GAMBLE_AWARE_URL, ORAO_PROGRAM_ID, PROGRAM_ID, SOURCE_URL } from "@/lib/config";
import { vaultPda } from "@/lib/chain";
import { ProofLink } from "./bits";
import { Microtext } from "./print/Mark";

/**
 * The back of the ticket: the reverse of the hero ticket, at the same width and x, with the same
 * perforation. The six promises are a ledger on the body; the house rules sit on the stub.
 */
export function Rules() {
  const { current: d, draws, myEntries, wallet } = useDrawSol();
  const { lastSig, claimFree } = useActions();
  const { setVisible } = useWalletModal();
  const [fullHash, setFullHash] = useState(false);
  if (!d) return null;

  const settledPast = draws.filter((x) => x.status === "settled").sort((a, b) => b.id - a.id)[0];
  const lastRevealTx = Object.entries(lastSig).find(([k]) => k.startsWith("reveal:"))?.[1];
  // the newest revealed paid entry of this wallet: its account holds the revealed results
  const lastRevealed = myEntries.filter((e) => !e.isFree && e.revealed).sort((a, b) => b.seq - a.seq)[0];
  const hash = toHex(d.termsHash);
  const freeLeft = Math.max(0, d.freeCap - d.freeTickets);
  const claimed = myEntries.some((e) => e.isFree);

  const rows: { p: string; h: ReactNode; c: ReactNode }[] = [
    {
      p: "The prize is locked before the first ticket sells.",
      h: (
        <>
          <code>create_draw</code> moves the <span className="nw">{sol(d.prizeLamports, 0, 4)} SOL</span> prize and the{" "}
          <span className="nw">{sol(d.iwReserveLamports, 0, 4)} SOL</span> instant-win reserve into the program’s vault in the same instruction that opens the
          draw. Only the winning ticket can collect the prize; if the draw is cancelled, every paid ticket can claim a full refund.
        </>
      ),
      c: <ProofLink account={vaultPda(d.address)}>Vault account</ProofLink>,
    },
    {
      p: "Fixed tickets, fixed close.",
      h: (
        <>
          {d.ticketCap} tickets, closing <span className="nw">{utcLabel(d.closesAt)}</span>. Both are written into the draw account and can’t change. The draw
          happens at sell-out or the deadline, whichever comes first.
        </>
      ),
      c: <ProofLink account={d.address}>Draw account</ProofLink>,
    },
    {
      p: "Nobody chooses the randomness.",
      h: <>Every result comes from ORAO VRF. The request seed is fixed by program state, so the buyer, the operator and whoever runs the draw get no say, us included.</>,
      c: <ProofLink account={ORAO_PROGRAM_ID}>ORAO VRF program</ProofLink>,
    },
    {
      p: "An instant result on every ticket.",
      h: <>About <span className="nw">2 s</span> after you buy, the reveal transaction works out each ticket’s result and pays any win from the reserve in that same transaction.</>,
      c: lastRevealTx ? (
        <ProofLink tx={lastRevealTx}>Your last reveal</ProofLink>
      ) : lastRevealed ? (
        <ProofLink account={lastRevealed.address}>Your last revealed entry</ProofLink>
      ) : (
        <ProofLink account={ORAO_PROGRAM_ID}>ORAO VRF program</ProofLink>
      ),
    },
    {
      p: "Anyone can run and settle the draw.",
      h: (
        <>
          Running, settling, revealing and refunding are open to any wallet. If we disappear, anyone can finish the job and the winner still gets paid. If the
          randomness never arrives within 48 h, refunds open.
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
    },
    {
      p: "Every result can be recomputed.",
      h: <>Instant results and the winning ticket follow from the randomness by plain arithmetic, so this page can redo it in your browser.</>,
      c: settledPast ? (
        <a className="tbtn" href={d.status === "settled" ? "#slip-current" : `#recompute-${settledPast.id}`}>
          Recompute Draw Nº {settledPast.id}
        </a>
      ) : (
        <span className="c-ink-3">once a draw settles</span>
      ),
    },
  ];

  return (
    <section className="sec" id="rules" aria-labelledby="rules-h">
      <div className="back-grid">
        <div className="back-intro">
          <h2 className="t-sec" id="rules-h">
            The back of the ticket
          </h2>
          <p className="t-small sec-sub">Six promises, and where to check each one.</p>
        </div>
        <article className="ticket back" aria-labelledby="rules-h">
          <div className="tk-body">
            <div className="tk-head">
              <span className="t-ticket-head">
                <span className="th-brand">DrawSol · </span>conditions of issue
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
              <li>One general-knowledge question before each purchase. It’s asked here in the app, not checked on-chain.</li>
              <li>
                Up to {d.maxPerTx} tickets per purchase and {d.maxPerWallet} per wallet per draw, enforced on-chain.
              </li>
              <li>
                One free entry per wallet, grand draw only ({freeLeft} of {d.freeCap} left).{" "}
                {!claimed && freeLeft > 0 && d.status === "open" && (
                  <button type="button" className="tbtn" onClick={wallet ? claimFree : () => setVisible(true)}>
                    Claim free entry
                  </button>
                )}
              </li>
              <li>
                Instant-win odds are boosted for this demo.{" "}
                {d.nextTicket > 0 ? (
                  <>
                    Grand-prize odds are <span className="nw">{oneIn(1, d.nextTicket)}</span> per ticket right now, and never worse than{" "}
                    <span className="nw">{oneIn(1, maxEntries(d))}</span>.
                  </>
                ) : (
                  <>
                    Grand-prize odds are never worse than <span className="nw">{oneIn(1, maxEntries(d))}</span> per ticket.
                  </>
                )}
              </li>
              <li>Priced and paid in SOL. Nothing is converted.</li>
              <li>Devnet only: play money with no cash value.</li>
              <li>
                If it stops being fun, <ProofLink href={GAMBLE_AWARE_URL}>BeGambleAware</ProofLink> can help.
              </li>
            </ul>
            <p className="terms t-fine">
              The question and these terms are committed on-chain as{" "}
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
