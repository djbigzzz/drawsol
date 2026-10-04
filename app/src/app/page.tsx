"use client";

import { useEffect, useState } from "react";
import { DataRoot } from "@/components/DataRoot";
import { useDrawSol } from "@/hooks/context";
import { DevnetBar, Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { BuyProvider, type BuyInit } from "@/components/BuyContext";
import { ConfirmSheet } from "@/components/Sheet";
import { RevealSheet } from "@/components/RevealSheet";
import { Prizes } from "@/components/Prizes";
import { BarSpacer, MobileBar } from "@/components/MobileBar";
import { MyTickets } from "@/components/MyTickets";
import { Winners } from "@/components/Winners";
import { HowItWorks, Rules, TrustStrip } from "@/components/Sections";
import { StatsStrip } from "@/components/StatsStrip";
import { PlaySafe } from "@/components/PlaySafe";
import { Footer } from "@/components/Footer";
import { HeroSkeleton, NoDraw, RpcError, StaleNote } from "@/components/StatePanels";

/**
 * Fixture builds only: `?fx=confirm` opens the confirm sheet, `?fx=free…` the "Free entry" tab, `?fx=open-max`
 * the Max preset, `&qty=5` a quantity. Folds to a no-op in production.
 */
const useFxInit: () => BuyInit | undefined =
  process.env.NEXT_PUBLIC_FIXTURES === "1"
    ? () => {
        const [s, set] = useState<BuyInit | undefined>(undefined);
        useEffect(() => {
          const q = new URLSearchParams(window.location.search);
          const fx = q.get("fx") ?? "";
          const qty = q.get("qty");
          set({
            step: fx === "confirm" || fx.startsWith("confirm-") ? "confirm" : undefined,
            mode: fx === "free" || fx.startsWith("free-") ? "free" : undefined,
            qty: fx === "open-max" || fx === "confirm-max" ? "max" : qty && /^\d+$/.test(qty) ? Number(qty) : fx === "open" || fx === "confirm" || fx === "success" ? 5 : undefined,
          });
        }, []);
        return s;
      }
    : () => undefined;

export default function Home() {
  return (
    <DataRoot>
      <Shell />
    </DataRoot>
  );
}

function Shell() {
  const init = useFxInit();
  return (
    <BuyProvider init={init}>
      <DevnetBar />
      <Header />
      <Page />
      <Footer />
      <BarSpacer />
      <MobileBar />
      <ConfirmSheet />
      <RevealSheet />
    </BuyProvider>
  );
}

function Page() {
  const { load, current } = useDrawSol();
  const ready = load.kind === "ready" && !!current;
  return (
    <main id="top">
      <div className="hero-band">
        <div className="page">
          {load.kind === "loading" && <HeroSkeleton />}
          {load.kind === "error" && <RpcError />}
          {load.kind === "nodraw" && <NoDraw reason={load.reason} />}
          {load.kind === "ready" && !current && <NoDraw reason="no-draws" />}
          {ready && (
            <>
              <StaleNote />
              <Hero />
            </>
          )}
        </div>
      </div>
      {ready && (
        <>
          <StatsStrip d={current} />
          <div className="page main">
            <TrustStrip />
            <Prizes d={current} />
            <HowItWorks />
            <MyTickets />
            <Winners />
            <Rules />
            <PlaySafe />
          </div>
        </>
      )}
    </main>
  );
}
