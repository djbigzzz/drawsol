"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useDrawSol } from "@/hooks/context";
import { short, sol } from "@/lib/format";
import { solscanAccount } from "@/lib/config";

/** Wallet adapter button, rebuilt in the studio style. */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const { wallet } = useDrawSol();
  const { disconnect, connecting, wallet: adapter } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!wallet) {
    return (
      <button className={`btn ${compact ? "small" : "small"} ghost`} onClick={() => setVisible(true)} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const addr = wallet.address.toBase58();
  return (
    <div className="relative" ref={ref}>
      <button
        className="flex h-9 items-center gap-3 border border-line px-3 hover:border-cream"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {adapter?.adapter.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={adapter.adapter.icon} alt="" width={16} height={16} />
        )}
        <span className="mono text-[13px]">{short(addr)}</span>
        {!compact && wallet.balance !== null && (
          <span className="mono hidden text-[13px] text-dim md:inline">{sol(wallet.balance, 2, 3)} SOL</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-56 border border-line bg-board py-2 text-[14px]">
          <div className="px-4 pb-2 pt-1">
            <div className="eyebrow">Devnet balance</div>
            <div className="mono">{wallet.balance !== null ? `${sol(wallet.balance, 2, 4)} SOL` : "—"}</div>
          </div>
          <a className="block px-4 py-2 hover:bg-panel" href={solscanAccount(addr)} target="_blank" rel="noopener noreferrer">
            View on Solscan ↗
          </a>
          <button
            className="block w-full px-4 py-2 text-left hover:bg-panel"
            onClick={() => navigator.clipboard?.writeText(addr).then(() => setOpen(false))}
          >
            Copy address
          </button>
          <button className="block w-full px-4 py-2 text-left hover:bg-panel" onClick={() => { setOpen(false); setVisible(true); }}>
            Change wallet
          </button>
          <button className="block w-full px-4 py-2 text-left text-dim hover:bg-panel hover:text-cream" onClick={() => { setOpen(false); disconnect(); }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
