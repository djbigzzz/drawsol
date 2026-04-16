"use client";

import { PROGRAM_ID, ORAO_VRF_PROGRAM, DRAW_NUMBER } from "@/lib/constants";
import { getDrawStatePda, getVaultPda } from "@/lib/anchor";

const steps = [
  {
    num: "01",
    title: "Answer & Buy",
    desc: "Answer a skill question and purchase tickets with USDC.",
  },
  {
    num: "02",
    title: "Scratch & Win",
    desc: "Each ticket includes an instant scratch card. Win up to $50.",
  },
  {
    num: "03",
    title: "Threshold Hit",
    desc: "When the pool reaches the target, the grand draw fires.",
  },
  {
    num: "04",
    title: "Winner Paid",
    desc: "VRF picks a random ticket. 100 SOL sent to the winner.",
  },
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
    <section className="px-5 py-24 max-w-[640px] mx-auto">
      {/* How it works */}
      <h2 className="font-display font-bold text-2xl mb-10">How it works</h2>

      <div className="space-y-1 mb-24">
        {steps.map(({ num, title, desc }) => (
          <div
            key={num}
            className="flex gap-5 py-5 border-b border-white/[0.04] group"
          >
            <span className="font-mono text-[12px] text-tertiary pt-0.5 shrink-0">{num}</span>
            <div>
              <h3 className="font-semibold text-[15px] text-text mb-1">{title}</h3>
              <p className="text-secondary text-[14px] leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Provably Fair */}
      <div className="flex items-center gap-3 mb-6">
        <h2 className="font-display font-bold text-2xl">Provably Fair</h2>
        <span className="text-[11px] font-medium text-success bg-success/[0.08] px-2 py-0.5 rounded-full border border-success/[0.12]">
          Verified
        </span>
      </div>

      <p className="text-secondary text-[14px] leading-relaxed mb-8">
        Every outcome is determined by ORAO VRF on-chain randomness.
        All contract addresses are public.
      </p>

      <div className="space-y-2">
        {addresses.map(({ label, value }) => (
          <div
            key={label}
            className="bg-surface rounded-[12px] border border-white/[0.06] px-4 py-3 flex items-center gap-4 group hover:border-white/[0.1] transition-colors"
          >
            <span className="text-tertiary text-[11px] font-medium w-16 shrink-0">{label}</span>
            <code className="font-mono text-[12px] text-secondary break-all leading-relaxed">
              {value}
            </code>
          </div>
        ))}
      </div>
    </section>
  );
}
