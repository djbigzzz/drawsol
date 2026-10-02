/**
 * End-to-end run of a complete draw on devnet against the real ORAO VRF:
 *   create a short draw → fund 3 throwaway buyers → buy + free entry → wait for ORAO →
 *   reveal (instant wins paid) → wait for close → request_draw → settle_draw → verify → sweep.
 *
 *   npx tsx scripts/e2e-devnet.ts [--minutes 6]
 *   npx tsx scripts/e2e-devnet.ts --resume <drawId>   (continue an interrupted run; buyer keys from $E2E_KEYS_DIR)
 *
 * Every payout is recomputed off-chain with the published fairness functions and compared with
 * what the program actually transferred. Throwaway keypairs are written to $E2E_KEYS_DIR
 * (default: os.tmpdir()) so leftover SOL can be recovered if the run is interrupted.
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ROOT, configPda, drawPda, entryPda, entryVrfSeed, fetchEntries, log, makeProgram, oraoNetworkStatePda,
  oraoRequestPda, oraoTreasury, playerPda, readRandomness, requestDraw, revealReady, settleIfReady, sleep,
  sol, statusName, ticketTier, vaultPda, winningTicket, ORAO_VRF_ID, loadKeypair,
} from "./lib";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};

async function main() {
  const admin = loadKeypair();
  const adminProgram = makeProgram(admin);
  const connection = adminProgram.provider.connection;
  const minutes = arg("minutes", "6");

  const resume = arg("resume", "");
  const keysDir = process.env.E2E_KEYS_DIR || os.tmpdir();
  let id: number;
  let buyers: Keypair[];
  if (resume) {
    id = Number(resume);
    buyers = [0, 1, 2].map((i) => loadKeypair(path.join(keysDir, `drawsol-e2e-${id}-${i}.json`)));
    log(`resuming draw #${id}`);
  } else {
  // 1. Create a short draw through the admin CLI (same code path as production).
  id = (await adminProgram.account.config.fetch(configPda())).nextDrawId.toNumber();
  execFileSync("npx", ["tsx", "scripts/admin.ts", "create-draw", "--preset", "demo", "--prize", "0.2", "--reserve", "0.3",
    "--cap", "30", "--per-wallet", "25", "--free-cap", "3", "--minutes", minutes], { cwd: ROOT, stdio: "inherit" });
  const draw = drawPda(id);
  const d0 = await adminProgram.account.draw.fetch(draw);
  log(`draw #${id} open until ${new Date(d0.closesAt.toNumber() * 1000).toISOString()}; vault ${sol(await connection.getBalance(vaultPda(draw)))} SOL`);

  // 2. Three throwaway buyers, funded by the admin.
  buyers = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  buyers.forEach((k, i) => fs.writeFileSync(path.join(keysDir, `drawsol-e2e-${id}-${i}.json`), JSON.stringify(Array.from(k.secretKey))));
  const fund = new Transaction().add(...buyers.map((b) =>
    SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: b.publicKey, lamports: 0.2 * LAMPORTS_PER_SOL })));
  log(`funded buyers ${await sendAndConfirmTransaction(connection, fund, [admin])}`);

  // 3. Purchases (each one requests ORAO randomness) + one free entry.
  const treasury = await oraoTreasury(adminProgram);
  const plan: [number, number][] = [[0, 10], [1, 5], [2, 3], [0, 4]];
  for (const [bi, qty] of plan) {
    const buyer = buyers[bi];
    const p = makeProgram(buyer);
    const d = await p.account.draw.fetch(draw);
    const nonce = randomBytes(16);
    const seq = d.entryCount;
    const vrfRequest = oraoRequestPda(entryVrfSeed(draw, buyer.publicKey, seq, nonce));
    const sig = await p.methods.buyTickets(qty, Array.from(nonce)).accountsPartial({
      draw, vault: vaultPda(draw), entry: entryPda(draw, seq), player: playerPda(draw, buyer.publicKey),
      buyer: buyer.publicKey, vrfRequest, vrfConfig: oraoNetworkStatePda(), vrfTreasury: treasury,
      vrf: ORAO_VRF_ID, systemProgram: SystemProgram.programId,
    }).rpc();
    log(`buyer ${bi} bought ${qty} (entry #${seq}, tickets #${d.nextTicket}–#${d.nextTicket + qty - 1}) ${sig}`);
  }
  {
    const buyer = buyers[2];
    const p = makeProgram(buyer);
    const d = await p.account.draw.fetch(draw);
    const sig = await p.methods.claimFreeEntry().accountsPartial({
      draw, entry: entryPda(draw, d.entryCount), player: playerPda(draw, buyer.publicKey), buyer: buyer.publicKey,
      systemProgram: SystemProgram.programId,
    }).rpc();
    log(`buyer 2 claimed a free entry (ticket #${d.nextTicket}) ${sig}`);
  }
  }
  const draw = drawPda(id);

  // 4. Wait for ORAO, reveal, and check every instant payout against the off-chain recomputation.
  const vaultBefore = await connection.getBalance(vaultPda(draw));
  const paidBefore = BigInt((await adminProgram.account.draw.fetch(draw)).iwPaidLamports.toString());
  for (let t = 0; t < 30; t++) {
    const pending = (await fetchEntries(adminProgram, draw)).filter(({ account: e }) => !e.isFree && !e.revealed);
    if (!pending.length) break;
    await revealReady(adminProgram, draw);
    await sleep(2000);
  }
  const dAfterReveal = await adminProgram.account.draw.fetch(draw);
  let expectedTotal = 0n;
  for (const { account: e } of await fetchEntries(adminProgram, draw)) {
    if (e.isFree) continue;
    if (!e.revealed) throw new Error(`entry #${e.seq} never revealed`);
    const rnd = (await readRandomness(connection, e.vrfRequest, e.vrfSeed))!;
    let sum = 0n;
    for (let i = 0; i < e.count; i++) {
      const tier = ticketTier(rnd, e.firstTicket + i, dAfterReveal.iwDenominator, dAfterReveal.iwTiers);
      if (tier !== e.tiers[i]) throw new Error(`entry #${e.seq} ticket ${i}: chain tier ${e.tiers[i]} != recomputed ${tier}`);
      if (tier) sum += BigInt(dAfterReveal.iwTiers[tier - 1].amount.toString());
    }
    if (sum !== BigInt(e.instantPaid.toString())) throw new Error(`entry #${e.seq}: paid ${e.instantPaid} != expected ${sum}`);
    expectedTotal += sum;
  }
  // Buyer balances also move by ORAO's rent refund on fulfilment, so check the program's books instead:
  // the vault must have paid out exactly what this run revealed, and iw_paid must equal the recomputed total.
  const vaultAfter = await connection.getBalance(vaultPda(draw));
  const paidNow = BigInt(dAfterReveal.iwPaidLamports.toString());
  if (paidNow !== expectedTotal) throw new Error(`iw_paid ${paidNow} != recomputed ${expectedTotal}`);
  if (BigInt(vaultBefore - vaultAfter) !== paidNow - paidBefore) throw new Error(`vault moved ${vaultBefore - vaultAfter}, iw_paid moved ${paidNow - paidBefore}`);
  log(`all reveals verified: ${sol(new BN(expectedTotal.toString()))} SOL instant wins paid, matches recomputation`);

  // 5. Close → request ORAO for the grand draw → settle → verify the winner.
  const closesAt = dAfterReveal.closesAt.toNumber();
  while (Math.floor(Date.now() / 1000) <= closesAt) {
    log(`waiting for close (${closesAt - Math.floor(Date.now() / 1000)} s)`);
    await sleep(Math.min(30_000, Math.max(1000, (closesAt - Math.floor(Date.now() / 1000) + 2) * 1000)));
  }
  await requestDraw(adminProgram, draw);
  const preWinner = new Map<string, number>();
  for (const b of buyers) preWinner.set(b.publicKey.toBase58(), await connection.getBalance(b.publicKey));
  for (let t = 0; t < 60 && !(await settleIfReady(adminProgram, draw)); t++) await sleep(2000);
  const dEnd = await adminProgram.account.draw.fetch(draw);
  if (statusName(dEnd.status) !== "settled") throw new Error(`draw not settled: ${statusName(dEnd.status)}`);
  const rnd = (await readRandomness(connection, dEnd.drawVrfRequest, dEnd.drawVrfSeed))!;
  const w = winningTicket(rnd, dEnd.nextTicket);
  if (w !== dEnd.winningTicket) throw new Error(`winning ticket ${dEnd.winningTicket} != recomputed ${w}`);
  const winnerKey = (dEnd.winner as PublicKey).toBase58();
  if (preWinner.has(winnerKey)) {
    const gained = (await connection.getBalance(dEnd.winner as PublicKey)) - preWinner.get(winnerKey)!;
    if (BigInt(gained) !== BigInt(dEnd.prizeLamports.toString())) throw new Error(`winner gained ${gained}`);
  }
  log(`draw #${id} settled and verified: ticket #${w} of ${dEnd.nextTicket} → ${winnerKey} won ${sol(dEnd.prizeLamports)} SOL`);

  // 6. Proceeds + reserve leftovers back to the admin, then sweep the throwaway wallets.
  try {
    execFileSync("npx", ["tsx", "scripts/admin.ts", "withdraw", "--draw", String(id)], { cwd: ROOT, stdio: "inherit" });
  } catch { log("withdraw skipped/failed (see above)"); }
  for (const b of buyers) {
    const bal = await connection.getBalance(b.publicKey);
    if (bal <= 5000) continue;
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: b.publicKey, toPubkey: admin.publicKey, lamports: bal - 5000 }));
    await sendAndConfirmTransaction(connection, tx, [b]);
  }
  log(`done. admin balance ${sol(await connection.getBalance(admin.publicKey))} SOL`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
