"use client";

import { useMemo } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { makeProgram, type AnyProgram } from "@/lib/chain";

/** Read-only Anchor Program (no wallet). Transactions are built from it and signed by the wallet adapter. */
export function useProgram(): AnyProgram {
  const { connection } = useConnection();
  return useMemo(() => makeProgram(connection), [connection]);
}
