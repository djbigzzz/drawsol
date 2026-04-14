"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface ScratchCardProps {
  slotNumber: number;
  onClose: () => void;
}

export default function ScratchCard({ slotNumber, onClose }: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScratched, setIsScratched] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [prize, setPrize] = useState<number>(0);

  // Simulate prize result (in production, this reads from the ticket PDA after VRF)
  useEffect(() => {
    const prizes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 50];
    const idx = slotNumber % prizes.length;
    setPrize(prizes[idx]);
  }, [slotNumber]);

  // Initialize gold scratch overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Gold gradient scratch layer
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#C9A84C");
    gradient.addColorStop(0.5, "#F7D774");
    gradient.addColorStop(1, "#C9A84C");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // "SCRATCH HERE" text
    ctx.font = "bold 20px 'Manrope', sans-serif";
    ctx.fillStyle = "rgba(5, 8, 15, 0.5)";
    ctx.textAlign = "center";
    ctx.fillText("SCRATCH HERE", canvas.width / 2, canvas.height / 2 + 7);
  }, []);

  const scratch = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, 25, 0, Math.PI * 2);
      ctx.fill();

      // Check how much is scratched
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let transparent = 0;
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] === 0) transparent++;
      }
      const total = imageData.data.length / 4;
      if (transparent / total > 0.5) {
        setIsScratched(true);
      }
    },
    []
  );

  const handleMouseDown = () => setIsDrawing(true);
  const handleMouseUp = () => setIsDrawing(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawing) scratch(e.clientX, e.clientY);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    scratch(touch.clientX, touch.clientY);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-bg border border-white/10 rounded-2xl p-6 max-w-sm w-full">
        <h3 className="font-heading font-bold text-2xl text-center mb-4">
          Scratch & Reveal
        </h3>

        <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden mb-4">
          {/* Prize underneath */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1f2e] to-bg">
            {prize > 0 ? (
              <>
                <span className="text-accent text-lg font-body mb-1">
                  YOU WON
                </span>
                <span className="text-5xl font-heading font-black text-primary">
                  ${prize}
                </span>
                <span className="text-text/60 text-sm font-body mt-1">
                  USDC
                </span>
              </>
            ) : (
              <>
                <span className="text-text/40 text-lg font-body mb-1">
                  Not this time
                </span>
                <span className="text-2xl font-heading text-text/20">
                  Better luck next draw!
                </span>
              </>
            )}
          </div>

          {/* Scratch canvas overlay */}
          <canvas
            ref={canvasRef}
            width={350}
            height={233}
            className="absolute inset-0 w-full h-full cursor-pointer touch-none"
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseMove={handleMouseMove}
            onTouchStart={() => setIsDrawing(true)}
            onTouchEnd={() => setIsDrawing(false)}
            onTouchMove={handleTouchMove}
          />
        </div>

        {isScratched && prize > 0 && (
          <div className="bg-accent/10 border border-accent/20 rounded-xl p-3 mb-4 text-center">
            <p className="text-accent text-sm font-body">
              Arriving in your wallet within 24 hours
            </p>
          </div>
        )}

        <p className="text-xs text-text/30 text-center mb-4 font-mono">
          Ticket #{slotNumber}
        </p>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-white/10 text-text font-body font-medium hover:bg-white/20 transition-colors"
        >
          {isScratched ? "Done" : "Skip & Close"}
        </button>
      </div>
    </div>
  );
}
