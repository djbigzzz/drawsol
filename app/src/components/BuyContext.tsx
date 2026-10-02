"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { remaining, walletAllowance } from "@/lib/derive";

/**
 * UI state only (not data): the one quantity shared by the stub and the mobile bar, the
 * pick → confirm step, and the remembered 18+ answer.
 */
export interface BuyState {
  qty: number;
  setQty: (n: number) => void;
  maxQ: number;
  step: "pick" | "confirm";
  openConfirm: () => void;
  closeConfirm: () => void;
  /** connect first, then continue to the confirm step */
  connectThenConfirm: () => void;
  adultRemembered: boolean;
  rememberAdult: () => void;
  forgetAdult: () => void;
  focusBuy: () => void;
  /** ≤ 760px: phone layouts (reveal list, total size) */
  mobile: boolean;
  /** ≤ 1023px: buying happens in the sticky bar and the confirm sheet; the in-flow stub is info only */
  barMode: boolean;
}

const BuyContext = createContext<BuyState | null>(null);

export function useBuy(): BuyState {
  const v = useContext(BuyContext);
  if (!v) throw new Error("useBuy outside BuyProvider");
  return v;
}

const KEY = "drawsol.adult";
const readAdult = () => {
  try {
    return window.localStorage.getItem(KEY) === "yes";
  } catch {
    return false;
  }
};

/** The sticky bar and confirm sheet take over below this width (DESIGN.md §5.5, extended to md). */
export const BAR_QUERY = "(max-width: 1023px)";

export function useIsMobile(query = "(max-width: 760px)") {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, [query]);
  return m;
}

export function BuyProvider({ children, initialStep }: { children: ReactNode; initialStep?: "pick" | "confirm" }) {
  const { current: d, wallet, player } = useDrawSol();
  const { session } = useActions();
  const { setVisible } = useWalletModal();
  const mobile = useIsMobile();
  const barMode = useIsMobile(BAR_QUERY);
  const [qty, setQtyRaw] = useState(10);
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [adultRemembered, setAdult] = useState(false);
  const pending = useRef(false);

  const maxQ = d ? (wallet ? walletAllowance(d, player).max : Math.min(d.maxPerTx, remaining(d))) : 0;

  useEffect(() => setAdult(readAdult()), []);
  useEffect(() => {
    if (initialStep) setStep(initialStep);
  }, [initialStep]);

  // keep the quantity inside what this wallet can actually buy
  useEffect(() => {
    if (maxQ > 0 && qty > maxQ) setQtyRaw(maxQ);
  }, [maxQ, qty]);

  const setQty = useCallback((n: number) => setQtyRaw(Math.max(1, Math.min(n, Math.max(1, maxQ)))), [maxQ]);

  const focusBuy = useCallback(() => {
    const id = window.matchMedia(BAR_QUERY).matches ? "bar-buy" : "stub-buy";
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: "nearest" });
      el.focus({ preventScroll: true });
    });
  }, []);

  const openConfirm = useCallback(() => setStep("confirm"), []);
  const closeConfirm = useCallback(() => {
    setStep("pick");
    focusBuy();
  }, [focusBuy]);

  const connectThenConfirm = useCallback(() => {
    pending.current = true;
    setVisible(true);
  }, [setVisible]);

  // after the wallet connects from "Connect wallet to buy", continue straight to the confirm step
  useEffect(() => {
    if (wallet && pending.current) {
      pending.current = false;
      setStep("confirm");
    }
  }, [wallet]);

  // a purchase has landed and the reveal has opened: the confirm step is done
  useEffect(() => {
    if (session && session.stage !== "failed") setStep("pick");
  }, [session]);

  const rememberAdult = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, "yes");
    } catch {
      /* private mode: it just asks every time */
    }
    setAdult(true);
  }, []);
  const forgetAdult = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setAdult(false);
  }, []);

  const value: BuyState = {
    qty: maxQ > 0 ? Math.min(qty, maxQ) : qty,
    setQty,
    maxQ,
    step,
    openConfirm,
    closeConfirm,
    connectThenConfirm,
    adultRemembered,
    rememberAdult,
    forgetAdult,
    focusBuy,
    mobile,
    barMode,
  };
  return <BuyContext.Provider value={value}>{children}</BuyContext.Provider>;
}
