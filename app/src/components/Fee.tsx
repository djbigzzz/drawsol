"use client";

import { useDrawSol } from "@/hooks/context";
import { Chevron } from "./bits";
import { solRound } from "./fmt";

/** ORAO fee + rent for the ticket record (+ the one-time player record), from the chain. null when unknown. */
export function useFees(): bigint | null {
  const { costs, player, profile, profileState, wallet, myState, current: d } = useDrawSol();
  const rolls = !!d && d.kind === "pot" && d.iwDenominator > 0;
  if ((rolls && costs.oraoFee === null) || costs.entryRent === null) return null;
  // whether the player and profile records already exist is unknown until this wallet's accounts are read
  if (wallet && (myState !== "ready" || profileState !== "ready")) return null;
  if (!player && costs.playerRent === null) return null;
  if (wallet && !profile && costs.profileRent === null) return null;
  return (
    (rolls ? costs.oraoFee ?? BigInt(0) : BigInt(0)) +
    costs.entryRent +
    (player ? BigInt(0) : costs.playerRent ?? BigInt(0)) +
    (wallet && !profile ? costs.profileRent ?? BigInt(0) : BigInt(0))
  );
}

/** One line: "+ ≈0.003 SOL network & randomness fee", with the breakdown on demand. */
export function FeeLine() {
  const { costs, player, profile, wallet, current: d } = useDrawSol();
  const fees = useFees();
  const rolls = !!d && d.kind === "pot" && d.iwDenominator > 0;
  const what = rolls ? "network & randomness fee" : "network fee and rent";
  if (fees === null) return <p className="fee-plain">+ {what}, shown in your wallet before you sign</p>;
  return (
    <details className="fee">
      <summary>
        <span>
          + ≈{solRound(fees, 3, 3)} SOL {what}
        </span>
        <Chevron />
      </summary>
      <p>
        {rolls ? <>ORAO randomness fee {solRound(costs.oraoFee!, 4, 1)} SOL, rent</> : <>Rent</>} for your ticket record {solRound(costs.entryRent!, 4, 1)} SOL
        {!player && costs.playerRent !== null && <>, a one-time player record for this draw {solRound(costs.playerRent, 4, 1)} SOL</>}
        {wallet && !profile && costs.profileRent !== null && <>, and a one-time profile for your credits and play limits {solRound(costs.profileRent, 4, 1)} SOL</>}. The
        Solana network fee is a fraction of that. Your wallet shows the exact total before you sign.
      </p>
    </details>
  );
}
