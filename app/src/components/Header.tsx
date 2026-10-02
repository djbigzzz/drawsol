"use client";

import { WalletButton } from "./WalletButton";
import { useDrawSol } from "@/hooks/context";

export function Header() {
  const { load } = useDrawSol();
  const ready = load.kind === "ready";
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-black">
      <div className="page flex h-[var(--header-h)] items-center gap-4">
        <a href="#top" className="flex items-baseline gap-2" aria-label="DrawSol home">
          <span className="display text-[26px] tracking-[0.04em] md:text-[30px]">
            Draw<span className="text-brass">Sol</span>
          </span>
        </a>
        <span
          className="mono hidden h-6 items-center gap-2 border border-line px-2 text-[11px] tracking-[0.12em] text-cream sm:inline-flex"
          title="Everything on this page runs on Solana devnet with test SOL."
        >
          DEVNET <span className="text-dim">· PLAY MONEY</span>
        </span>
        <nav className={`ml-auto hidden items-center gap-6 text-[14px] text-dim ${ready ? "lg:flex" : ""}`} aria-label="Sections">
          <a className="hover:text-cream" href="#my-tickets">My tickets</a>
          <a className="hover:text-cream" href="#entries">Entries</a>
          <a className="hover:text-cream" href="#past">Past draws</a>
          <a className="hover:text-cream" href="#rules">Rules</a>
        </nav>
        {ready ? (
          <a className="ml-auto text-[14px] text-dim hover:text-cream lg:hidden" href="#my-tickets">
            My tickets
          </a>
        ) : (
          <span className="ml-auto" />
        )}
        <WalletButton />
      </div>
      {/* persistent marker on small screens */}
      <div className="mono flex h-6 items-center justify-center border-t border-line text-[10px] tracking-[0.16em] text-dim sm:hidden">
        DEVNET DEMO · PLAY MONEY
      </div>
    </header>
  );
}
