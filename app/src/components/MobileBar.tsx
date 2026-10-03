"use client";

import { useEffect, useState } from "react";
import { useActions, useDrawSol } from "@/hooks/context";
import { phaseOf } from "@/lib/derive";
import { sol } from "@/lib/format";
import { Busy, inFlight } from "./bits";
import { useBuy } from "./BuyContext";
import { useBuyButton } from "./EntryPanel";
import { plural, usd } from "./fmt";

/** True while the panel's own Enter button is on screen: the bar then stays out of the way. */
function useEnterVisible() {
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = document.getElementById("enter-btn");
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setV(e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  });
  return v;
}

/**
 * Fixed bottom bar below 1024px while selling, on the paid tab: "5 tickets · $5.00" and Enter now, which opens
 * the confirm sheet with the quantity chosen in the panel. Hidden while the panel's own button is on screen.
 */
export function MobileBar() {
  const { current: d, now, solUsd } = useDrawSol();
  const { phase } = useActions();
  const { qty, step, mode, openConfirm, connectThenConfirm, barMode } = useBuy();
  const bb = useBuyButton();
  const seen = useEnterVisible();
  if (!d || !barMode || !bb || mode !== "buy" || phaseOf(d, now) !== "selling") return null;
  const subtotal = d.ticketPrice * BigInt(qty);
  const total = usd(subtotal, solUsd) ?? `${sol(subtotal, 2, 4)} SOL`;
  const hidden = step !== "pick" || seen;
  const ap = phase.airdrop;
  return (
    <div className={`buybar ${hidden ? "off" : ""}`} role="region" aria-label="Enter the draw" aria-hidden={hidden ? true : undefined}>
      <div className="bar-sum">
        <b className="tab">
          {qty} {plural(qty, "ticket", "tickets")}
        </b>
        <span className="tab">{total}</span>
      </div>
      {bb.kind === "connect" ? (
        <button type="button" className="btn btn-primary" onClick={connectThenConfirm} tabIndex={hidden ? -1 : 0}>
          Connect wallet
        </button>
      ) : bb.kind === "buy" ? (
        <button type="button" className="btn btn-primary" onClick={openConfirm} tabIndex={hidden ? -1 : 0}>
          Enter now
        </button>
      ) : bb.kind === "low" ? (
        <a className="btn btn-primary" href="#entry" tabIndex={hidden ? -1 : 0}>
          {inFlight(ap) && <Busy />}
          Get devnet SOL
        </a>
      ) : (
        <a className="btn btn-primary" href="#entry" tabIndex={hidden ? -1 : 0}>
          {bb.kind === "cap" ? "Limit reached" : bb.kind === "excluded" ? "On a break" : bb.kind === "limit" ? "Over your limit" : "See the draw"}
        </a>
      )}
    </div>
  );
}

/** Room at the end of the page for the fixed bar (below 1024px only). */
export function BarSpacer() {
  const { current: d, now } = useDrawSol();
  const { barMode, mode } = useBuy();
  if (!d || !barMode || mode !== "buy" || phaseOf(d, now) !== "selling") return null;
  return <div className="bar-spacer" aria-hidden="true" />;
}
