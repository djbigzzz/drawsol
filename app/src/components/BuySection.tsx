"use client";

import { useState } from "react";
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

  const skillQuestion = "What is the capital of France?";

  const discount = getDiscount(quantity);
  const totalPrice = calculatePrice(quantity);
  const basePrice = TICKET_PRICE_USDC * quantity;
  const savings = basePrice - totalPrice;

  const isDrawOpen = drawState ? isOpen(drawState.status) : true;

  const handleBuy = async () => {
    if (!wallet.publicKey || !solPrice || !drawState) return;

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
      <div className="mb-6" id="buy">
        <div className="bg-surface rounded-card border border-white/[0.06] p-6">
          <h2 className="font-display font-bold text-xl mb-6">Get Tickets</h2>

          {/* Skill question */}
          <div className="mb-5">
            <label className="block text-tertiary text-[11px] font-medium mb-1.5">
              SKILL QUESTION
            </label>
            <p className="text-text text-[15px] mb-2.5">{skillQuestion}</p>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Your answer..."
              className="w-full bg-elevated border border-white/[0.06] rounded-btn px-4 py-3 text-text text-sm placeholder:text-tertiary/60 focus:outline-none focus:border-white/[0.14] transition-colors"
            />
          </div>

          {/* Quantity */}
          <div className="mb-5">
            <div className="flex justify-between items-baseline mb-3">
              <label className="text-tertiary text-[11px] font-medium">QUANTITY</label>
              <span className="font-mono text-2xl font-bold text-text">{quantity}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              className="w-full mb-3"
            />
            <div className="grid grid-cols-4 gap-2">
              {[1, 10, 30, 70].map((q) => (
                <button
                  key={q}
                  onClick={() => setQuantity(q)}
                  className={`py-2 rounded-btn text-[13px] font-semibold transition-colors ${
                    quantity === q
                      ? "bg-primary text-white"
                      : "bg-elevated text-secondary border border-white/[0.06] hover:border-white/[0.12]"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Discount tiers */}
          {discount > 0 && (
            <div className="flex items-center gap-2 mb-5 px-3 py-2 bg-success/[0.06] rounded-btn border border-success/[0.12]">
              <span className="text-success text-[13px] font-medium">
                {discount}% bulk discount applied
              </span>
              <span className="text-success/60 text-[13px] font-mono ml-auto">
                -${savings.toFixed(2)}
              </span>
            </div>
          )}

          {/* Price */}
          <div className="bg-elevated rounded-[12px] p-4 mb-5">
            <div className="flex justify-between text-[13px] mb-2">
              <span className="text-secondary">
                {quantity} ticket{quantity > 1 ? "s" : ""} @ ${TICKET_PRICE_USDC}
              </span>
              <span className="font-mono text-secondary">${basePrice.toFixed(2)}</span>
            </div>
            <div className="border-t border-white/[0.04] pt-2 flex justify-between items-baseline">
              <span className="text-[13px] font-medium text-text">Total</span>
              <span className="font-mono text-lg font-bold text-text">
                ${totalPrice.toFixed(2)} <span className="text-secondary text-sm">USDC</span>
              </span>
            </div>
          </div>

          {/* CTA */}
          {!wallet.publicKey ? (
            <div className="text-center py-3 rounded-btn border border-dashed border-white/[0.08]">
              <p className="text-tertiary text-[13px]">Connect wallet to continue</p>
            </div>
          ) : (
            <button
              onClick={handleBuy}
              disabled={purchasing || !answer.trim() || !isDrawOpen}
              className="w-full py-3.5 rounded-btn bg-primary hover:bg-[#D4691F] text-white font-semibold text-[15px] transition-colors active:scale-[0.98] disabled:bg-elevated disabled:text-tertiary disabled:cursor-not-allowed"
            >
              {purchasing
                ? "Processing..."
                : !isDrawOpen
                ? "Draw Closed"
                : `Buy ${quantity} Ticket${quantity > 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>

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
