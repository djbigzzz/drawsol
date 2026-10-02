"use client";

import { useEffect, useState } from "react";
import { DataRoot } from "@/components/DataRoot";
import { useDrawSol } from "@/hooks/context";
import { DevnetStrip, Header } from "@/components/Header";
import { Hero } from "@/components/DrawTicket";
import { BarSpacer, ConfirmSheet, MobileBuyBar } from "@/components/BuyPanel";
import { BuyProvider, type BuyInit } from "@/components/BuyContext";
import { MyTickets } from "@/components/MyTickets";
import { EntriesBoard } from "@/components/EntriesBoard";
import { PastDraws } from "@/components/PastDraws";
import { Winners } from "@/components/Winners";
import { StaleNote } from "@/components/StatePanels";
import { Rules } from "@/components/Rules";
import { Footer } from "@/components/Footer";
import { RevealSheet } from "@/components/RevealSheet";
import { BoardSkeleton, NoDraw, RpcError } from "@/components/StatePanels";

/**
 * Fixture builds only: `?fx=confirm` opens the confirm step, `?fx=open-free…` the "Free entry" tab,
 * `?fx=confirm-free` the free-entry sheet, `?fx=open-max` the Max preset. Folds to a no-op in production.
 */
const useFxInit: () => BuyInit | undefined =
  process.env.NEXT_PUBLIC_FIXTURES === "1"
    ? () => {
        const [s, set] = useState<BuyInit | undefined>(undefined);
        useEffect(() => {
          const fx = new URLSearchParams(window.location.search).get("fx") ?? "";
          set({
            step: fx === "confirm" || fx.startsWith("confirm-") ? "confirm" : undefined,
            mode: fx.startsWith("open-free") || fx.startsWith("confirm-free") ? "free" : undefined,
            qty: fx === "open-max" || fx === "confirm-max" ? "max" : undefined,
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
      <DevnetStrip />
      <Header />
      <Office />
      <Footer />
      <BarSpacer />
      <ConfirmSheet />
      <RevealSheet />
    </BuyProvider>
  );
}

function Office() {
  const { load, current } = useDrawSol();
  return (
    <main id="top" className="page main">
      {load.kind === "loading" && <BoardSkeleton />}
      {load.kind === "error" && <RpcError />}
      {load.kind === "nodraw" && <NoDraw reason={load.reason} />}
      {load.kind === "ready" && current && (
        <>
          <StaleNote />
          <Hero />
          {/* fixed below 1024px: placed here so its Buy button follows the hero in tab and reading order */}
          <MobileBuyBar />
          <MyTickets />
          <EntriesBoard />
          <Winners />
          <PastDraws />
          <Rules />
        </>
      )}
    </main>
  );
}
