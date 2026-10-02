"use client";

import type { ComponentType, ReactNode } from "react";
import { LiveProvider } from "@/hooks/LiveProvider";
import { useDrawSol } from "@/hooks/context";
import { Header } from "@/components/Header";
import { Board } from "@/components/Board";
import { BuyPanel, MobileBuyBar } from "@/components/BuyPanel";
import { MyTickets } from "@/components/MyTickets";
import { EntriesBoard } from "@/components/EntriesBoard";
import { PastDraws } from "@/components/PastDraws";
import { Rules } from "@/components/Rules";
import { Footer } from "@/components/Footer";
import { RevealSheet } from "@/components/RevealSheet";
import { BoardSkeleton, NoDraw, RpcError } from "@/components/StatePanels";

// Build-time gate: with NEXT_PUBLIC_FIXTURES unset this is `false ? … : null`,
// the bundler drops the branch and the fixtures module is never included.
// (The env var must be written out literally here so DefinePlugin can fold it.)
const DataRoot: ComponentType<{ children: ReactNode }> =
  process.env.NEXT_PUBLIC_FIXTURES === "1"
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@/fixtures/FixtureProvider").FixtureProvider
  : LiveProvider;

export default function Home() {
  return (
    <DataRoot>
      <Header />
      <Studio />
      <Footer />
      <MobileBuyBar />
      <RevealSheet />
    </DataRoot>
  );
}

function Studio() {
  const { load, current } = useDrawSol();

  return (
    <main id="top" className="page pb-16 pt-6 md:pt-10">
      {load.kind === "loading" && <BoardSkeleton />}
      {load.kind === "error" && <RpcError />}
      {load.kind === "nodraw" && <NoDraw reason={load.reason} />}
      {load.kind === "ready" && current && (
        <>
          <div className="grid gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 lg:col-start-1">
              <Board />
            </div>
            <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1">
              <div className="lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:max-h-[calc(100vh-var(--header-h)-48px)] lg:overflow-y-auto">
                <BuyPanel />
              </div>
            </div>
            <div className="min-w-0 lg:col-start-1">
              <MyTickets />
            </div>
            <div className="min-w-0 lg:col-start-1">
              <EntriesBoard />
            </div>
          </div>
          <div className="mt-16 space-y-16 md:mt-24 md:space-y-24">
            <PastDraws />
            <Rules />
          </div>
        </>
      )}
    </main>
  );
}
