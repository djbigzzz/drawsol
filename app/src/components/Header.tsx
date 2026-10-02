"use client";

import { useDrawSol } from "@/hooks/context";
import { WalletButton } from "./WalletButton";
import { Mark } from "./print/Mark";

/** The honesty marker: always on top, on every screen, including over the sheet and the reveal. */
export function DevnetStrip() {
  return (
    <div className="strip" role="note">
      <div className="page strip-in">
        <b>Devnet demo · play money</b>
        <span className="strip-more">Tickets and prizes have no cash value.</span>
      </div>
    </div>
  );
}

export function Wordmark() {
  return (
    <a href="#top" className="brand" aria-label="DrawSol ticket office, back to the top">
      <Mark />
      <span className="brand-word">DrawSol</span>
      <span className="brand-sub">Ticket office</span>
    </a>
  );
}

export function Header() {
  const { load } = useDrawSol();
  const ready = load.kind === "ready";
  return (
    <header className="page mast">
      <Wordmark />
      <div className="mast-r">
        {ready && (
          <nav className="nav" aria-label="Sections">
            <a href="#my-tickets">Your tickets</a>
            <a href="#past">Past draws</a>
            <a href="#rules">How it works</a>
          </nav>
        )}
        <WalletButton />
      </div>
    </header>
  );
}
