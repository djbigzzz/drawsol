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

  useEffect(() => {
    const prizes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 25, 0, 0, 50];
    const idx = slotNumber % prizes.length;
    setPrize(prizes[idx]);
  }, [slotNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#f97316");
    gradient.addColorStop(0.5, "#fb923c");
    gradient.addColorStop(1, "#f97316");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Pattern overlay
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let x = 0; x < canvas.width; x += 8) {
      for (let y = 0; y < canvas.height; y += 8) {
        if ((x + y) % 16 === 0) ctx.fillRect(x, y, 4, 4);
      }
    }

    ctx.font = "600 18px 'Inter', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.textAlign = "center";
    ctx.fillText("SCRATCH TO REVEAL", canvas.width / 2, canvas.height / 2 + 6);
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
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let transparent = 0;
      for (let i = 3; i < imageData.data.length; i += 4) {
        if (imageData.data[i] === 0) transparent++;
      }
      if (transparent / (imageData.data.length / 4) > 0.5) setIsScratched(true);
    },
    []
  );

  const handleMouseDown = () => setIsDrawing(true);
  const handleMouseUp = () => setIsDrawing(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawing) scratch(e.clientX, e.clientY);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    scratch(e.touches[0].clientX, e.touches[0].clientY);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="glass rounded-3xl p-8 max-w-sm w-full border border-white/[0.08] shadow-2xl">
        <div className="text-center mb-6">
          <h3 className="font-bold text-2xl tracking-tight mb-1">Scratch & Reveal</h3>
          <p className="text-xs text-muted/40 font-mono">Ticket #{slotNumber}</p>
        </div>

        <div className="relative w-full aspect-[3/2] rounded-2xl overflow-hidden mb-6 ring-1 ring-white/[0.06]">
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-surface to-bg">
            {prize > 0 ? (
              <>
                <span className="text-emerald-400 text-sm font-semibold mb-2 uppercase tracking-widest">
                  You Won
                </span>
                <span className="text-6xl font-black gradient-text">
                  ${prize}
                </span>
                <span className="text-muted/40 text-sm mt-2">USDC</span>
              </>
            ) : (
              <>
                <span className="text-muted/30 text-base mb-1">Not this time</span>
                <span className="text-muted/15 text-sm">Better luck next draw</span>
              </>
            )}
          </div>

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
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-5 text-center">
            <p className="text-emerald-400 text-sm font-medium">
              Prize arriving in your wallet within 24h
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-xl bg-white/[0.04] text-text font-medium text-sm hover:bg-white/[0.08] transition-all duration-200 border border-white/[0.04]"
        >
          {isScratched ? "Done" : "Skip & Close"}
        </button>
      </div>
    </div>
  );
}
