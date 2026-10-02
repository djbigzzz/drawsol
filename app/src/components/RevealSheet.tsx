"use client";

import { useEffect, useRef, useState } from "react";
import { useActions, useDrawSol, type RevealSession } from "@/hooks/context";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { RevealStub } from "./TicketStub";
import { Check, ErrorNote, Spinner, Verify } from "./bits";
import { tierAmount } from "@/lib/derive";
import { sol, ticketRange } from "@/lib/format";

const STEP_MS = 650;

type StepState = "done" | "active" | "todo" | "failed";

function stepStates(s: RevealSession): StepState[] {
  const order = ["confirming", "vrf", "revealing", "revealed"] as const;
  if (s.stage === "failed") {
    // fail on the first step that has no proof yet
    const at = !s.buyTx && !s.vrfRequest ? 0 : s.vrfMs === undefined ? 1 : !s.revealTx ? 2 : 3;
    return order.map((_, i) => (i < at ? "done" : i === at ? "failed" : "todo"));
  }
  const idx = order.indexOf(s.stage as (typeof order)[number]);
  return order.map((_, i) => (i < idx ? "done" : i === idx ? (s.stage === "revealed" ? "done" : "active") : "todo"));
}

export function RevealSheet() {
  const { session: s, closeSession, reveal } = useActions();
  const { myEntries, current } = useDrawSol();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  const entryKey = s?.entry.toBase58();
  useEffect(() => {
    setShown(s?.initialShown ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey]);

  // turn the stubs one by one, only once the tiers come back from the chain
  const hasTiers = !!s?.tiers;
  const paused = s?.initialShown !== undefined;
  useEffect(() => {
    if (!s || !hasTiers || paused) return;
    if (reduced) {
      setShown(s.count);
      return;
    }
    if (shown >= s.count) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 250 : STEP_MS);
    return () => clearTimeout(t);
  }, [s, hasTiers, shown, reduced, paused]);

  useEffect(() => {
    if (!s) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSession();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey]);

  if (!s) return null;
  const states = stepStates(s);
  const allShown = hasTiers && shown >= s.count;
  const wins = s.tiers?.filter((t) => t > 0).length ?? 0;
  const retryEntry = myEntries.find((e) => e.address.equals(s.entry));

  const steps = [
    {
      title: "Purchase confirmed",
      body: s.buyTx ? <Verify tx={s.buyTx} label="tx" /> : s.stage === "confirming" ? "Waiting for devnet…" : "Bought earlier",
    },
    {
      title: "Randomness from ORAO VRF",
      body: (
        <span className="flex flex-wrap items-center gap-2">
          {s.vrfRequest && <Verify account={s.vrfRequest} label="request" />}
          {s.vrfMs !== undefined ? <span>landed in {(s.vrfMs / 1000).toFixed(1)} s</span> : s.stage === "vrf" ? <span>polling…</span> : null}
        </span>
      ),
    },
    {
      title: "Reveal transaction",
      body: s.revealTx ? (
        <Verify tx={s.revealTx} label="tx" />
      ) : s.stage === "revealing" ? (
        "Approve in your wallet"
      ) : s.stage === "revealed" ? (
        "Revealed on-chain"
      ) : (
        "Sent automatically"
      ),
    },
    {
      title: "Paid out",
      body: s.instantPaid !== undefined && allShown ? `${sol(s.instantPaid, 2, 4)} SOL` : "In the same tx",
    },
  ];

  return (
    <>
      <div className="scrim" onClick={closeSession} aria-hidden />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="reveal-title">
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-4 md:px-8 md:py-6">
          <div>
            <div className="eyebrow mb-1">
              {current ? `Draw Nº ${current.id.toString().padStart(4, "0")} · ` : ""}
              {s.count} {s.count === 1 ? "ticket" : "tickets"}
            </div>
            <h2 id="reveal-title" className="display text-[32px] leading-[32px] md:text-[40px] md:leading-[40px]">
              <span className="mono text-[24px] font-medium normal-case tracking-normal md:text-[28px]">{ticketRange(s.firstTicket, s.count)}</span>
            </h2>
          </div>
          <button ref={closeRef} onClick={closeSession} className="h-10 w-10 flex-none border border-line text-[20px] text-dim hover:text-cream" aria-label="Close">
            ×
          </button>
        </div>

        {/* the four steps */}
        <ol className="grid grid-cols-2 border-b border-line md:grid-cols-4">
          {steps.map((st, i) => {
            const state = states[i];
            return (
              <li key={st.title} className={`px-4 py-4 md:px-6 ${i % 2 === 1 ? "border-l" : ""} ${i >= 2 ? "border-t md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""} border-line`}>
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`mono flex h-5 w-5 items-center justify-center text-[11px] ${
                      state === "done" ? "bg-green text-black" : state === "active" ? "border border-cream" : state === "failed" ? "bg-red text-black" : "border border-line text-dim"
                    }`}
                  >
                    {state === "done" ? <Check /> : state === "active" ? <Spinner /> : i + 1}
                  </span>
                  <span className={`text-[13px] font-medium leading-[18px] ${state === "todo" ? "text-dim" : ""}`}>{st.title}</span>
                </div>
                <div className="text-[12px] leading-[18px] text-dim">{st.body}</div>
              </li>
            );
          })}
        </ol>

        <div className="px-4 py-6 md:px-8">
          {s.stage === "failed" && s.error && (
            <div className="mb-6">
              <ErrorNote>
                {s.error.message}
                {retryEntry && !retryEntry.revealed && !retryEntry.isFree && (
                  <button className="link ml-2" onClick={() => reveal(retryEntry)}>
                    Retry reveal
                  </button>
                )}
              </ErrorNote>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: s.count }, (_, i) => {
              const tier = s.tiers?.[i];
              return (
                <RevealStub
                  key={i}
                  ticket={s.firstTicket + i}
                  tier={tier}
                  amount={tier ? tierAmount(s, tier) : BigInt(0)}
                  shown={i < shown}
                  notch="var(--board)"
                />
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[14px] leading-[22px]">
              {allShown ? (
                wins > 0 ? (
                  <>
                    <div className="display text-[32px] leading-[32px] text-brass">You won {sol(s.instantPaid ?? BigInt(0), 2, 4)} SOL</div>
                    <div className="mt-1 text-dim">
                      {wins} winning {wins === 1 ? "ticket" : "tickets"}, paid to your wallet in the reveal transaction.{" "}
                      {s.revealTx && <Verify tx={s.revealTx} label="payout tx" ok />}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="display text-[28px] leading-[28px]">No instant wins this time</div>
                    <div className="mt-1 text-dim">All {s.count} tickets are still in the grand draw.</div>
                  </>
                )
              ) : hasTiers ? (
                <span className="text-dim">
                  Results are on-chain — turning {shown} of {s.count}.
                </span>
              ) : (
                <span className="text-dim">Results are decided by ORAO&apos;s randomness, not by this page. They appear once the reveal transaction lands.</span>
              )}
            </div>
            <div className="flex gap-3">
              {hasTiers && !allShown && (
                <button className="btn ghost" onClick={() => setShown(s.count)}>
                  Reveal all
                </button>
              )}
              {(allShown || s.stage === "failed") && (
                <button className="btn" onClick={closeSession}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
