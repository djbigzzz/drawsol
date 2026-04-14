"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Program, Idl } from "@coral-xyz/anchor";
import { DRAW_NUMBER } from "@/lib/constants";
import { getDrawStatePda, IDL } from "@/lib/anchor";
import { DrawState } from "@/lib/types";

export function useDrawState() {
  const { connection } = useConnection();
  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrawState = useCallback(async () => {
    try {
      const [drawStatePda] = getDrawStatePda(DRAW_NUMBER);

      // Use a read-only provider (no wallet needed for reads)
      const readProvider = { connection } as any;
      const program = new Program(IDL, readProvider) as any;

      const state = await program.account.drawState.fetch(drawStatePda);
      setDrawState(state as unknown as DrawState);
      setError(null);
    } catch (err: any) {
      // Account doesn't exist yet — this is expected before initialization
      if (err.message?.includes("Account does not exist")) {
        setDrawState(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    fetchDrawState();

    // Poll every 10 seconds
    const interval = setInterval(fetchDrawState, 10_000);
    return () => clearInterval(interval);
  }, [fetchDrawState]);

  return { drawState, loading, error, refetch: fetchDrawState };
}
