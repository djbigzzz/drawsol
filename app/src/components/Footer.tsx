"use client";

import { PROGRAM_ID, SOURCE_URL, solscanAccount } from "@/lib/config";

export function Footer() {
  const id = PROGRAM_ID.toBase58();
  return (
    <footer className="border-t border-line pb-24 pt-12 lg:pb-12">
      <div className="page grid gap-8 text-[13px] leading-[20px] md:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <div className="display text-[22px] tracking-[0.04em]">
            Draw<span className="text-brass">Sol</span>
          </div>
          <p className="max-w-[60ch] text-dim">
            Devnet demo · play money. Nothing on this page has cash value. Every number above is read from Solana devnet;
            when it can&apos;t be read, it isn&apos;t shown.
          </p>
        </div>
        <ul className="space-y-2 md:text-right">
          <li>
            <span className="text-dim">Program </span>
            <a className="mono link break-all" href={solscanAccount(id)} target="_blank" rel="noopener noreferrer">
              {id} ↗
            </a>
          </li>
          <li>
            <a className="link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              Source on GitHub ↗
            </a>
          </li>
          <li>
            <a className="link" href="#rules">
              Rules &amp; terms
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
