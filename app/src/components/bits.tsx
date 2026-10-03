"use client";

import type { ReactNode } from "react";
import type { PublicKey } from "@solana/web3.js";
import { solscanAccount, solscanTx } from "@/lib/config";
import { short } from "@/lib/format";

const b58 = (k: PublicKey | string) => (typeof k === "string" ? k : k.toBase58());

/** A proof link: underlined, with an outward arrow. The children name the thing ("Vault on Solscan"). */
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

/** A page section: a heading row (title, optional lead) and its content, on the 8px rhythm. */
export function Section({ id, title, lead, children, className = "", level = 2 }: { id: string; title: string; lead?: ReactNode; children: ReactNode; className?: string; level?: 1 | 2 }) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <section className={`sec ${className}`} id={id} aria-labelledby={`${id}-h`}>
      <div className="sec-head">
        <H className="t-h2" id={`${id}-h`}>
          {title}
        </H>
        {lead && <p className="sec-lead">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

export function Check({ className = "", size = 14, stroke = 2.2 }: { className?: string; size?: number; stroke?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2.5 7.5 5.6 10.5 11.5 4" stroke="currentColor" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The busy mark: a spinner ring, turning only while a real request is in flight. */
export function Busy() {
  return <span className="busy" aria-hidden="true" />;
}

/** An error: a soft red panel with the lead-in, the human message and Dismiss. */
export function ErrorNote({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="err" role="alert">
      <p className="err-top">
        <span className="err-lead">Didn’t go through</span>
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

export function Minus() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Plus() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3 8h10M8 3v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** A status pill: "OPEN", "SOLD OUT", "DRAWING", "SETTLED", "CANCELLED". */
export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "accent" | "warn" | "dark"; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** A tx phase is "in flight" while the program checks it, the wallet signs it, or devnet confirms it. */
export const inFlight = (p: string | undefined) => p === "simulating" || p === "signing" || p === "confirming";

/** The button label while a transaction is in flight, else the given one. */
export const phaseLabel = (p: string | undefined, idle: string) =>
  p === "simulating" ? "Checking with the program…" : p === "signing" ? "Approve in your wallet…" : p === "confirming" ? "Confirming on devnet…" : idle;
