"use client";

import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import ThresholdBar from "@/components/ThresholdBar";
import BuySection from "@/components/BuySection";
import WinnerTicker from "@/components/WinnerTicker";
import ProofSection from "@/components/ProofSection";
import { PROGRAM_ID } from "@/lib/constants";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg">
      <Nav />
      <Hero />

      <div className="max-w-[640px] mx-auto px-5">
        <ThresholdBar />
        <BuySection />
      </div>

      <WinnerTicker />
      <ProofSection />

      <footer className="border-t border-white/[0.04] py-16 px-5">
        <div className="max-w-[640px] mx-auto text-center space-y-4">
          <div className="flex flex-wrap justify-center gap-6 text-[13px] text-tertiary">
            <a href="#" className="hover:text-secondary transition-colors">Terms</a>
            <a href="#" className="hover:text-secondary transition-colors">Free Entry</a>
            <a
              href={`https://solscan.io/account/${PROGRAM_ID.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-secondary transition-colors"
            >
              Verify On-chain
            </a>
            <a
              href="https://github.com/djbigzzz/drawsol"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-secondary transition-colors"
            >
              GitHub
            </a>
          </div>
          <p className="text-[11px] text-tertiary/60 max-w-sm mx-auto leading-relaxed">
            DrawSol is a skill-based competition. Tickets are non-refundable.
            Built for Colosseum Frontier Hackathon 2026.
          </p>
        </div>
      </footer>
    </main>
  );
}
