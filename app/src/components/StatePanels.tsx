"use client";

import { useDrawSol } from "@/hooks/context";
import { FlapSkeleton } from "./SplitFlap";
import { OnAirLamp, Verify } from "./bits";
import { PROGRAM_ID, SOURCE_URL } from "@/lib/config";

/** Loading: the board's shape with empty tiles. No numbers. */
export function BoardSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]" aria-busy="true" aria-label="Loading the draw from devnet">
      <section className="frame">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 md:px-8 md:py-4">
          <span className="skel h-5 w-40" />
          <OnAirLamp lit={false}>Tuning in</OnAirLamp>
        </div>
        <div className="px-4 py-6 md:px-8 md:py-8">
          <div className="eyebrow mb-3">Grand prize</div>
          <span className="hidden md:inline">
            <FlapSkeleton count={4} size={128} />
          </span>
          <span className="md:hidden">
            <FlapSkeleton count={4} size={80} />
          </span>
          <div className="skel mt-4 h-4 w-72 max-w-full" />
        </div>
        <hr className="brass-rule mx-4 md:mx-8" />
        <div className="grid gap-8 px-4 py-6 md:grid-cols-2 md:px-8 md:py-8">
          <div>
            <div className="eyebrow mb-2">Sales close in</div>
            <FlapSkeleton count={6} size={44} />
          </div>
          <div>
            <div className="eyebrow mb-2">Tickets sold</div>
            <FlapSkeleton count={3} size={44} />
          </div>
        </div>
      </section>
      <aside className="frame hidden px-6 py-6 lg:block">
        <div className="skel mb-6 h-7 w-32" />
        <div className="skel mb-3 h-14 w-full" />
        <div className="skel mb-8 h-9 w-full" />
        <div className="skel h-12 w-full" />
      </aside>
    </div>
  );
}

export function RpcError() {
  const { refresh } = useDrawSol();
  return (
    <section className="frame px-6 py-12 text-center md:py-20" role="alert">
      <OnAirLamp lit={false}>Signal lost</OnAirLamp>
      <h1 className="display mt-6 text-[48px] leading-[48px] md:text-[64px] md:leading-[64px]">Can&apos;t reach devnet</h1>
      <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-[24px] text-dim">
        We couldn&apos;t read the draw from the Solana devnet RPC, so we&apos;re not showing any numbers. Nothing you hold is affected.
      </p>
      <button className="btn mt-8" onClick={refresh}>
        Retry
      </button>
    </section>
  );
}

export function NoDraw({ reason }: { reason: "no-program" | "no-config" | "no-draws" }) {
  const copy = {
    "no-program": "The DrawSol program isn't deployed on devnet yet.",
    "no-config": "The program is deployed but hasn't been initialised yet.",
    "no-draws": "The program is live, but the operator hasn't opened a draw yet.",
  }[reason];
  return (
    <section className="frame overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 md:px-8 md:py-4">
        <span className="display text-[22px] tracking-[0.06em] text-dim">Draw Nº ––––</span>
        <OnAirLamp lit={false}>Off air</OnAirLamp>
      </div>
      <div className="grid gap-10 px-4 py-10 md:grid-cols-[1fr_auto] md:items-end md:px-8 md:py-16">
        <div>
          <h1 className="display text-[56px] leading-[52px] md:text-[96px] md:leading-[88px]">
            No draw is
            <br />
            live yet
          </h1>
          <p className="mt-6 max-w-[52ch] text-[15px] leading-[24px] text-dim">
            {copy} When a draw opens, its prize will already be locked in a vault before the first ticket sells — and this board
            will show it, read straight from the chain.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px]">
            <span className="text-dim">Program</span>
            <span className="mono break-all">{PROGRAM_ID.toBase58()}</span>
            <Verify account={PROGRAM_ID} />
          </div>
        </div>
        <div className="md:w-[340px]">
          <div className="eyebrow mb-4">Every draw will guarantee</div>
          <ol className="mb-8 border-t border-line text-[14px] leading-[20px]">
            {[
              "Prize locked in a vault before sales open",
              "Draw at sell-out or a fixed deadline",
              "Randomness from ORAO VRF — nobody chooses it",
              "Anyone can run and settle the draw",
            ].map((t, i) => (
              <li key={t} className="flex gap-4 border-b border-line py-3">
                <span className="mono text-[12px] text-brass">0{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          <a className="btn ghost" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            Read the source ↗
          </a>
        </div>
      </div>
    </section>
  );
}
