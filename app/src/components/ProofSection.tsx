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
      <div className="max-w-[640px] mx-auto">
        <h2 className="font-display font-bold text-2xl mb-10">How it works</h2>

        <div className="space-y-0 mb-20">
          {steps.map(({ title, desc }, i) => (
            <div key={i} className="flex gap-5 py-6 border-b border-white/[0.04] group">
              <span className="shrink-0 w-9 h-9 rounded-[10px] bg-primary/[0.1] border border-primary/[0.12] flex items-center justify-center font-mono text-[12px] font-bold text-primary-light tabular-nums group-hover:bg-primary/[0.18] transition-colors">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-[16px] font-semibold text-text mb-1">{title}</h3>
                <p className="text-secondary text-[14px] leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <h2 className="font-display font-bold text-2xl mb-2">Provably Fair</h2>
          <p className="text-secondary text-[15px] leading-relaxed">
            All randomness is on-chain via ORAO VRF. Every address is public and verifiable.
          </p>
        </div>

        <div className="space-y-2">
          {addresses.map(({ label, value }) => (
            <div
              key={label}
              className="card-glow bg-surface rounded-[14px] border border-white/[0.06] px-5 py-3.5 flex items-center gap-4"
            >
              <span className="text-tertiary text-[11px] font-bold tracking-wide w-16 shrink-0">{label}</span>
              <code className="font-mono text-[11px] text-secondary break-all leading-relaxed">{value}</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
