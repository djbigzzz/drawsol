"use client";

import { PROGRAM_ID, ORAO_VRF_PROGRAM, DRAW_NUMBER } from "@/lib/constants";
import { getDrawStatePda, getVaultPda } from "@/lib/anchor";

const steps = [
  { title: "Answer & Buy", desc: "Answer a skill question and purchase tickets with USDC. Bulk discounts up to 30%." },
  { title: "Scratch & Win", desc: "Every ticket includes an instant scratch card powered by ORAO VRF. Win up to $50." },
  { title: "Threshold Hit", desc: "When the prize pool reaches the target, the grand draw fires automatically." },
  { title: "Winner Paid", desc: "VRF selects a random winning ticket. 100 SOL transferred directly to the winner." },
];

export default function ProofSection() {
  const [drawStatePda] = getDrawStatePda(DRAW_NUMBER);
  const [vaultPda] = getVaultPda(DRAW_NUMBER);

  const addresses = [
    { label: "Program", value: PROGRAM_ID.toBase58() },
    { label: "Draw State", value: drawStatePda.toBase58() },
    { label: "Vault", value: vaultPda.toBase58() },
    { label: "ORAO VRF", value: ORAO_VRF_PROGRAM.toBase58() },
  ];

  return (
    <section className="px-5 pt-20 pb-16">
      <div className="max-w-[560px] mx-auto">
        {/* How it works */}
        <h2 className="font-display font-bold text-xl mb-8">How it works</h2>

        <div className="space-y-0 mb-20">
          {steps.map(({ title, desc }, i) => (
            <div key={i} className="flex gap-4 py-5 border-b border-white/[0.04]">
              <span className="font-mono text-[11px] text-tertiary tabular-nums pt-1 shrink-0 w-5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-text mb-0.5">{title}</h3>
                <p className="text-secondary text-[14px] leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Provably fair */}
        <div className="mb-6">
          <h2 className="font-display font-bold text-xl mb-2">Provably Fair</h2>
          <p className="text-secondary text-[14px] leading-relaxed">
            All randomness is on-chain via ORAO VRF. Every address is public and verifiable.
          </p>
        </div>

        <div className="space-y-1.5">
          {addresses.map(({ label, value }) => (
            <div
              key={label}
              className="bg-surface rounded-[12px] border border-white/[0.05] px-4 py-3 flex items-center gap-4 hover:border-white/[0.08] transition-colors"
            >
              <span className="text-tertiary text-[11px] font-semibold w-14 shrink-0">{label}</span>
              <code className="font-mono text-[11px] text-secondary break-all">{value}</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
