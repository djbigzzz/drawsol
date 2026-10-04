"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { limitsOf, remaining, walletAllowance } from "@/lib/derive";

export type BuyMode = "buy" | "free";
export type Step = "pick" | "confirm";

/**
 * UI state only (not data): the one quantity shared by the entry panel and the mobile bar, which tab is open
 * ("Paid tickets" or "Free entry"), the pick → confirm sheet (the reveal sheet takes over after paying), and
 * the remembered 18+ acknowledgement.
 */
export interface BuyState {
  qty: number;
  setQty: (n: number) => void;
  /** the most one purchase can hold right now (0 while nothing can be bought) */
  maxQ: number;
  /** of qty: tickets paid with free-ticket credits, and tickets paid in SOL (credits are never used here) */
  creditPart: number;
  paidPart: number;
  mode: BuyMode;
  setMode: (m: BuyMode) => void;
  /** open the "Free entry" tab and bring the panel into view */
  showFree: () => void;
  step: Step;
  openConfirm: () => void;
  /** close the sheet (back to the panel) */
  closeSheet: () => void;
  /** connect first, then continue to the confirm step */
  connectThenConfirm: () => void;
  adultRemembered: boolean;
  rememberAdult: () => void;
  forgetAdult: () => void;
  /** ≤ 760px: phone layouts */
  mobile: boolean;
  /** ≤ 1023px: the sticky bottom bar shows */
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

/** The sticky bar shows below this width. */
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

export interface BuyInit {
  step?: Step;
  mode?: BuyMode;
  qty?: number | "max";
}

export function BuyProvider({ children, init }: { children: ReactNode; init?: BuyInit }) {
  const { current: d, wallet, player, profile, now } = useDrawSol();
  const { lastSig, session } = useActions();
  const { setVisible } = useWalletModal();
  const mobile = useIsMobile();
  const barMode = useIsMobile(BAR_QUERY);
  // one ticket by default: the smallest spend is the starting point (research P0-7)
  const [qty, setQtyRaw] = useState(1);
  const [mode, setModeRaw] = useState<BuyMode>("buy");
  const [step, setStep] = useState<Step>("pick");
  const [adultRemembered, setAdult] = useState(false);
  const pending = useRef(false);

  const lim = limitsOf(wallet ? profile : null, now);
  // the most one purchase can hold: the per-purchase and per-wallet caps, the paid tickets left, and (with a
  // play limit) the paid tickets the limit still allows. Free-ticket credits are not spent from this page.
  let maxQ = d ? (wallet ? walletAllowance(d, player).max : Math.min(d.maxPerTx, remaining(d))) : 0;
  if (d && lim.headroom !== null && d.ticketPrice > BigInt(0)) maxQ = Math.min(maxQ, Number(lim.headroom / d.ticketPrice));

  useEffect(() => setAdult(readAdult()), []);
  useEffect(() => {
    if (init?.step) setStep(init.step);
    if (init?.mode) setModeRaw(init.mode);
  }, [init?.step, init?.mode]);
  useEffect(() => {
    if (init?.qty === "max" && maxQ > 0) setQtyRaw(maxQ);
    else if (typeof init?.qty === "number") setQtyRaw(init.qty);
  }, [init?.qty, maxQ]);

  // keep the quantity inside what this wallet can actually buy
  useEffect(() => {
    if (maxQ > 0 && qty > maxQ) setQtyRaw(maxQ);
  }, [maxQ, qty]);

  const setQty = useCallback((n: number) => setQtyRaw(Math.max(1, Math.min(Math.round(n) || 1, Math.max(1, maxQ)))), [maxQ]);

  const setMode = useCallback((m: BuyMode) => {
    setModeRaw(m);
    setStep("pick");
  }, []);

  const showFree = useCallback(() => {
    setModeRaw("free");
    setStep("pick");
    requestAnimationFrame(() => {
      document.getElementById("entry")?.scrollIntoView({ block: "start" });
      document.getElementById("tab-free")?.focus({ preventScroll: true });
    });
  }, []);

  const openConfirm = useCallback(() => setStep("confirm"), []);
  const closeSheet = useCallback(() => {
    setStep("pick");
    requestAnimationFrame(() => document.getElementById("enter-btn")?.focus({ preventScroll: true }));
  }, []);

  const connectThenConfirm = useCallback(() => {
    pending.current = true;
    setVisible(true);
  }, [setVisible]);

  // after the wallet connects from "Connect wallet to enter", continue straight to the confirm step
  useEffect(() => {
    if (wallet && pending.current) {
      pending.current = false;
      setStep("confirm");
    }
  }, [wallet]);

  // a reveal session has opened (every purchase and free entry rolls): the confirm sheet gives way to the reveal
  useEffect(() => {
    if (session) setStep("pick");
  }, [session]);
  useEffect(() => {
    if (lastSig.free) setStep("pick");
  }, [lastSig.free]);

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

  const q = maxQ > 0 ? Math.min(qty, maxQ) : qty;
  const value: BuyState = {
    qty: q,
    setQty,
    maxQ,
    creditPart: 0,
    paidPart: q,
    mode,
    setMode,
    showFree,
    step,
    openConfirm,
    closeSheet,
    connectThenConfirm,
    adultRemembered,
    rememberAdult,
    forgetAdult,
    mobile,
    barMode,
  };
  return <BuyContext.Provider value={value}>{children}</BuyContext.Provider>;
}
