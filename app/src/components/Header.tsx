"use client";

import Link from "next/link";
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

/** The DrawSol mark: a ticket with a notch and one accent bar. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect width="28" height="28" rx="7" fill="#0B1220" />
      <path d="M7 8h14a1.5 1.5 0 0 1 1.5 1.5v2.6a2 2 0 0 0 0 3.8v2.6A1.5 1.5 0 0 1 21 20H7a1.5 1.5 0 0 1-1.5-1.5v-2.6a2 2 0 0 0 0-3.8V9.5A1.5 1.5 0 0 1 7 8z" fill="#fff" />
      <path d="M10 14h8" stroke="#15803D" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ away = false }: { away?: boolean }) {
  const inner = (
    <>
      <Mark />
      <span className="brand-word">DrawSol</span>
    </>
  );
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
