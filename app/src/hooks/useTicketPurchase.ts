"use client";

import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import {
  DRAW_NUMBER,
  USDC_MINT_DEVNET,
  TICKET_PRICE_USDC,
  DISCOUNT_TIERS,
} from "@/lib/constants";
import {
  getDrawStatePda,
  getVaultPda,
  getTicketPda,
  IDL,
} from "@/lib/anchor";

export function useTicketPurchase() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [purchasing, setPurchasing] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticketSlot, setTicketSlot] = useState<number | null>(null);

  const getDiscount = useCallback((quantity: number): number => {
    for (const tier of DISCOUNT_TIERS) {
      if (quantity >= tier.min && quantity <= tier.max) {
        return tier.discount;
      }
    }
    return 0;
  }, []);

  const calculatePrice = useCallback(
    (quantity: number): number => {
      const discount = getDiscount(quantity);
      const base = TICKET_PRICE_USDC * quantity;
      return base * (1 - discount / 100);
    },
    [getDiscount]
  );

  const buyTickets = useCallback(
    async (
      quantity: number,
      skillAnswerHash: number[],
      solPriceUsd: number,
      ticketsSold: number
    ) => {
      if (!wallet.publicKey || !wallet.signTransaction) {
        setError("Please connect your wallet");
        return null;
      }

      setPurchasing(true);
      setError(null);
      setTxSignature(null);

      try {
        const provider = new AnchorProvider(connection, wallet as any, {
          commitment: "confirmed",
        });
        const program = new Program(IDL, provider) as any;

        const [drawStatePda] = getDrawStatePda(DRAW_NUMBER);
        const [vaultPda] = getVaultPda(DRAW_NUMBER);
        const [ticketPda] = getTicketPda(DRAW_NUMBER, ticketsSold);

        const buyerTokenAccount = await getAssociatedTokenAddress(
          USDC_MINT_DEVNET,
          wallet.publicKey
        );

        // SOL price in 6-decimal fixed point
        const solPriceFixed = new BN(Math.round(solPriceUsd * 1_000_000));

        const tx = await program.methods
          .buyTickets(quantity, skillAnswerHash, solPriceFixed)
          .accounts({
            drawState: drawStatePda,
            vault: vaultPda,
            ticket: ticketPda,
            buyer: wallet.publicKey,
            buyerTokenAccount: buyerTokenAccount,
            usdcMint: USDC_MINT_DEVNET,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        setTxSignature(tx);
        setTicketSlot(ticketsSold);
        return { tx, ticketSlot: ticketsSold };
      } catch (err: any) {
        setError(err.message || "Transaction failed");
        return null;
      } finally {
        setPurchasing(false);
      }
    },
    [connection, wallet]
  );

  return {
    buyTickets,
    purchasing,
    txSignature,
    ticketSlot,
    error,
    calculatePrice,
    getDiscount,
  };
}
