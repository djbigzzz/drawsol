"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useDrawSol } from "@/hooks/context";
import { short, sol } from "@/lib/format";
import { solscanAccount } from "@/lib/config";
import { limitsOf } from "@/lib/derive";

/** The wallet-adapter button, rebuilt as a plain underlined address with a stock-slip menu. */
export function WalletButton({ away = false }: { away?: boolean }) {
  const { wallet, myEntries, myState, player, profile, profileState, now } = useDrawSol();
  const { disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[next].focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!wallet) {
    return (
      <button type="button" className="btn btn-sec wconnect" onClick={() => setVisible(true)} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const addr = wallet.address.toBase58();
  const tickets = player?.tickets ?? myEntries.reduce((n, e) => n + e.count, 0);
  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button type="button" ref={btnRef} className="wbtn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" title={addr}>
        <span className="dot" aria-hidden="true" />
        <span className="addr">{short(addr)}</span>
        {wallet.balance !== null && <span className="bal">{sol(wallet.balance, 2, 3)} SOL</span>}
      </button>
      {open && (
        <div className="wmenu" role="menu" ref={menuRef}>
          <div className="wm-bal">
            <i>Devnet balance</i>
            <span className="tab">{wallet.balance !== null ? `${sol(wallet.balance, 2, 4)} SOL` : "—"}</span>
          </div>
          <Link role="menuitem" href={away ? "/#my-tickets" : "#my-tickets"} onClick={() => setOpen(false)}>
            Your tickets{myState === "ready" ? ` (${tickets})` : ""}
          </Link>
          <Link role="menuitem" href={away ? "/#limits" : "#limits"} onClick={() => setOpen(false)}>
            Play limits{profileState === "ready" && profile && limitsOf(profile, now).excluded ? " (on a break)" : ""}
          </Link>
          <a role="menuitem" href={solscanAccount(addr)} target="_blank" rel="noopener noreferrer">
            <span className="proof" style={{ textDecoration: "none" }}>
              View wallet on Solscan
            </span>
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              navigator.clipboard?.writeText(addr).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {copied ? "Copied" : "Copy address"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setVisible(true);
            }}
          >
            Change wallet
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
