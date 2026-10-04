"use client";

import Link from "next/link";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";

/**
 * The honesty marker (research P0-8): on every screen, on top of everything. One wording everywhere; phones
 * drop only the bracket, so "play money" reads the same on every width.
 */
export function DevnetBar() {
  return (
    <div className="devbar" role="note">
      <div className="page devbar-in">
        <span className="devbar-dot" aria-hidden="true" />
        <b>Devnet demo · play money</b>
        <span className="devbar-long"> (devnet tokens are not real)</span>
      </div>
    </div>
  );
}

/** The logo (components/Logo.tsx) as the home link. */
export function Wordmark({ away = false }: { away?: boolean }) {
  const inner = <Logo size={30} />;
  return away ? (
    <Link href="/" className="brand" aria-label="DrawSol, home">
      {inner}
    </Link>
  ) : (
    <a href="#top" className="brand" aria-label="DrawSol, back to the top">
      {inner}
    </a>
  );
}

/** `away`: on a page of its own (/draw, /live), the links lead back home. */
export function Header({ away = false }: { away?: boolean }) {
  return (
    <header className="page mast">
      <Wordmark away={away} />
      <div className="mast-r">
        <nav className="nav" aria-label="Sections">
          {away ? (
            <>
              <Link href="/">The draw</Link>
              <Link href="/#winners">Winners</Link>
              <Link href="/#how">How it works</Link>
            </>
          ) : (
            <>
              <a href="#winners">Winners</a>
              <a href="#how">How it works</a>
            </>
          )}
        </nav>
        <WalletButton away={away} />
      </div>
    </header>
  );
}
