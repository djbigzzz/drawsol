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
    // a retry from the error state shows "reading" again rather than the old error
    setLoad((l) => (l.kind === "error" ? { kind: "loading" } : l));
    (async () => {
      try {
        const conn = program.provider.connection;
        // a rate-limited or flaky RPC often answers the second or third time: every read here (the program
        // account, the config and the draws) is tried twice more (2 s, then 4 s) before the error state, which
        // shows no numbers at all
        let got: [Awaited<ReturnType<typeof fetchConfig>>, Awaited<ReturnType<typeof fetchAllDraws>>] | null = null;
        for (let i = 0; ; i++) {
          try {
            const programInfo = await conn.getAccountInfo(PROGRAM_ID);
            if (!alive) return;
            if (!programInfo) {
              setLoad({ kind: "nodraw", reason: "no-program" });
              return;
            }
            got = await Promise.all([fetchConfig(program), fetchAllDraws(program)]);
            break;
          } catch (e) {
            if (i >= 2 || !alive) throw e;
            await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
          }
        }
        const [cfg, all] = got;
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
