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
      <ThresholdBar />

      {/* Countdown placeholder */}
      <section className="px-4 pb-8 max-w-2xl mx-auto">
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center">
          <p className="text-text/40 text-sm font-body mb-1">
            Estimated draw date
          </p>
          <p className="font-mono text-xl text-primary">
            When threshold is reached
          </p>
        </div>
      </section>

      <BuySection />
      <WinnerTicker />
      <ProofSection />

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <div className="flex flex-wrap justify-center gap-4 text-sm text-text/40 font-body">
            <a href="#" className="hover:text-text transition-colors">
              Terms & Conditions
            </a>
            <span>&middot;</span>
            <a href="#" className="hover:text-text transition-colors">
              Free Entry
            </a>
            <span>&middot;</span>
            <a
              href={`https://solscan.io/account/${PROGRAM_ID.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text transition-colors"
            >
              Verify Escrow
            </a>
            <span>&middot;</span>
            <a
              href="https://github.com/djbigzzz/drawsol"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text transition-colors"
            >
              GitHub
            </a>
          </div>
          <p className="text-xs text-text/20 font-body">
            DrawSol is a skill-based competition governed under Irish law.
            Tickets are non-refundable. Must answer a skill question to enter.
          </p>
          <p className="text-xs text-text/20 font-body">
            Built for the Colosseum Frontier Hackathon 2026
          </p>
        </div>
      </footer>
    </main>
  );
}
