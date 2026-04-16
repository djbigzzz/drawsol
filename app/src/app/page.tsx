"use client";

import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import ThresholdBar from "@/components/ThresholdBar";
import BuySection from "@/components/BuySection";
import LiveFeed from "@/components/LiveFeed";
import ScarcityBar from "@/components/ScarcityBar";
import ProofSection from "@/components/ProofSection";
import { PROGRAM_ID } from "@/lib/constants";

export default function Home() {
  return (
    <main className="min-h-screen bg-bg relative overflow-x-hidden">
      {/* Ambient background gradients */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-primary/[0.07] rounded-full blur-[200px]" />
        <div className="absolute bottom-[-100px] left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gold/[0.04] rounded-full blur-[180px]" />
        <div className="absolute top-[40%] left-[-200px] w-[500px] h-[500px] bg-primary/[0.03] rounded-full blur-[150px]" />
        <div className="absolute top-[60%] right-[-200px] w-[500px] h-[500px] bg-gold/[0.02] rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10">
        <Nav />

        <Hero />

        <LiveFeed />

        <ScarcityBar />

        <div className="max-w-[880px] mx-auto px-5 pt-10 pb-8">
          <ThresholdBar />
        </div>

        <div className="max-w-[880px] mx-auto px-5 pb-20">
          <BuySection />
        </div>

        <ProofSection />

        <footer className="border-t border-white/[0.04] py-14 px-5">
          <div className="max-w-[880px] mx-auto text-center space-y-4">
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
                Source
              </a>
            </div>
            <p className="text-[11px] text-tertiary/50 max-w-xs mx-auto leading-relaxed">
              DrawSol is a skill-based competition. Tickets are non-refundable.
              Colosseum Frontier Hackathon 2026.
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
