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
    <main className="min-h-screen bg-bg relative overflow-hidden">
      {/* Aurora background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-orange-500/[0.07] blur-[120px] aurora-blob" />
        <div className="absolute top-[30%] right-[-15%] w-[500px] h-[500px] rounded-full bg-emerald-500/[0.05] blur-[120px] aurora-blob-2" />
        <div className="absolute bottom-[-10%] left-[20%] w-[400px] h-[400px] rounded-full bg-orange-500/[0.04] blur-[100px] aurora-blob" />
      </div>

      <div className="relative z-10">
        <Nav />
        <Hero />
        <ThresholdBar />
        <BuySection />
        <WinnerTicker />
        <ProofSection />

        {/* Footer */}
        <footer className="border-t border-white/[0.04] py-12 px-4 mt-8">
          <div className="max-w-2xl mx-auto text-center space-y-5">
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted/60">
              <a href="#" className="hover:text-text transition-colors duration-200">
                Terms
              </a>
              <a href="#" className="hover:text-text transition-colors duration-200">
                Free Entry
              </a>
              <a
                href={`https://solscan.io/account/${PROGRAM_ID.toBase58()}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-text transition-colors duration-200"
              >
                Verify On-chain
              </a>
              <a
                href="https://github.com/djbigzzz/drawsol"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-text transition-colors duration-200"
              >
                GitHub
              </a>
            </div>
            <p className="text-xs text-muted/30 max-w-md mx-auto leading-relaxed">
              DrawSol is a skill-based competition. Tickets are non-refundable.
              Must answer a skill question to enter. Built for the Colosseum Frontier Hackathon 2026.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
