"use client";

import { useEffect, useState } from "react";

const URL = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";
const EVERY_MS = 60_000;

/**
 * The SOL price in USD from CoinGecko's public endpoint, re-read once a minute. null until it has been read
 * and null again if a read fails and nothing good is older than 10 minutes: the page then shows SOL only.
 * There is no fallback figure: a USD amount on screen is always from a real quote, never a guess.
 */
export function useSolPrice(): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    let lastOk = 0;
    const read = async () => {
      try {
        const res = await fetch(URL, { cache: "no-store" });
        const data = (await res.json()) as { solana?: { usd?: number } };
        const usd = data.solana?.usd;
        if (!alive) return;
        if (typeof usd === "number" && usd > 0 && Number.isFinite(usd)) {
          setPrice(usd);
          lastOk = Date.now();
        } else if (Date.now() - lastOk > 10 * EVERY_MS) setPrice(null);
      } catch {
        if (alive && Date.now() - lastOk > 10 * EVERY_MS) setPrice(null);
      }
      if (alive) t = setTimeout(read, EVERY_MS);
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  return price;
}
