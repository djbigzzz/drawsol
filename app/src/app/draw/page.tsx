"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DataRoot } from "@/components/DataRoot";
import { DevnetBar, Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DrawRecord } from "@/components/DrawRecord";

/**
 * /draw/?n=N: the permanent page of Draw № N. One static route (output: export), the number is read on the
 * client, so every draw that will ever exist has a page that never 404s; a number with no draw says so.
 */
export default function DrawPage() {
  return (
    <DataRoot>
      <DevnetBar />
      <Header away />
      <main id="top" className="page main record-page">
        <Suspense fallback={null}>
          <FromQuery />
        </Suspense>
      </main>
      <Footer away />
    </DataRoot>
  );
}

function FromQuery() {
  const q = useSearchParams();
  return <DrawRecord raw={q.get("n")} />;
}
