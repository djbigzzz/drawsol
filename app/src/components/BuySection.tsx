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
      <div id="buy">
        <div className="card-glow bg-surface border border-white/[0.06] rounded-[20px] p-7">
          <h2 className="font-display font-bold text-xl mb-6">Get Tickets</h2>

          {/* Skill question */}
          <div className="mb-6">
            <label className="block text-tertiary text-[11px] font-semibold tracking-wider mb-1.5">
              SKILL QUESTION
            </label>
            <p className="text-text text-[15px] mb-3">{skillQuestion}</p>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Your answer..."
              className="w-full bg-elevated border border-white/[0.06] rounded-[10px] px-4 py-3.5 text-text text-sm placeholder:text-tertiary/50 focus:outline-none focus:border-primary/50 focus:shadow-[0_0_0_3px_rgba(124,58,237,0.1)] transition-all"
            />
          </div>

          {/* Quantity */}
          <div className="mb-6">
            <div className="flex justify-between items-baseline mb-3">
              <label className="text-tertiary text-[11px] font-semibold tracking-wider">QUANTITY</label>
              <span className="font-mono text-2xl font-bold text-text">{quantity}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              className="w-full mb-4"
            />
            <div className="grid grid-cols-4 gap-2">
              {[1, 10, 30, 70].map((q) => (
                <button
                  key={q}
                  onClick={() => setQuantity(q)}
                  className={`py-2.5 rounded-[10px] text-[14px] font-semibold transition-all ${
                    quantity === q
                      ? "bg-gradient-to-r from-primary to-primary-light text-white shadow-[0_0_16px_rgba(124,58,237,0.3)]"
                      : "bg-elevated text-secondary hover:text-text hover:bg-hover border border-white/[0.04]"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Discount indicator */}
          {discount > 0 && (
            <div className="flex items-center justify-between mb-5 px-4 py-2.5 bg-success/[0.08] border border-success/[0.12] rounded-[10px]">
              <span className="text-success text-[13px] font-semibold">
                {discount}% bulk discount
              </span>
              <span className="text-success font-mono text-[14px] font-bold">
                -${savings.toFixed(2)}
              </span>
            </div>
          )}

          {/* Price breakdown */}
          <div className="bg-elevated rounded-[14px] p-5 mb-6 border border-white/[0.03]">
            <div className="flex justify-between text-[13px] mb-2.5">
              <span className="text-secondary">
                {quantity} x ${TICKET_PRICE_USDC}
              </span>
              <span className="font-mono text-secondary">${basePrice.toFixed(2)}</span>
            </div>
            <div className="border-t border-white/[0.04] pt-2.5 flex justify-between items-baseline">
              <span className="text-[14px] font-semibold">Total</span>
              <span className="font-mono text-xl font-bold text-text">
                ${totalPrice.toFixed(2)}
                <span className="text-secondary text-[13px] font-normal ml-1.5">USDC</span>
              </span>
            </div>
          </div>

          {/* CTA */}
          {!wallet.publicKey ? (
            <div className="text-center py-4 rounded-[12px] border border-dashed border-white/[0.08] bg-white/[0.01]">
              <p className="text-tertiary text-[14px]">Connect wallet to purchase</p>
            </div>
          ) : (
            <button
              onClick={handleBuy}
              disabled={purchasing || !answer.trim() || !isDrawOpen}
              className="w-full py-4 rounded-[12px] bg-gradient-to-r from-primary to-primary-light text-white font-bold text-[16px] transition-all shadow-[0_0_24px_rgba(124,58,237,0.25)] hover:shadow-[0_0_40px_rgba(124,58,237,0.4)] active:scale-[0.97] border border-white/[0.12] hover:-translate-y-0.5 disabled:bg-elevated disabled:from-elevated disabled:to-elevated disabled:text-tertiary disabled:shadow-none disabled:cursor-not-allowed disabled:border-white/[0.04] disabled:transform-none"
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
