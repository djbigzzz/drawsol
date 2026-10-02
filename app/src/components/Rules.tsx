"use client";

import { useDrawSol } from "@/hooks/context";
import { SectionHead, Verify } from "./bits";
import { activeTiers, instantNumer, maxEntries } from "@/lib/derive";
import { oneIn, sol, utcLabel } from "@/lib/format";
import { toHex } from "@/lib/fairness";
import { GAMBLE_AWARE_URL, ORAO_PROGRAM_ID, PROGRAM_ID, SOURCE_URL } from "@/lib/config";
import { vaultPda } from "@/lib/chain";

export function Rules() {
  const { current: d } = useDrawSol();
  if (!d) return null;

  const guarantees = [
    {
      t: "The prize is in the vault before sales open",
      b: `create_draw moves the ${sol(d.prizeLamports, 2, 4)} SOL prize and the ${sol(d.iwReserveLamports, 2, 4)} SOL instant-win reserve into a program vault in the same instruction that opens the draw.`,
      proof: <Verify account={vaultPda(d.address)} label="vault" />,
    },
    {
      t: "The draw happens at sell-out or the deadline",
      b: `Whichever comes first: ${d.ticketCap} paid tickets, or ${utcLabel(d.closesAt)}. The close time is written into the draw account at creation and can't be changed.`,
      proof: <Verify account={d.address} label="draw account" />,
    },
    {
      t: "Nobody chooses the randomness",
      b: "Every result comes from ORAO VRF. The request seed is fixed by program state, so the buyer, the operator and whoever runs the draw get no say in the outcome.",
      proof: <Verify account={ORAO_PROGRAM_ID} label="ORAO VRF" />,
    },
    {
      t: "Anyone can run and settle the draw",
      b: "Requesting the draw, settling it and revealing tickets are permissionless. If the operator disappears, any wallet can finish the job and the winner still gets paid. If randomness never comes, refunds open after 48 h.",
      proof: (
        <span className="flex gap-2">
          <Verify account={PROGRAM_ID} label="program" />
          <a className="verify" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            source ↗
          </a>
        </span>
      ),
    },
  ];

  const tiers = activeTiers(d);
  const numer = instantNumer(d);

  return (
    <section aria-labelledby="rules-h">
      <SectionHead idx="05" title="The rules" id="rules" />
      <ol className="grid border-l border-t border-line md:grid-cols-2">
        {guarantees.map((g, i) => (
          <li key={g.t} className="flex flex-col gap-3 border-b border-r border-line px-6 py-6">
            <span className="mono text-[12px] text-brass">0{i + 1}</span>
            <h3 className="display text-[26px] leading-[28px]">{g.t}</h3>
            <p className="max-w-[48ch] flex-1 text-[14px] leading-[22px] text-dim">{g.b}</p>
            <div>{g.proof}</div>
          </li>
        ))}
      </ol>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h3 className="eyebrow mb-4">Instant-win odds, per ticket · demo odds (boosted for devnet)</h3>
          <table className="mono w-full text-[13px]">
            <thead>
              <tr className="border-b border-brass/50 text-left text-[11px] uppercase tracking-[0.14em] text-brass">
                <th className="py-2 font-normal">Tier</th>
                <th className="py-2 font-normal">Pays</th>
                <th className="py-2 text-right font-normal">Odds</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.index} className="border-b border-line">
                  <td className="py-3">{t.index + 1}</td>
                  <td className="py-3 text-brass">{sol(t.amount, 2, 4)} SOL</td>
                  <td className="py-3 text-right">{oneIn(t.odds, d.iwDenominator)}</td>
                </tr>
              ))}
              <tr className="border-b border-line text-dim">
                <td className="py-3">Any</td>
                <td className="py-3">—</td>
                <td className="py-3 text-right">{oneIn(numer, d.iwDenominator)}</td>
              </tr>
              <tr className="text-dim">
                <td className="py-3">Grand</td>
                <td className="py-3 text-brass">{sol(d.prizeLamports, 2, 4)} SOL</td>
                <td className="py-3 text-right">1 in {d.nextTicket || "—"} now · ≥ {oneIn(1, maxEntries(d))}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-[12px] leading-[18px] text-dim">
            Instant wins are paid from the escrowed reserve in the same transaction that reveals them. Free entries
            don&apos;t roll for instant wins.
          </p>
        </div>

        <div className="space-y-8 text-[14px] leading-[22px]">
          <div>
            <h3 className="eyebrow mb-2">Free entry</h3>
            <p className="text-dim">
              One free ticket per wallet, grand draw only, up to {d.freeCap} for this draw ({d.freeCap - d.freeTickets} left). Claim it
              in the ticket panel. It counts toward the {d.maxPerWallet}-ticket wallet limit.
            </p>
          </div>
          <div>
            <h3 className="eyebrow mb-2">Skill question</h3>
            <p className="text-dim">
              The question is asked here in the app. It is not checked on-chain. The draw&apos;s terms hash commits to the published
              terms, the question and the odds:
            </p>
            <code className="mono mt-2 block break-all text-[12px] leading-[18px] text-cream">{toHex(d.termsHash)}</code>
          </div>
          <div>
            <h3 className="eyebrow mb-2">Play responsibly</h3>
            <p className="text-dim">
              18+ only. Limits are enforced on-chain: {d.maxPerTx} tickets per purchase and {d.maxPerWallet} per wallet per draw.
              This is a devnet demo — the SOL has no value. If gambling stops being fun,{" "}
              <a className="link" href={GAMBLE_AWARE_URL} target="_blank" rel="noopener noreferrer">
                BeGambleAware ↗
              </a>{" "}
              can help.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
