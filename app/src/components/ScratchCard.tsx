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
    setPrize(prizes[slotNumber % prizes.length]);
  }, [slotNumber]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#6D28D9");
    gradient.addColorStop(0.5, "#7C3AED");
    gradient.addColorStop(1, "#8B5CF6");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let x = 0; x < canvas.width; x += 8) {
      for (let y = 0; y < canvas.height; y += 8) {
        if ((x + y) % 16 === 0) ctx.fillRect(x, y, 4, 4);
      }
    }

    ctx.font = "700 15px Satoshi, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.textAlign = "center";
    ctx.fillText("SCRATCH TO REVEAL", canvas.width / 2, canvas.height / 2 + 5);
  }, []);

  const scratch = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, 26, 0, Math.PI * 2);
    ctx.fill();
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === 0) transparent++;
    }
    if (transparent / (imageData.data.length / 4) > 0.5) setIsScratched(true);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-5">
      <div className="bg-surface border border-white/[0.08] rounded-[24px] p-8 max-w-[380px] w-full shadow-[0_0_80px_rgba(124,58,237,0.2)]">
        <h3 className="font-display font-bold text-2xl mb-0.5 text-center">Scratch & Reveal</h3>
        <p className="text-tertiary text-[12px] font-mono text-center mb-6">Ticket #{slotNumber}</p>

        <div className="relative w-full aspect-[3/2] rounded-[14px] overflow-hidden mb-6 border border-white/[0.06]">
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-elevated">
            {prize > 0 ? (
              <>
                <span className="text-gold text-[12px] font-bold mb-2 tracking-widest">YOU WON</span>
                <span className="text-5xl font-display font-bold shimmer-gold">${prize}</span>
                <span className="text-tertiary text-[13px] mt-1.5 font-medium">USDC</span>
              </>
            ) : (
              <>
                <span className="text-secondary text-[16px] font-medium">Not this time</span>
                <span className="text-tertiary text-[13px] mt-1">Better luck next draw</span>
              </>
            )}
          </div>

          <canvas
            ref={canvasRef}
            width={350}
            height={233}
            className="absolute inset-0 w-full h-full cursor-pointer touch-none"
            onMouseDown={() => setIsDrawing(true)}
            onMouseUp={() => setIsDrawing(false)}
            onMouseLeave={() => setIsDrawing(false)}
            onMouseMove={(e) => isDrawing && scratch(e.clientX, e.clientY)}
            onTouchStart={() => setIsDrawing(true)}
            onTouchEnd={() => setIsDrawing(false)}
            onTouchMove={(e) => scratch(e.touches[0].clientX, e.touches[0].clientY)}
          />
        </div>

        {isScratched && prize > 0 && (
          <div className="bg-gold/[0.08] border border-gold/[0.15] rounded-[10px] p-3.5 mb-5 text-center">
            <p className="text-gold text-[13px] font-semibold">Arriving in your wallet within 24h</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-[12px] bg-elevated text-text text-[14px] font-semibold hover:bg-hover transition-colors border border-white/[0.04]"
        >
          {isScratched ? "Done" : "Skip & Close"}
        </button>
      </div>
    </div>
  );
}
