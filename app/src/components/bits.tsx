"use client";

import type { ReactNode } from "react";
import type { PublicKey } from "@solana/web3.js";
import { solscanAccount, solscanTx } from "@/lib/config";
import { short } from "@/lib/format";

const b58 = (k: PublicKey | string) => (typeof k === "string" ? k : k.toBase58());

/**
 * A proof link: blue pen, never a chip. The children are always a phrase naming the thing
 * ("Check the vault on Solscan", "Payout transaction"), never a generic chip word.
 */
export function ProofLink({ account, tx, href, children, className = "" }: { account?: PublicKey | string; tx?: string; href?: string; children: ReactNode; className?: string }) {
  const url = href ?? (tx ? solscanTx(tx) : solscanAccount(b58(account ?? "")));
  const external = !href || href.startsWith("http");
  return (
    <a className={`proof ${className}`} href={url} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
      {external && <span className="sr-only"> (opens {href ? "in a new tab" : "Solscan"})</span>}
    </a>
  );
}

/** Address, short form, full value in the title. A link only where it is the proof. */
export function Addr({ k, head = 4, tail = 4, link = false, className = "" }: { k: PublicKey | string; head?: number; tail?: number; link?: boolean; className?: string }) {
  const s = b58(k);
  if (link)
    return (
      <a className={`proof nw ${className}`} href={solscanAccount(s)} target="_blank" rel="noopener noreferrer" title={s}>
        {short(s, head, tail)}
        <span className="sr-only"> (opens Solscan)</span>
      </a>
    );
  return (
    <span className={`nw tab ${className}`} title={s}>
      {short(s, head, tail)}
    </span>
  );
}

/** Section grid: narrow voice on the left (248), wide paper on the right. */
export function SectionGrid({ id, title, sub, aside, children }: { id: string; title: string; sub?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="sec" id={id} aria-labelledby={`${id}-h`}>
      <div className="sgrid">
        <div>
          <h2 className="t-sec" id={`${id}-h`}>
            {title}
          </h2>
          {sub && <p className="t-small sec-sub">{sub}</p>}
          {aside}
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

export function Check({ className = "", size = 12, stroke = 1.9 }: { className?: string; size?: number; stroke?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6.4 4.8 9 10 3" stroke="currentColor" strokeWidth={stroke} fill="none" />
    </svg>
  );
}

/** The busy mark: an 8px ink dot, blinking only while a real request is in flight. */
export function Busy() {
  return <span className="busy" aria-hidden="true" />;
}

/** No box: red-ink rules above and below. Row 1 is the lead-in and Dismiss; row 2 the human message, full width. */
export function ErrorNote({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="err" role="alert">
      <p className="err-top">
        <span className="err-lead">Didn’t go through.</span>
        {onDismiss && (
          <button type="button" className="tbtn" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </p>
      <p className="err-msg">{children}</p>
    </div>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
      <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function Minus() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10" stroke="#1B1814" strokeWidth="2.2" />
    </svg>
  );
}

export function Plus() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M8 3v10" stroke="#1B1814" strokeWidth="2.2" />
    </svg>
  );
}

/** A tx phase is "in flight" while the program checks it, the wallet signs it, or devnet confirms it. */
export const inFlight = (p: string | undefined) => p === "simulating" || p === "signing" || p === "confirming";
