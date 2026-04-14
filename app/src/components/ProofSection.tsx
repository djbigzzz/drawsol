"use client";

import { PROGRAM_ID, ORAO_VRF_PROGRAM, DRAW_NUMBER } from "@/lib/constants";
import { getDrawStatePda, getVaultPda } from "@/lib/anchor";

export default function ProofSection() {
  const [drawStatePda] = getDrawStatePda(DRAW_NUMBER);
  const [vaultPda] = getVaultPda(DRAW_NUMBER);

  const addresses = [
    {
      label: "Program ID",
      value: PROGRAM_ID.toBase58(),
    },
    {
      label: "Draw State",
      value: drawStatePda.toBase58(),
    },
    {
      label: "USDC Vault",
      value: vaultPda.toBase58(),
    },
    {
      label: "ORAO VRF",
      value: ORAO_VRF_PROGRAM.toBase58(),
    },
  ];

  return (
    <section className="px-4 py-12 max-w-2xl mx-auto">
      {/* How it works */}
      <h2 className="font-heading font-bold text-3xl text-center mb-8">
        How It Works
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
        {[
          {
            step: "1",
            title: "Answer & Buy",
            desc: "Answer a skill question and buy tickets with USDC. Bulk discounts available.",
          },
          {
            step: "2",
            title: "Scratch & Win",
            desc: "Each ticket gets an instant scratch card powered by ORAO VRF. Win up to $50 USDC.",
          },
          {
            step: "3",
            title: "Threshold Hit",
            desc: "When the vault reaches the target, the grand draw triggers automatically.",
          },
          {
            step: "4",
            title: "100 SOL Winner",
            desc: "VRF selects a random winning ticket. 100 SOL transferred directly to the winner.",
          },
        ].map(({ step, title, desc }) => (
          <div
            key={step}
            className="bg-white/5 border border-white/10 rounded-xl p-5"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center mb-3">
              <span className="font-mono text-primary font-bold text-sm">
                {step}
              </span>
            </div>
            <h3 className="font-heading font-bold text-lg mb-1">{title}</h3>
            <p className="text-text/60 text-sm font-body">{desc}</p>
          </div>
        ))}
      </div>

      {/* Provably Fair */}
      <h2 className="font-heading font-bold text-3xl text-center mb-6">
        Provably Fair
      </h2>
      <p className="text-text/60 text-center text-sm font-body mb-6">
        Every draw outcome is determined by ORAO VRF on-chain randomness.
        All addresses are public and verifiable.
      </p>

      <div className="space-y-3">
        {addresses.map(({ label, value }) => (
          <div
            key={label}
            className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4"
          >
            <span className="text-text/40 text-xs font-body min-w-[100px]">
              {label}
            </span>
            <code className="font-mono text-xs text-primary break-all">
              {value}
            </code>
          </div>
        ))}
      </div>
    </section>
  );
}
