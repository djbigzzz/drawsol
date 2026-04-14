"use client";

import { useEffect, useState, useCallback } from "react";

// For the hackathon demo, we fetch SOL price from a public API
// In production, this would use Pyth on-chain price feeds
export function useSolPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPrice = useCallback(async () => {
    try {
      // Use CoinGecko free API for demo
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
      );
      const data = await res.json();
      if (data.solana?.usd) {
        setPrice(data.solana.usd);
      }
    } catch {
      // Fallback price for offline/rate-limited scenarios
      if (!price) setPrice(126);
    } finally {
      setLoading(false);
    }
  }, [price]);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 30_000); // every 30s
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return { price, loading };
}
