"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DataRoot } from "@/components/DataRoot";
import { DevnetBar, Wordmark } from "@/components/Header";
import { LiveShow } from "@/components/LiveShow";
import { WalletButton } from "@/components/WalletButton";

/**
 * /live/?n=N: a draw as it happens, for streaming with no presenter (OBS, a 1920×1080 browser source). Without
 * a number it follows the featured draw. One static route; the number is read on the client.
 */
export default function LivePage() {
  return (
    <DataRoot>
      <DevnetBar />
      <header className="page mast">
        <Wordmark away />
        <div className="mast-r">
          <nav className="nav" aria-label="Sections">
            <Link href="/">The draw</Link>
            <Link href="/draw/">Every draw</Link>
          </nav>
          <WalletButton away />
        </div>
      </header>
      <main id="top" className="page main live-page">
        <Suspense fallback={null}>
          <FromQuery />
        </Suspense>
      </main>
    </DataRoot>
  );
}

function FromQuery() {
  const q = useSearchParams();
  return <LiveShow raw={q.get("n")} />;
}
