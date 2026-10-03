"use client";

import Link from "next/link";
import { useDrawSol } from "@/hooks/context";
import { WalletButton } from "./WalletButton";
import { Mark } from "./print/Mark";

/**
 * The honesty marker (research P0-8): always on top, on every screen, including over the sheet and the
 * reveal. One wording everywhere: "Devnet demo · play money (devnet tokens are not real)"; phones drop only
 * the word "devnet tokens are", so "play money" and "not real" read the same on every screen and width.
 */
export function DevnetStrip() {
  return (
    <div className="strip" role="note">
      <div className="page strip-in">
        <b>
          Devnet demo · play money (<span className="strip-long">devnet tokens are </span>not real)
        </b>
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
                <Link href="/">Draws on sale</Link>
                <Link href="/draw/">All draws</Link>
                <Link href="/live/">Live draw</Link>
                <Link href="/#rules">How it works</Link>
              </>
            ) : (
              <>
                <a href="#my-tickets">Your tickets</a>
                <a href="#past">Past draws</a>
                <a href="#limits">Play limits</a>
                <Link href="/live/">Live draw</Link>
                <a href="#rules">How it works</a>
              </>
            )}
          </nav>
        )}
        <WalletButton away={away} />
      </div>
    </header>
  );
}
