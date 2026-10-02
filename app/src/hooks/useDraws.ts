"use client";

import { useCallback, useEffect, useState } from "react";
import { PROGRAM_ID } from "@/lib/config";
import { fetchAllDraws, fetchConfig, type AnyProgram } from "@/lib/chain";
import type { ConfigView, DrawView, LoadState } from "@/lib/types";

/** Newest Open draw, else the newest draw of any status. */
export function pickCurrent(draws: DrawView[]): DrawView | null {
  return draws.find((d) => d.status === "open") ?? draws[0] ?? null;
}

/** Config + every Draw account. */
export function useDraws(program: AnyProgram) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [draws, setDraws] = useState<DrawView[]>([]);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const conn = program.provider.connection;
        const programInfo = await conn.getAccountInfo(PROGRAM_ID);
        if (!alive) return;
        if (!programInfo) {
          setLoad({ kind: "nodraw", reason: "no-program" });
          return;
        }
        const [cfg, all] = await Promise.all([fetchConfig(program), fetchAllDraws(program)]);
        if (!alive) return;
        setConfig(cfg);
        setDraws(all);
        setLoad(!cfg ? { kind: "nodraw", reason: "no-config" } : all.length === 0 ? { kind: "nodraw", reason: "no-draws" } : { kind: "ready" });
      } catch (e) {
        if (!alive) return;
        // §4.1: a failed read shows no numbers at all
        setLoad({ kind: "error", message: (e as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [program, nonce]);

  return { load, config, draws, setDraws, refresh };
}
