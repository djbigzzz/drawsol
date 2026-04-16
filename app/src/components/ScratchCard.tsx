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

    ctx.fillStyle = "#E8762D";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle pattern
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let x = 0; x < canvas.width; x += 6) {
      for (let y = 0; y < canvas.height; y += 6) {
        if ((x + y) % 12 === 0) ctx.fillRect(x, y, 3, 3);
      }
    }

    ctx.font = "600 16px 'Satoshi', sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
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
    ctx.arc(clientX - rect.left, clientY - rect.top, 24, 0, Math.PI * 2);
    ctx.fill();
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === 0) transparent++;
    }
    if (transparent / (imageData.data.length / 4) > 0.5) setIsScratched(true);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawing) scratch(e.clientX, e.clientY);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    scratch(e.touches[0].clientX, e.touches[0].clientY);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
      <div className="bg-surface border border-white/[0.06] rounded-modal p-7 max-w-[360px] w-full">
        <h3 className="font-display font-bold text-xl mb-1 text-center">Scratch & Reveal</h3>
        <p className="text-tertiary text-[12px] font-mono text-center mb-5">Ticket #{slotNumber}</p>

        <div className="relative w-full aspect-[3/2] rounded-card overflow-hidden mb-5 border border-white/[0.06]">
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-elevated">
            {prize > 0 ? (
              <>
                <span className="text-success text-[12px] font-semibold mb-2 tracking-wide">YOU WON</span>
                <span className="text-5xl font-display font-bold text-text">${prize}</span>
                <span className="text-tertiary text-[13px] mt-1">USDC</span>
              </>
            ) : (
              <>
                <span className="text-tertiary text-[15px]">Not this time</span>
                <span className="text-tertiary/40 text-[13px] mt-1">Better luck next draw</span>
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
            onMouseMove={handleMouseMove}
            onTouchStart={() => setIsDrawing(true)}
            onTouchEnd={() => setIsDrawing(false)}
            onTouchMove={handleTouchMove}
          />
        </div>

        {isScratched && prize > 0 && (
          <div className="bg-success/[0.06] border border-success/[0.12] rounded-btn p-3 mb-4 text-center">
            <p className="text-success text-[13px] font-medium">Arriving in your wallet within 24h</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-3 rounded-btn bg-elevated text-text text-[14px] font-medium hover:bg-hover transition-colors border border-white/[0.06]"
        >
          {isScratched ? "Done" : "Skip & Close"}
        </button>
      </div>
    </div>
  );
}
