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
      <section className="px-4 py-8 max-w-lg mx-auto" id="buy">
        <div className="glass rounded-2xl p-8">
          <div className="text-center mb-8">
            <h2 className="font-bold text-2xl tracking-tight mb-1">Get Your Tickets</h2>
            <p className="text-sm text-muted/50">Each ticket includes an instant scratch card</p>
          </div>

          {/* Skill question */}
          <div className="mb-6">
            <label className="block text-xs text-muted/50 mb-1.5 uppercase tracking-wider font-medium">
              Skill Question
            </label>
            <p className="text-text text-[15px] mb-3 font-medium">
              {skillQuestion}
            </p>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer..."
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3.5 text-text text-sm placeholder:text-muted/30 focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.05] transition-all duration-200"
            />
          </div>

          {/* Quantity */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs text-muted/50 uppercase tracking-wider font-medium">
                Quantity
              </label>
              <span className="font-mono text-2xl font-bold gradient-text">{quantity}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Quick select */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[1, 10, 30, 70].map((q) => (
              <button
                key={q}
                onClick={() => setQuantity(q)}
                className={`py-2.5 rounded-xl text-sm font-mono font-semibold transition-all duration-200 ${
                  quantity === q
                    ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20"
                    : "bg-white/[0.03] text-muted/60 hover:bg-white/[0.06] border border-white/[0.04]"
                }`}
              >
                {q}x
              </button>
            ))}
          </div>

          {/* Discount tiers */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {DISCOUNT_TIERS.map((tier) => (
              <button
                key={tier.min}
                onClick={() => setQuantity(tier.min)}
                className={`py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                  quantity >= tier.min && quantity <= tier.max
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-white/[0.02] text-muted/40 border border-white/[0.04] hover:border-white/[0.08]"
                }`}
              >
                {tier.min}+ saves {tier.label}
              </button>
            ))}
          </div>

          {/* Price breakdown */}
          <div className="bg-white/[0.02] rounded-xl p-4 mb-6 space-y-2.5 border border-white/[0.03]">
            <div className="flex justify-between text-sm">
              <span className="text-muted/50">
                {quantity} ticket{quantity > 1 ? "s" : ""} @ ${TICKET_PRICE_USDC}
              </span>
              <span className="font-mono text-muted/60">${basePrice.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-400">
                  Bulk discount ({discount}%)
                </span>
                <span className="font-mono text-emerald-400">
                  -${savings.toFixed(2)}
                </span>
              </div>
            )}
            <div className="border-t border-white/[0.04] pt-2.5 flex justify-between items-center">
              <span className="font-semibold text-sm">Total</span>
              <span className="font-mono font-bold text-xl gradient-text">
                ${totalPrice.toFixed(2)} USDC
              </span>
            </div>
          </div>

          {/* Buy button */}
          {!wallet.publicKey ? (
            <div className="text-center py-4 rounded-xl bg-white/[0.02] border border-dashed border-white/[0.06]">
              <p className="text-muted/40 text-sm">Connect wallet to purchase</p>
            </div>
          ) : (
            <button
              onClick={handleBuy}
              disabled={purchasing || !answer.trim() || !isDrawOpen}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold text-base transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/25 hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:brightness-100 active:scale-[0.98]"
            >
              {purchasing
                ? "Processing..."
                : !isDrawOpen
                ? "Draw Closed"
                : `Buy ${quantity} Ticket${quantity > 1 ? "s" : ""} for $${totalPrice.toFixed(2)}`}
            </button>
          )}
        </div>
      </section>

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
