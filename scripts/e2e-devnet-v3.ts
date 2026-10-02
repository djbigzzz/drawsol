/**
 * End-to-end run of DrawSol v3 on devnet against the real ORAO VRF (SPEC-v3). Two parts:
 *
 *  A. Pot draw: create a short pot draw → fund 3 throwaway buyers → buys + a free entry (each rolls via ORAO)
 *     → reveal one by one, checking every tier, SOL payout (min(owed from the pool snapshot, pool)) and credit
 *     against the off-chain recomputation → spend a won credit if any → wait for draw_at → request_draw →
 *     settle_draw (prize = pot + unwon pool) → withdraw the house share → vault back to rent.
 *  B. Headline draw, undersold path: create a small headline draw → sell fewer than min_tickets (+ a free
 *     entry) → at draw_at request_draw cancels it and returns the prize → every paid entry refunded in full
 *     → vault back to rent.
 *
 *   npx tsx scripts/e2e-devnet-v3.ts [--minutes 6] [--only pot|headline]
 *
 * Signer: KEYPAIR_PATH (the admin; it is also the draw authority, so it may request inside the keeper window).
 * Throwaway keypairs are written to $E2E_KEYS_DIR (default os.tmpdir()) and swept back at the end.
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ROOT, buyTickets, claimFreeEntry, configPda, drawPda, expectedReveal, fetchEntries, kindName, loadKeypair, log,
  makeProgram, nowSecs, profilePda, readRandomness, refundAll, requestDraw, revealEntry, settleIfReady, sleep, sol,
  statusName, vaultPda, winningTicket, type DrawsolProgram,
} from "./lib";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const minutes = arg("minutes", "6");
const only = arg("only", "");
const keysDir = process.env.E2E_KEYS_DIR || os.tmpdir();

const admin = loadKeypair();
const adminProgram = makeProgram(admin);
const connection = adminProgram.provider.connection;
const big = (x: BN | number) => BigInt(x.toString());

function fail(msg: string): never {
  throw new Error(`E2E FAILED: ${msg}`);
}

async function vaultFree(draw: PublicKey) {
  return BigInt(await connection.getBalance(vaultPda(draw))) - BigInt(await connection.getMinimumBalanceForRentExemption(8));
}

async function fundBuyers(tag: string, n: number, solEach: number) {
  const buyers = Array.from({ length: n }, () => Keypair.generate());
  buyers.forEach((k, i) => fs.writeFileSync(path.join(keysDir, `drawsol-e2e3-${tag}-${i}.json`), JSON.stringify(Array.from(k.secretKey))));
  const tx = new Transaction().add(
    ...buyers.map((b) => SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: b.publicKey, lamports: Math.round(solEach * LAMPORTS_PER_SOL) })),
  );
  log(`funded ${n} buyers (${tag}) ${await sendAndConfirmTransaction(connection, tx, [admin])}`);
  return buyers;
}

async function sweep(buyers: Keypair[]) {
  for (const b of buyers) {
    const bal = await connection.getBalance(b.publicKey);
    if (bal <= 5000) continue;
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: b.publicKey, toPubkey: admin.publicKey, lamports: bal - 5000 }));
    await sendAndConfirmTransaction(connection, tx, [b]).catch((e) => log(`sweep of ${b.publicKey} failed: ${e.message}`));
  }
}

async function createViaCli(args: string[]) {
  const id = (await adminProgram.account.config.fetch(configPda())).nextDrawId.toNumber();
  execFileSync("npx", ["tsx", "scripts/admin.ts", ...args], { cwd: ROOT, stdio: "inherit" });
  const draw = drawPda(id);
  const d = await adminProgram.account.drawV3.fetch(draw);
  log(`draw #${id} (${kindName(d.kind)}) open until ${new Date(d.closesAt.toNumber() * 1000).toISOString()}, draws at ${new Date(d.drawAt.toNumber() * 1000).toISOString()}`);
  return { id, draw };
}

async function waitUntil(unix: number, what: string) {
  while (nowSecs() < unix) {
    log(`waiting for ${what} (${unix - nowSecs()} s)`);
    await sleep(Math.min(30_000, Math.max(1000, (unix - nowSecs() + 2) * 1000)));
  }
}

/** Waits for an entry's randomness, reveals it, and checks the result against the recomputation. */
async function revealAndVerify(program: DrawsolProgram, draw: PublicKey, entry: PublicKey) {
  const e = await program.account.entryV3.fetch(entry);
  let rnd: Buffer | null = null;
  for (let t = 0; t < 60 && !(rnd = await readRandomness(connection, e.vrfRequest, e.vrfSeed)); t++) await sleep(2000);
  if (!rnd) fail(`entry #${e.seq}: randomness never fulfilled`);
  const before = await program.account.drawV3.fetch(draw);
  const credits0 = (await program.account.profile.fetch(profilePda(e.owner))).credits;
  const sig = await revealEntry(program, draw, entry, e);
  const after = await program.account.entryV3.fetch(entry);
  const d = await program.account.drawV3.fetch(draw);
  const exp = expectedReveal(rnd, e, before);
  const pool = big(before.instantPoolLamports);
  const wantSol = exp.owed < pool ? exp.owed : pool;
  for (let i = 0; i < e.count; i++) if (after.tiers[i] !== exp.tiers[i]) fail(`entry #${e.seq} ticket ${i}: chain tier ${after.tiers[i]} != recomputed ${exp.tiers[i]}`);
  if (big(after.solPaid) !== wantSol) fail(`entry #${e.seq}: sol_paid ${after.solPaid} != min(owed ${exp.owed}, pool ${pool})`);
  if (after.creditsWon !== exp.credits) fail(`entry #${e.seq}: credits ${after.creditsWon} != ${exp.credits}`);
  if (big(d.instantPoolLamports) !== pool - wantSol) fail(`entry #${e.seq}: pool did not drop by the payout`);
  const credits1 = (await program.account.profile.fetch(profilePda(e.owner))).credits;
  if (credits1 !== credits0 + exp.credits) fail(`entry #${e.seq}: profile credits ${credits0} → ${credits1}, expected +${exp.credits}`);
  log(`entry #${e.seq} verified: tiers [${exp.tiers.join(",")}], ${sol(new BN(wantSol.toString()))} SOL (snapshot ${sol(e.poolSnapshot)}), +${exp.credits} credits ${sig}`);
  return { sol: wantSol, credits: exp.credits };
}

async function assertBooks(draw: PublicKey, label: string) {
  const d = await adminProgram.account.drawV3.fetch(draw);
  const free = await vaultFree(draw);
  const books = big(d.houseLamports) + big(d.potLamports) + big(d.instantPoolLamports);
  if (free !== books) fail(`${label}: vault above rent ${free} != house + pot + pool ${books}`);
  log(`${label}: books balance (vault = house ${sol(d.houseLamports)} + pot ${sol(d.potLamports)} + pool ${sol(d.instantPoolLamports)})`);
}

// ====================================================================== A. pot draw

async function potDraw() {
  const { id, draw } = await createViaCli(["create-pot", "--preset", "nightly", "--minutes", minutes, "--cap", "40",
    "--per-wallet", "30", "--free-cap", "3"]);
  const buyers = await fundBuyers(`pot-${id}`, 3, 0.3);
  try {
    const entries: PublicKey[] = [];
    for (const [bi, qty] of [[0, 10], [1, 5], [2, 3], [0, 4]] as [number, number][]) {
      const r = await buyTickets(makeProgram(buyers[bi]), draw, qty);
      const e = await adminProgram.account.entryV3.fetch(r.entry);
      log(`buyer ${bi} bought ${qty} (entry #${r.seq}, tickets #${r.firstTicket}–#${r.firstTicket + qty - 1}, pool snapshot ${sol(e.poolSnapshot)}) ${r.sig}`);
      entries.push(r.entry);
    }
    const free = await claimFreeEntry(makeProgram(buyers[2]), draw);
    log(`buyer 2 claimed a free entry (ticket #${free.ticket}, rolls for instant wins) ${free.sig}`);
    entries.push(free.entry);
    await assertBooks(draw, "after sales");

    for (const entry of entries) await revealAndVerify(adminProgram, draw, entry);
    let credited: Keypair | null = null;
    // Spend a credit if anyone won one: no lamports may enter the vault for a credit ticket.
    for (const b of buyers) {
      const p = await adminProgram.account.profile.fetch(profilePda(b.publicKey));
      if (p.credits === 0) continue;
      const v0 = await vaultFree(draw);
      const r = await buyTickets(makeProgram(b), draw, 1, 1);
      if ((await vaultFree(draw)) !== v0) fail("a credit ticket moved lamports into the vault");
      const e = await adminProgram.account.entryV3.fetch(r.entry);
      if (e.paidLamports.toNumber() !== 0 || e.creditCount !== 1) fail("credit entry recorded a payment");
      log(`spent 1 credit (${b.publicKey}): entry #${r.seq}, no payment ${r.sig}`);
      await revealAndVerify(adminProgram, draw, r.entry);
      credited = b;
      break;
    }
    if (!credited) log("no credits won this run (1 in ~6.7 per ticket); credit spend path skipped");
    await assertBooks(draw, "after reveals");

    // Draw at draw_at (the admin is the authority, so it may request inside the keeper window).
    const d0 = await adminProgram.account.drawV3.fetch(draw);
    await waitUntil(d0.drawAt.toNumber(), "draw_at");
    await requestDraw(adminProgram, draw);
    const pre = await adminProgram.account.drawV3.fetch(draw);
    const prize = big(pre.potLamports) + big(pre.instantPoolLamports);
    const balances = new Map<string, number>();
    for (const b of buyers) balances.set(b.publicKey.toBase58(), await connection.getBalance(b.publicKey));
    let settled = null;
    for (let t = 0; t < 60 && !(settled = await settleIfReady(adminProgram, draw)); t++) await sleep(2000);
    if (!settled) fail("draw never settled");
    const d = await adminProgram.account.drawV3.fetch(draw);
    if (statusName(d.status) !== "settled") fail(`status ${statusName(d.status)}`);
    const rnd = (await readRandomness(connection, d.drawVrfRequest, d.drawVrfSeed))!;
    if (winningTicket(rnd, d.nextTicket) !== d.winningTicket) fail("winning ticket != recomputation");
    if (big(d.prizePaidLamports) !== prize) fail(`prize ${d.prizePaidLamports} != pot + pool ${prize}`);
    const wk = (d.winner as PublicKey).toBase58();
    if (balances.has(wk)) {
      const gained = BigInt((await connection.getBalance(d.winner as PublicKey)) - balances.get(wk)!);
      if (gained !== prize) fail(`winner gained ${gained}, expected ${prize}`);
    }
    if ((await vaultFree(draw)) !== big(d.houseLamports)) fail("after settlement the vault should hold exactly the house share");
    log(`pot draw #${id} settled and verified: ticket #${d.winningTicket} of ${d.nextTicket} → ${wk} won ${sol(d.prizePaidLamports)} SOL (pot + unwon pool)`);

    execFileSync("npx", ["tsx", "scripts/admin.ts", "withdraw", "--draw", String(id)], { cwd: ROOT, stdio: "inherit" });
    if ((await vaultFree(draw)) !== 0n) fail("vault not back to rent after withdraw");
    log(`pot draw #${id}: house share withdrawn, vault at rent`);
  } finally {
    await sweep(buyers);
  }
}

// ====================================================================== B. headline draw, undersold

async function headlineUndersold() {
  // prize 0.02, 0.001 SOL tickets, cap 60 (house 55% at sell-out: 60 × 0.001 × 0.45 = 0.027 ≥ 0.02),
  // min 30 (30 × 0.001 = 0.03 ≥ 0.02 × 1.2).
  const { id, draw } = await createViaCli(["create-headline", "--preset", "weekly", "--prize", "0.02", "--price", "0.001",
    "--cap", "60", "--min", "30", "--margin", "2000", "--minutes", minutes]);
  const buyers = await fundBuyers(`headline-${id}`, 3, 0.05);
  try {
    const paid = new Map<string, bigint>();
    for (const [bi, qty] of [[0, 10], [1, 6], [2, 4]] as [number, number][]) {
      const r = await buyTickets(makeProgram(buyers[bi]), draw, qty);
      if (r.vrfRequest) fail("headline purchase requested randomness");
      const k = buyers[bi].publicKey.toBase58();
      paid.set(k, (paid.get(k) ?? 0n) + BigInt(qty) * 1_000_000n);
      log(`buyer ${bi} bought ${qty} (no instant roll) ${r.sig}`);
    }
    await claimFreeEntry(makeProgram(buyers[1]), draw);
    const d0 = await adminProgram.account.drawV3.fetch(draw);
    log(`headline #${id}: ${d0.paidTickets}/${d0.minTickets} paid tickets — below the minimum`);

    await waitUntil(d0.drawAt.toNumber(), "draw_at");
    const a0 = await connection.getBalance(admin.publicKey);
    if (await requestDraw(adminProgram, draw)) fail("undersold headline draw was drawn instead of cancelled");
    const d = await adminProgram.account.drawV3.fetch(draw);
    if (statusName(d.status) !== "cancelled" || !d.prizePaid) fail("draw not cancelled with the prize returned");
    const back = (await connection.getBalance(admin.publicKey)) - a0;
    if (back < 0.02 * LAMPORTS_PER_SOL - 20_000) fail(`authority got ${back} lamports back, expected the 0.02 SOL prize (minus fee)`);
    log(`headline #${id} cancelled at draw time; prize returned to the authority`);

    const before = new Map<string, number>();
    for (const b of buyers) before.set(b.publicKey.toBase58(), await connection.getBalance(b.publicKey));
    await refundAll(adminProgram, draw); // permissionless; the admin pays the fees
    for (const b of buyers) {
      const k = b.publicKey.toBase58();
      const got = BigInt((await connection.getBalance(b.publicKey)) - before.get(k)!);
      if (got !== (paid.get(k) ?? 0n)) fail(`${k} refunded ${got}, paid ${paid.get(k)}`);
    }
    for (const { account: e } of await fetchEntries(adminProgram, draw)) {
      if (!e.isFree && !e.refunded) fail(`entry #${e.seq} not refunded`);
    }
    if ((await vaultFree(draw)) !== 0n) fail("vault not back to rent after refunds");
    log(`headline #${id}: every paid entry refunded in full, vault at rent`);
  } finally {
    await sweep(buyers);
  }
}

async function main() {
  log(`admin ${admin.publicKey}, balance ${sol(await connection.getBalance(admin.publicKey))} SOL`);
  if (only !== "headline") await potDraw();
  if (only !== "pot") await headlineUndersold();
  log(`done. admin balance ${sol(await connection.getBalance(admin.publicKey))} SOL`);
}

main().catch((e) => {
  console.error(e?.logs ? `${e.message}\n${e.logs.join("\n")}` : e);
  process.exit(1);
});
