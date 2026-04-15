"use client";

import { PROGRAM_ID, ORAO_VRF_PROGRAM, DRAW_NUMBER } from "@/lib/constants";
import { getDrawStatePda, getVaultPda } from "@/lib/anchor";

const steps = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
    title: "Answer & Buy",
    desc: "Answer a skill question and buy tickets with USDC. Bulk discounts up to 30%.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
      </svg>
    ),
    title: "Scratch & Win",
    desc: "Every ticket gets an instant scratch card powered by ORAO VRF. Win up to $50.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    title: "Threshold Hit",
    desc: "When the prize pool target is reached, the grand draw triggers automatically.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: "100 SOL Winner",
    desc: "VRF selects a random ticket. 100 SOL transferred directly to the winner's wallet.",
  },
];

export default function ProofSection() {
  const [drawStatePda] = getDrawStatePda(DRAW_NUMBER);
  const [vaultPda] = getVaultPda(DRAW_NUMBER);

  const addresses = [
    { label: "Program", value: PROGRAM_ID.toBase58() },
    { label: "Draw State", value: drawStatePda.toBase58() },
    { label: "USDC Vault", value: vaultPda.toBase58() },
    { label: "ORAO VRF", value: ORAO_VRF_PROGRAM.toBase58() },
  ];

  return (
    <section className="px-4 py-16 max-w-3xl mx-auto">
      {/* How it works */}
      <div className="text-center mb-12">
        <p className="text-xs text-muted/40 uppercase tracking-widest font-semibold mb-2">Process</p>
        <h2 className="font-bold text-3xl tracking-tight">How It Works</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-20">
        {steps.map(({ icon, title, desc }, i) => (
          <div
            key={i}
            className="glass glass-hover rounded-2xl p-6 group cursor-default"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/5 flex items-center justify-center text-orange-400 shrink-0 group-hover:from-orange-500/30 transition-all duration-300">
                {icon}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-[10px] text-muted/30 bg-white/[0.03] px-1.5 py-0.5 rounded">0{i + 1}</span>
                  <h3 className="font-semibold text-[15px] text-text">{title}</h3>
                </div>
                <p className="text-muted/50 text-[13px] leading-relaxed">{desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Provably Fair */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-xs font-semibold text-emerald-400">Verified On-chain</span>
        </div>
        <h2 className="font-bold text-3xl tracking-tight mb-3">Provably Fair</h2>
        <p className="text-muted/40 text-sm max-w-md mx-auto leading-relaxed">
          Every outcome is determined by ORAO VRF on-chain randomness.
          All contract addresses are public and verifiable.
        </p>
      </div>

      <div className="space-y-2">
        {addresses.map(({ label, value }) => (
          <div
            key={label}
            className="glass rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 group hover:border-white/[0.08] transition-all duration-200"
          >
            <span className="text-muted/30 text-[11px] font-semibold uppercase tracking-wider min-w-[90px]">
              {label}
            </span>
            <code className="font-mono text-xs text-muted/60 break-all group-hover:text-orange-400/80 transition-colors duration-200">
              {value}
            </code>
          </div>
        ))}
      </div>
    </section>
  );
}
