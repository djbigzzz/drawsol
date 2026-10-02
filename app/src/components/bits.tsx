"use client";

import type { ReactNode } from "react";
import type { PublicKey } from "@solana/web3.js";
import { solscanAccount, solscanTx } from "@/lib/config";
import { short } from "@/lib/format";

/** "verify ↗" — every on-chain fact gets one, pointing at Solscan (devnet). */
export function Verify({
  account,
  tx,
  label = "verify",
  ok,
}: {
  account?: PublicKey | string;
  tx?: string;
  label?: string;
  ok?: boolean;
}) {
  const href = tx ? solscanTx(tx) : solscanAccount(typeof account === "string" ? account : account!.toBase58());
  return (
    <a className={`verify${ok ? " ok" : ""}`} href={href} target="_blank" rel="noopener noreferrer">
      {label} <span aria-hidden>↗</span>
      <span className="sr-only"> (opens Solscan)</span>
    </a>
  );
}

export function Addr({ k, head = 4, tail = 4 }: { k: PublicKey | string; head?: number; tail?: number }) {
  const s = typeof k === "string" ? k : k.toBase58();
  return (
    <a className="mono link" href={solscanAccount(s)} target="_blank" rel="noopener noreferrer" title={s}>
      {short(s, head, tail)}
    </a>
  );
}

export function OnAirLamp({ lit, children }: { lit: boolean; children: ReactNode }) {
  return (
    <span className={`lamp${lit ? " lit" : ""}`} role="status">
      <span className="bulb" aria-hidden />
      {children}
    </span>
  );
}

export function SectionHead({ idx, title, aside, id }: { idx: string; title: string; aside?: ReactNode; id?: string }) {
  return (
    <div className="sect-head" id={id}>
      <span className="idx">{idx}</span>
      <h2>{title}</h2>
      <span className="rule" aria-hidden />
      {aside && <span className="aside hidden sm:inline">{aside}</span>}
    </div>
  );
}

/** Label/value pair used across the board. */
export function Stat({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="eyebrow mb-2">{label}</div>
      {children}
    </div>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path d="M2 6.5 4.8 9 10 3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="square" />
    </svg>
  );
}

export function Spinner() {
  // a slow, small rotating tick — only rendered while a real request is in flight
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin" aria-hidden>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" fill="none" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

export function ErrorNote({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-3 border border-red/60 bg-black px-4 py-3 text-[14px] leading-[20px]" role="alert">
      <span className="mt-[6px] h-2 w-2 flex-none rounded-full bg-red" aria-hidden />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-dim hover:text-cream" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
