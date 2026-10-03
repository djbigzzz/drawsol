"use client";

import Link from "next/link";
import { useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { headlineHouseBps, pct, phaseOf, scheduleTotals } from "@/lib/derive";
import { campaignOf, usdWhole } from "@/lib/campaigns";
import { oneIn, utcLabel } from "@/lib/format";
import { toHex } from "@/lib/fairness";
import { GAMBLE_AWARE_URL, ORAO_PROGRAM_ID, PROGRAM_ID, SOURCE_URL } from "@/lib/config";
import { vaultPda } from "@/lib/chain";
import { ProofLink, Section } from "./bits";
import { useBuy } from "./BuyContext";
import { n, prizeFig } from "./fmt";

/** Four promises, each with the place to check it. */
export function TrustStrip() {
  const { current: d, draws } = useDrawSol();
  if (!d) return null;
  const settled = draws.filter((x) => x.status === "settled").sort((a, b) => b.id - a.id)[0];
  const items: { t: string; s: string; link: React.ReactNode }[] = [
    { t: "Prize locked before sales", s: "The prize sits in the program’s vault from the moment the draw opens.", link: <ProofLink account={vaultPda(d.address)}>Vault</ProofLink> },
    {
      t: "Winner picked by ORAO VRF",
      s: "The randomness is requested at the draw time; nobody can choose it, and anyone can recompute the result.",
      link: settled ? <Link className="tbtn" href={`/draw/?n=${settled.id}#recompute`}>Recompute № {settled.id}</Link> : <ProofLink account={ORAO_PROGRAM_ID}>ORAO VRF</ProofLink>,
    },
    d.guaranteed
      ? { t: "Guaranteed draw", s: `It draws ${utcLabel(d.drawAt)} whatever has sold. The end prize rule (${n(d.minTickets)} sold for the full prize, else ${d.potBps / 100}% of sales) is enforced by the program.`, link: <ProofLink account={d.address}>Draw account</ProofLink> }
      : { t: "Full refund if undersold", s: `Below ${n(d.minTickets)} paid tickets at the draw time, the program cancels and refunds every ticket in full.`, link: <ProofLink account={d.address}>Draw account</ProofLink> },
    { t: "Every entry public", s: "Each ticket is an account on Solana devnet, so the list can’t be padded or trimmed.", link: <Link className="tbtn" href={`/draw/?n=${d.id}#entries`}>All entries</Link> },
  ];
  return (
    <section className="trust" aria-label="Why you can trust this draw">
      <ul className="trust-list">
        {items.map((it) => (
          <li key={it.t} className="trust-item">
            <span className="trust-ic" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path d="M3.5 9.5 7.2 13 14.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div>
              <b>{it.t}</b>
              <p>{it.s}</p>
              <p className="trust-link">{it.link}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HowItWorks() {
  const { current: d } = useDrawSol();
  if (!d) return null;
  const camp = campaignOf(d.id);
  const instants = scheduleTotals(d);
  const steps: [string, string][] = instants.count
    ? [
        ["Get your tickets", `Choose how many (up to ${n(d.maxPerTx)} a time, ${n(d.maxPerWallet)} per person) and pay in SOL from your wallet, or claim your one free entry.`],
        ["Reveal if you’ve won", `About 2 s later ORAO assigns your ticket numbers at random. Any number on the published schedule of ${n(instants.count)} instant prizes is paid to you in the same reveal transaction.`],
        ["End prize drawn Sunday", `At ${utcLabel(d.drawAt)} the program asks ORAO VRF for randomness and one ticket wins the end prize: ${camp ? usdWhole(camp.usd) : `${prizeFig(d.prizeLamports)} SOL`} once ${n(d.minTickets)} tickets have sold, else ${d.potBps / 100}% of sales. Guaranteed, no refunds.`],
      ]
    : [
        ["Pick your tickets", `Choose how many (up to ${d.maxPerTx} a time, ${d.maxPerWallet} per wallet) and pay in SOL from your wallet, or claim your one free entry. Each ticket gets a number.`],
        ["The draw runs at the deadline", `At ${utcLabel(d.drawAt)} the program asks ORAO VRF for randomness and the winning ticket is computed from it. Nobody picks it, and anyone can run the draw.`],
        ["The winner is paid from the vault", `The prize is paid straight to the wallet that holds the winning ticket. If fewer than ${n(d.minTickets)} tickets sold, everyone is refunded in full instead.`],
      ];
  return (
    <Section id="how" title="How it works">
      <ol className="how">
        {steps.map(([t, s], i) => (
          <li key={t} className="how-step">
            <span className="how-n tab" aria-hidden="true">
              {i + 1}
            </span>
            <h3>{t}</h3>
            <p>{s}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** The rules, short, as a FAQ; the terms hash; the Play safe link. */
export function Rules() {
  const { current: d, myEntries, now } = useDrawSol();
  const { showFree } = useBuy();
  const [fullHash, setFullHash] = useState(false);
  if (!d) return null;
  const hash = toHex(d.termsHash);
  const freeLeft = Math.max(0, d.freeCap - d.freeTickets);
  const claimed = myEntries.some((e) => e.isFree);
  const selling = phaseOf(d, now) === "selling";
  const atCap = headlineHouseBps(d, d.ticketCap);
  const atMin = headlineHouseBps(d, d.minTickets);
  const grace = Math.round(d.publicGraceSecs / 60);
  const camp = campaignOf(d.id);
  const instants = scheduleTotals(d);
  const qa: [string, React.ReactNode][] = [
    [
      "How is the winner picked?",
      <>
        At the draw time the program asks ORAO VRF for randomness. The request seed is fixed by program state, so the buyer, the operator and whoever runs the draw get no
        say. The winning ticket is plain arithmetic on that randomness, published in the program (<code>fairness.rs</code>) and in this app, so anyone can redo it.{" "}
        <ProofLink account={ORAO_PROGRAM_ID}>ORAO VRF program</ProofLink>
      </>,
    ],
    [
      "What are my odds?",
      <>
        Every ticket has the same chance, free and paid alike: one in the number of tickets in the draw.{" "}
        {d.nextTicket > 0 ? (
          <>
            Right now that is <b>{oneIn(1, d.nextTicket)}</b> per ticket, with {n(d.nextTicket)} tickets in.
          </>
        ) : (
          <>No tickets are in yet.</>
        )}
      </>,
    ],
    [
      `What if fewer than ${n(d.minTickets)} tickets sell?`,
      d.guaranteed ? (
        <>
          The draw still runs at {utcLabel(d.drawAt)}. The end prize is then {d.potBps / 100}% of ticket sales instead of the escrowed {camp ? usdWhole(camp.usd) : `${prizeFig(d.prizeLamports)} SOL`},
          and the escrow goes back to the operator. This page shows the end prize as it stands right now. There are no refunds.
        </>
      ) : (
        <>
          The draw is cancelled by the program at the draw time, the prize goes back to the operator and every paid ticket is refunded in full from the vault. There is
          no deadline on claiming a refund, and anyone can send it; it always pays the ticket’s owner.
        </>
      ),
    ],
    ...(instants.count
      ? ([
          [
            "How do the instant prizes work?",
            <>
              The {n(instants.count)} winning ticket numbers were written into the draw account before sales opened and can’t change; the full list is under Prizes. Your
              ticket numbers are assigned at random by ORAO when you reveal, about 2 s after paying, so nobody can buy a known winning number. A match is paid in the
              reveal transaction, and a prize whose number is never sold is simply not won.
            </>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    [
      "Is there a free way to enter?",
      <>
        Yes. One free entry per wallet while sales are open ({freeLeft} of {d.freeCap} left), no purchase needed. It is one ticket, numbered like any other, with the same
        chance of the prize.{" "}
        {!claimed && freeLeft > 0 && selling && (
          <button type="button" className="tbtn" onClick={showFree}>
            Claim free entry
          </button>
        )}
      </>,
    ],
    [
      "Who runs the draw, and what if DrawSol disappears?",
      <>
        The operator’s keeper requests the draw at the draw time; if it hasn’t within {grace} minutes, any wallet can. Settling and refunding are open to any wallet at any
        time. If the randomness never arrives within 48 hours, anyone can cancel and refunds open. <ProofLink account={PROGRAM_ID}>Program</ProofLink> ·{" "}
        <ProofLink href={SOURCE_URL}>Source</ProofLink>
      </>,
    ],
    [
      "What does the house keep?",
      <>
        {atCap !== null && atMin !== null ? (
          <>
            What the tickets bring in beyond the {prizeFig(d.prizeLamports)} SOL prize: {pct(atCap)} of ticket money if every ticket sells, {pct(atMin)} at the {n(d.minTickets)}
            -ticket minimum. The share is written into the draw account and enforced by the program.
          </>
        ) : (
          <>The house share is written into the draw account and enforced by the program.</>
        )}
      </>,
    ],
    [
      "What does it cost besides the ticket?",
      <>
        Solana rent for your entry record (returned when the account is closed) and the network fee, both shown in your wallet before you sign. Tickets are priced and
        paid in SOL; the dollar figures on this page are a live conversion and are hidden when no quote is available.
      </>,
    ],
    [
      "Who can play?",
      <>
        18+ only; you confirm it once on each device. This is a prize draw decided by chance, with a free entry route beside the paid one. On devnet it uses play money with
        no cash value. You can set a spend limit or take a break from this wallet under{" "}
        <a className="tbtn" href="#play-safe">
          Play safe
        </a>
        . If it stops being fun, <ProofLink href={GAMBLE_AWARE_URL}>BeGambleAware</ProofLink> can help.
      </>,
    ],
  ];
  return (
    <Section id="rules" title="Rules and questions" lead={<>The short version. The full terms of Draw № {d.id} are committed on-chain.</>}>
      <div className="faq">
        {qa.map(([q, a]) => (
          <details key={q} className="faq-item">
            <summary>{q}</summary>
            <div className="faq-a">{a}</div>
          </details>
        ))}
      </div>
      <p className="terms-hash">
        Terms hash <code>{fullHash ? hash : `${hash.slice(0, 12)}…${hash.slice(-8)}`}</code>{" "}
        <button type="button" className="tbtn" onClick={() => setFullHash((v) => !v)} aria-expanded={fullHash}>
          {fullHash ? "Short" : "Full"}
        </button>
      </p>
    </Section>
  );
}
