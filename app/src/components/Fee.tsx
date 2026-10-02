"use client";

import { useDrawSol } from "@/hooks/context";
import { Chevron } from "./bits";
import { solRound } from "./fmt";

/** ORAO fee + rent for the ticket record (+ the one-time player record), from the chain. null when unknown. */
export function useFees(): bigint | null {
  const { costs, player } = useDrawSol();
  if (costs.oraoFee === null || costs.entryRent === null) return null;
  if (!player && costs.playerRent === null) return null;
  return costs.oraoFee + costs.entryRent + (player ? BigInt(0) : costs.playerRent ?? BigInt(0));
}

/** One line: "+ ≈0.003 SOL network & randomness fee", with the breakdown on demand. */
export function FeeLine() {
  const { costs, player } = useDrawSol();
  const fees = useFees();
  if (fees === null) return <p className="fee-plain">+ network &amp; randomness fee, shown in your wallet before you sign</p>;
  return (
    <details className="fee">
      <summary>
        <span>+ ≈{solRound(fees, 3, 3)} SOL network &amp; randomness fee</span>
        <Chevron />
      </summary>
      <p>
        ORAO randomness fee {solRound(costs.oraoFee!, 4, 1)} SOL, rent for your ticket record {solRound(costs.entryRent!, 4, 1)} SOL
        {!player && costs.playerRent !== null && <>, and a one-time player record {solRound(costs.playerRent, 4, 1)} SOL on your first purchase</>}. The
        Solana network fee is a fraction of that. Your wallet shows the exact total before you sign.
      </p>
    </details>
  );
}
