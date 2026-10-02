"use client";

import Link from "next/link";
import { useDrawSol } from "@/hooks/context";
import { WalletButton } from "./WalletButton";
import { Mark } from "./print/Mark";

/** The honesty marker: always on top, on every screen, including over the sheet and the reveal. */
export function DevnetStrip() {
  return (
    <div className="strip" role="note">
      <div className="page strip-in">
        <b>
          <span className="strip-w">Devnet demo</span>
          <span className="strip-n">Devnet</span> · play money<span className="strip-q"> (not real)</span>
        </b>
        <span className="strip-more">Tickets and prizes have no cash value.</span>
      </div>
    </div>
  );
}

export function Wordmark({ away = false }: { away?: boolean }) {
  const inner = (
    <>
      <Mark />
      <span className="brand-word">DrawSol</span>
      <span className="brand-sub">Ticket office</span>
    </>
  );
  return away ? (
    <Link href="/" className="brand" aria-label="DrawSol ticket office, the current draw">
      {inner}
    </Link>
  ) : (
    <a href="#top" className="brand" aria-label="DrawSol ticket office, back to the top">
      {inner}
    </a>
  );
}

/** `away`: on a page of its own (the per-draw page), the nav leads back to the ticket office. */
export function Header({ away = false }: { away?: boolean }) {
  const { load } = useDrawSol();
  const ready = load.kind === "ready";
  return (
    <header className="page mast">
      <Wordmark away={away} />
      <div className="mast-r">
        {ready && (
          <nav className="nav" aria-label="Sections">
            {away ? (
              <>
                <Link href="/">Current draw</Link>
                <Link href="/draw/">All draws</Link>
                <Link href="/#rules">How it works</Link>
              </>
            ) : (
              <>
                <a href="#my-tickets">Your tickets</a>
                <a href="#past">Past draws</a>
                <a href="#rules">How it works</a>
              </>
            )}
          </nav>
        )}
        <WalletButton />
      </div>
    </header>
  );
}
