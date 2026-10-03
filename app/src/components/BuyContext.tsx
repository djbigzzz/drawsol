"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useActions, useDrawSol } from "@/hooks/context";
import { limitsOf, remaining, walletAllowance } from "@/lib/derive";

export type BuyMode = "buy" | "free";

/**
 * UI state only (not data): the one quantity shared by the stub and the mobile bar, which tab is open
 * ("Buy tickets" or "Free entry", shared by the stub and the bar), the pick → confirm step, and the
 * remembered 18+ acknowledgement.
 */
export interface BuyState {
  qty: number;
  setQty: (n: number) => void;
  maxQ: number;
  /** free-ticket credits this wallet holds (its Profile) */
  credits: number;
  /** "use credits": pay part of the quantity with credits (on by default when there are any) */
  useCredits: boolean;
  setUseCredits: (v: boolean) => void;
  /** of qty: tickets paid with credits, and tickets paid in SOL */
  creditPart: number;
  paidPart: number;
  mode: BuyMode;
  setMode: (m: BuyMode) => void;
  /** open the "Free entry" tab and bring it into view (the back of the ticket links here) */
  showFree: () => void;
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

export interface BuyInit {
  step?: "pick" | "confirm";
  mode?: BuyMode;
  /** fixtures only: start at the "Max" preset */
  qty?: "max";
}

export function BuyProvider({ children, init }: { children: ReactNode; init?: BuyInit }) {
  const { current: d, wallet, player, profile, now } = useDrawSol();
  const { session, lastSig } = useActions();
  const { setVisible } = useWalletModal();
  const mobile = useIsMobile();
  const barMode = useIsMobile(BAR_QUERY);
  // one ticket by default: the smallest spend is the starting point (research P0-7)
  const [qty, setQtyRaw] = useState(1);
  const [mode, setModeRaw] = useState<BuyMode>("buy");
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [adultRemembered, setAdult] = useState(false);
  const pending = useRef(false);

  const [useCredits, setUseCredits] = useState(true);
  const lim = limitsOf(wallet ? profile : null, now);
  const credits = wallet ? lim.credits : 0;
  const usable = useCredits ? credits : 0;
  // the most one purchase can hold: the per-purchase and per-wallet caps, the paid tickets left plus usable
  // credits, and (with a play limit) the paid tickets the limit still allows plus those credits
  let maxQ = d ? (wallet ? walletAllowance(d, player, usable).max : Math.min(d.maxPerTx, remaining(d))) : 0;
  if (d && lim.headroom !== null && d.ticketPrice > BigInt(0)) maxQ = Math.min(maxQ, Number(lim.headroom / d.ticketPrice) + usable);

  useEffect(() => setAdult(readAdult()), []);
  useEffect(() => {
    if (init?.step) setStep(init.step);
    if (init?.mode) setModeRaw(init.mode);
  }, [init?.step, init?.mode]);
  useEffect(() => {
    if (init?.qty === "max" && maxQ > 0) setQtyRaw(maxQ);
  }, [init?.qty, maxQ]);

  // keep the quantity inside what this wallet can actually buy
  useEffect(() => {
    if (maxQ > 0 && qty > maxQ) setQtyRaw(maxQ);
  }, [maxQ, qty]);

  const setQty = useCallback((n: number) => setQtyRaw(Math.max(1, Math.min(n, Math.max(1, maxQ)))), [maxQ]);

  const setMode = useCallback((m: BuyMode) => {
    setModeRaw(m);
    setStep("pick");
  }, []);

  const focusBuy = useCallback(() => {
    setModeRaw("buy");
    const id = window.matchMedia(BAR_QUERY).matches ? "bar-buy" : "stub-buy";
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: "nearest" });
      el.focus({ preventScroll: true });
    });
  }, []);

  const showFree = useCallback(() => {
    setModeRaw("free");
    setStep("pick");
    const bar = window.matchMedia(BAR_QUERY).matches;
    requestAnimationFrame(() => {
      // below 1024px the bar holds the claim; on desktop the stub's tab
      if (bar) document.getElementById("buy")?.scrollIntoView({ block: "start" });
      const el = document.getElementById(bar ? "bar-buy" : "tab-free");
      if (!el) return;
      if (!bar) el.scrollIntoView({ block: "nearest" });
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
  // a free entry has been claimed: the sheet (below 1024px) closes on the claimed state
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
  const creditPart = Math.min(usable, q);
  const value: BuyState = {
    qty: q,
    setQty,
    maxQ,
    credits,
    useCredits,
    setUseCredits,
    creditPart,
    paidPart: q - creditPart,
    mode,
    setMode,
    showFree,
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
