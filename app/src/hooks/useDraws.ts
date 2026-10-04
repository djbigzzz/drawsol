"use client";

import { useCallback, useEffect, useState } from "react";
import { PROGRAM_ID } from "@/lib/config";
import { fetchAllDraws, fetchConfig, fetchLegacyDraws, type AnyProgram } from "@/lib/chain";
import type { ConfigView, DrawView, LoadState } from "@/lib/types";

/** The catalogue (every draw's sales and status) is re-read this often while the page is open. */
const CATALOGUE_MS = 60_000;

/**
 * Config + every DrawV4 account (with its Schedule), and the v3 draws still on chain. The first read is tried
 * three times (2 s, then 4 s) before the error state; after that the catalogue is re-read once a minute, and
 * a failed re-read keeps what was read (the current draw has its own faster poll and stale note).
 */
export function useDraws(program: AnyProgram, legacy: AnyProgram) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [draws, setDraws] = useState<DrawView[]>([]);
  const [legacyDraws, setLegacy] = useState<DrawView[]>([]);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    // a retry from the error state shows "reading" again rather than the old error
    setLoad((l) => (l.kind === "error" ? { kind: "loading" } : l));
    const read = async (first: boolean) => {
      try {
        const conn = program.provider.connection;
        let got: [ConfigView | null, DrawView[]] | null = null;
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
            if (!first || i >= 2 || !alive) throw e;
            await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
          }
        }
        const [cfg, all] = got;
        // history: never blocks the page, and a closed v3 account is simply not shown
        const old = await fetchLegacyDraws(legacy).catch(() => null);
        if (!alive) return;
        setConfig(cfg);
        setDraws(all);
        if (old) setLegacy(old);
        setLoad(!cfg ? { kind: "nodraw", reason: "no-config" } : all.length > 0 ? { kind: "ready" } : { kind: "nodraw", reason: "no-draws" });
      } catch (e) {
        if (!alive) return;
        // a failed first read shows no numbers at all; a failed re-read keeps the last good one
        if (first) setLoad({ kind: "error", message: (e as Error).message });
      }
      if (alive) t = setTimeout(() => void read(false), CATALOGUE_MS);
    };
    void read(true);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [program, legacy, nonce]);

  return { load, config, draws, legacyDraws, refresh };
}
