import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { humanize, type HumanError } from "./errors";

export type TxPhase = "idle" | "simulating" | "signing" | "confirming" | "done" | "failed";

export class TxError extends Error {
  human: HumanError;
  constructor(human: HumanError) {
    super(human.message);
    this.human = human;
  }
}

/**
 * Simulate → sign → confirm. Simulation runs first so program errors are decoded
 * into human copy before the wallet ever asks for a signature.
 */
export async function sendIxs(
  connection: Connection,
  wallet: Pick<WalletContextState, "sendTransaction">,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  onPhase: (p: TxPhase) => void,
  computeUnits = 400_000
): Promise<string> {
  try {
    onPhase("simulating");
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const msg = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }), ...ixs],
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg);

    const sim = await connection.simulateTransaction(tx, { sigVerify: false, commitment: "confirmed" });
    if (sim.value.err) throw new TxError(humanize(sim.value.err, sim.value.logs));

    onPhase("signing");
    const sig = await wallet.sendTransaction(tx, connection, { skipPreflight: true });

    onPhase("confirming");
    const res = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) {
      const t = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      throw new TxError(humanize(res.value.err, t?.meta?.logMessages));
    }
    onPhase("done");
    return sig;
  } catch (e) {
    onPhase("failed");
    if (e instanceof TxError) throw e;
    throw new TxError(humanize(e));
  }
}

export function randomNonce(): Uint8Array {
  const n = new Uint8Array(16);
  crypto.getRandomValues(n);
  return n;
}
