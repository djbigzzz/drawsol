"use client";

import { useEffect, useState } from "react";
import { useDrawSol } from "@/hooks/context";
import { SplitFlap } from "./SplitFlap";
import { Addr, Check, Spinner, Stat, Verify } from "./bits";
import { drawRoll, toHex, winningTicket } from "@/lib/fairness";
import { sol, ticketNo, utcLabel } from "@/lib/format";
import type { DrawView } from "@/lib/types";

export function WinnerCard({ d, compact = false }: { d: DrawView; compact?: boolean }) {
  const { findSettleTx } = useDrawSol();
  const [tx, setTx] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setTx(undefined);
    findSettleTx(d)
      .then((s) => alive && setTx(s))
      .catch(() => alive && setTx(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.address.toBase58(), d.settledAt, findSettleTx]);

  const hex = toHex(d.randomness);
  return (
    <div className={compact ? "" : "grid gap-8 lg:grid-cols-[auto_1fr]"}>
      <div>
        <div className="eyebrow mb-3">Winning ticket</div>
        <SplitFlap value={ticketNo(d.winningTicket)} size={compact ? 48 : 88} color="var(--brass)" label={`Winning ticket ${ticketNo(d.winningTicket)}`} gap={3} />
        <div className="mt-3 text-[13px] text-dim">
          out of {d.nextTicket} tickets ({ticketNo(0)}–{ticketNo(d.nextTicket - 1)})
        </div>
      </div>

      <div className={`grid gap-6 ${compact ? "mt-6" : ""}`}>
        <div className="grid gap-6 sm:grid-cols-2">
          <Stat label="Winner">
            <div className="flex flex-wrap items-center gap-2 whitespace-nowrap">
              <Addr k={d.winner} head={6} tail={6} />
              <Verify account={d.winningEntry} label="entry" />
            </div>
          </Stat>
          <Stat label="Prize paid">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono text-brass">{sol(d.prizeLamports, 2, 4)} SOL</span>
              {tx ? (
                <Verify tx={tx} label="prize tx" ok />
              ) : tx === null ? (
                <span className="text-[12px] text-dim">tx not indexed</span>
              ) : (
                <span className="text-dim">
                  <Spinner />
                </span>
              )}
            </div>
            <div className="mt-1 text-[12px] text-dim">{utcLabel(d.settledAt)}</div>
          </Stat>
        </div>
        <Stat label="ORAO randomness (64 bytes)">
          <div className="flex flex-wrap items-start gap-3">
            <code className="mono block max-w-full break-all bg-black px-3 py-2 text-[12px] leading-[18px] text-cream sm:max-w-[34em]">
              {hex}
            </code>
            <Verify account={d.drawVrfRequest} label="ORAO request" />
          </div>
        </Stat>
        <Recompute d={d} />
      </div>
    </div>
  );
}

/** Re-runs fairness.ts in the browser against the stored randomness and ORAO's own account. */
export function Recompute({ d }: { d: DrawView }) {
  const { readOrao } = useDrawSol();
  const [res, setRes] = useState<null | {
    r: bigint;
    w: number;
    match: boolean;
    orao: "match" | "mismatch" | "unavailable";
  }>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const r = drawRoll(d.randomness);
    const w = winningTicket(d.randomness, d.nextTicket);
    let orao: "match" | "mismatch" | "unavailable" = "unavailable";
    try {
      const fromOrao = await readOrao(d.drawVrfRequest);
      if (fromOrao) orao = toHex(fromOrao) === toHex(d.randomness) ? "match" : "mismatch";
    } catch {
      /* unavailable */
    }
    setRes({ r, w, match: w === d.winningTicket, orao });
    setBusy(false);
  };

  return (
    <div className="border border-line bg-black">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <span className="text-[14px]">Don&apos;t trust this page — recompute the winner in your browser.</span>
        <button className="btn small ghost" onClick={run} disabled={busy}>
          {busy && <Spinner />}
          {res ? "Run again" : "Recompute"}
        </button>
      </div>
      {res && (
        <ol className="mono space-y-1 border-t border-line px-4 py-3 text-[12px] leading-[20px] text-dim">
          <li>
            r = u64_le(sha256(randomness ‖ &quot;draw&quot;)[0..8]) = <span className="text-cream">{res.r.toString()}</span>
          </li>
          <li>
            w = r × {d.nextTicket} &gt;&gt; 64 = <span className="text-cream">{res.w}</span>
          </li>
          <li className={res.match ? "text-green" : "text-red"}>
            {res.match ? <Check className="mr-1 inline" /> : "✕ "}
            {res.match ? `matches the winning ticket stored on-chain (${ticketNo(d.winningTicket)})` : `does NOT match on-chain ${ticketNo(d.winningTicket)}`}
          </li>
          <li className={res.orao === "match" ? "text-green" : res.orao === "mismatch" ? "text-red" : ""}>
            {res.orao === "match" && (
              <>
                <Check className="mr-1 inline" />
                randomness equals ORAO&apos;s fulfilled request account
              </>
            )}
            {res.orao === "mismatch" && "✕ randomness differs from ORAO's request account"}
            {res.orao === "unavailable" && "ORAO request account not readable right now — compare it on Solscan"}
          </li>
        </ol>
      )}
    </div>
  );
}
