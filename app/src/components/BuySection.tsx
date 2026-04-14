"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useDrawState } from "@/hooks/useDrawState";
import { useSolPrice } from "@/hooks/useSolPrice";
import { useTicketPurchase } from "@/hooks/useTicketPurchase";
import { TICKET_PRICE_USDC, DISCOUNT_TIERS } from "@/lib/constants";
import { isOpen } from "@/lib/types";
import ScratchCard from "./ScratchCard";

export default function BuySection() {
  const wallet = useWallet();
  const { drawState, refetch } = useDrawState();
  const { price: solPrice } = useSolPrice();
  const { buyTickets, purchasing, calculatePrice, getDiscount } =
    useTicketPurchase();

  const [quantity, setQuantity] = useState(1);
  const [answer, setAnswer] = useState("");
  const [showScratchCard, setShowScratchCard] = useState(false);
  const [purchasedSlot, setPurchasedSlot] = useState<number | null>(null);

  // Skill question (hardcoded for demo — in production from program)
  const skillQuestion = "What is the capital of France?";
  const correctAnswer = "Paris";

  const discount = getDiscount(quantity);
  const totalPrice = calculatePrice(quantity);
  const basePrice = TICKET_PRICE_USDC * quantity;
  const savings = basePrice - totalPrice;

  const isDrawOpen = drawState ? isOpen(drawState.status) : true;

  const handleBuy = async () => {
    if (!wallet.publicKey || !solPrice || !drawState) return;

    // Hash the answer (SHA-256)
    const encoder = new TextEncoder();
    const data = encoder.encode(answer);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    const result = await buyTickets(
      quantity,
      hashArray,
      solPrice,
      drawState.ticketsSold
    );

    if (result) {
      setPurchasedSlot(result.ticketSlot);
      setShowScratchCard(true);
      refetch();
    }
  };

  return (
    <>
      <section className="px-4 pb-12 max-w-lg mx-auto" id="buy">
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <h2 className="font-heading font-bold text-2xl mb-6 text-center">
            Get Your Tickets
          </h2>

          {/* Skill question */}
          <div className="mb-6">
            <label className="block text-sm text-text/60 mb-2 font-body">
              Answer to enter (skill-based competition)
            </label>
            <p className="text-text font-body mb-2 font-medium">
              {skillQuestion}
            </p>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-text font-body focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Quantity slider */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm text-text/60 font-body">
                Tickets
              </label>
              <span className="font-mono text-primary text-lg">{quantity}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Discount pills */}
          <div className="flex gap-2 mb-6">
            {DISCOUNT_TIERS.map((tier) => (
              <button
                key={tier.min}
                onClick={() => setQuantity(tier.min)}
                className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
                  quantity >= tier.min && quantity <= tier.max
                    ? "bg-primary text-bg"
                    : "bg-white/5 text-text/60 hover:bg-white/10"
                }`}
              >
                {tier.min}+ = {tier.label}
              </button>
            ))}
          </div>

          {/* Quick buy buttons */}
          <div className="flex gap-2 mb-6">
            {[1, 10, 30, 70].map((q) => (
              <button
                key={q}
                onClick={() => setQuantity(q)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-mono font-bold transition-all ${
                  quantity === q
                    ? "bg-accent text-bg"
                    : "bg-white/5 text-text/60 hover:bg-white/10"
                }`}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Price breakdown */}
          <div className="bg-white/5 rounded-xl p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text/60 font-body">
                {quantity}x ticket{quantity > 1 ? "s" : ""} @ ${TICKET_PRICE_USDC}
              </span>
              <span className="font-mono text-text/60">${basePrice.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-accent font-body">
                  Bulk discount ({discount}%)
                </span>
                <span className="font-mono text-accent">
                  -${savings.toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t border-white/10 pt-2 flex justify-between">
              <span className="font-body font-bold">Total</span>
              <span className="font-mono font-bold text-primary text-lg">
                ${totalPrice.toFixed(2)} USDC
              </span>
            </div>
          </div>

          {/* Buy button */}
          {!wallet.publicKey ? (
            <p className="text-center text-text/40 text-sm font-body">
              Connect your wallet to buy tickets
            </p>
          ) : (
            <button
              onClick={handleBuy}
              disabled={
                purchasing ||
                !answer.trim() ||
                !isDrawOpen
              }
              className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-[#FFB347] text-bg font-body font-bold text-lg transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {purchasing
                ? "Processing..."
                : !isDrawOpen
                ? "Draw Closed"
                : `Buy ${quantity} Ticket${quantity > 1 ? "s" : ""} — $${totalPrice.toFixed(2)} USDC`}
            </button>
          )}
        </div>
      </section>

      {/* Scratch card modal */}
      {showScratchCard && purchasedSlot !== null && (
        <ScratchCard
          slotNumber={purchasedSlot}
          onClose={() => {
            setShowScratchCard(false);
            setPurchasedSlot(null);
          }}
        />
      )}
    </>
  );
}
