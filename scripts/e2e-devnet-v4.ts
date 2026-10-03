/**
 * End-to-end run of one DrawSol v4 draw on devnet against the real ORAO VRF (SPEC-v4):
 *
 *   create-scratch (small, cheap parameters) → open (escrow) → fund 3 throwaway buyers → purchases incl. one
 *   1000-ticket entry, a small one and a free entry → every reveal verified against the off-chain
 *   recomputation (tickets from the pool state, prizes from the schedule, lamports moved) → wait for draw_at
 *   → request_draw → settle_draw (fallback pot or the full end prize, see --outcome) with the winning
 *   position → ticket mapping checked → withdraw → vault back to rent.
 *
 *   npx tsx scripts/e2e-devnet-v4.ts [--minutes 8] [--outcome fallback|full]
 *
 * Signer: KEYPAIR_PATH (the admin; it is also the draw authority, so it may request inside the keeper window).
 * Costs ≈ 0.6 SOL of devnet SOL (escrow comes back; ticket money is withdrawn as the house share; the buyers'
 * leftovers are swept back; entry rent (~0.04 SOL for a 1000-ticket entry) and ORAO fees are spent).
 * Throwaway keypairs are written to $E2E_KEYS_DIR (default os.tmpdir()) and swept back at the end.
 */
import { BN } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ROOT, SCHEDULE_TIER_MASK, SCHEDULE_WON_BIT, big, buyTickets, claimFreeEntry, configPda, drawPda, expectedReveal, fetchEntries,
  fetchPool, fetchSchedule, loadKeypair, log, makeProgram, nowSecs, readRandomness, requestDraw, revealEntry, scheduleHash,
  settleIfReady, sleep, sol, statusName, usedTiers, vaultPda, winningPosition, withdraw, type DrawsolProgram,
} from "./lib";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const minutes = arg("minutes", "8");
const outcome = arg("outcome", "fallback") as "fallback" | "full";
const keysDir = process.env.E2E_KEYS_DIR || os.tmpdir();

// Cheap devnet parameters: 0.0001 SOL tickets, cap 1200, min 1100 (full prize needs ≥ 1100 paid),
// end prize = 1100 × 0.0001 × 35% = 0.0385 SOL, schedule 0.001×2 + 0.0005×4 = 0.004 SOL (≤ 10% × 1200 × 0.0001).
const PRICE = 0.0001;
const CAP = 1200;
const MIN = 1100;
const PRIZE = 0.0385;
const TIERS = "0.001x2,0.0005x4"; // with --usd-rate 1 the tier amounts are SOL

const admin = loadKeypair();
const adminProgram = makeProgram(admin);
const connection = adminProgram.provider.connection;

function fail(msg: string): never {
  throw new Error(`E2E FAILED: ${msg}`);
}

async function vaultFree(draw: PublicKey) {
  return BigInt(await connection.getBalance(vaultPda(draw))) - BigInt(await connection.getMinimumBalanceForRentExemption(8));
}

async function fundBuyers(tag: string, amounts: number[]) {
  const buyers = amounts.map(() => Keypair.generate());
  buyers.forEach((k, i) => fs.writeFileSync(path.join(keysDir, `drawsol-e2e4-${tag}-${i}.json`), JSON.stringify(Array.from(k.secretKey))));
  const tx = new Transaction().add(
    ...buyers.map((b, i) => SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: b.publicKey, lamports: Math.round(amounts[i] * LAMPORTS_PER_SOL) })),
  );
  log(`funded ${buyers.length} buyers (${tag}) ${await sendAndConfirmTransaction(connection, tx, [admin])}`);
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

function cli(args: string[]) {
  execFileSync("npx", ["tsx", "scripts/admin.ts", ...args], { cwd: ROOT, stdio: "inherit" });
}

async function waitUntil(unix: number, what: string) {
  while (nowSecs() < unix) {
    log(`waiting for ${what} (${unix - nowSecs()} s)`);
    await sleep(Math.min(30_000, Math.max(1000, (unix - nowSecs() + 2) * 1000)));
  }
}

/** Waits for an entry's randomness, recomputes its reveal from the pool/schedule state, reveals, compares. */
async function revealAndVerify(program: DrawsolProgram, draw: PublicKey, entry: PublicKey) {
  const e = await program.account.entryV4.fetch(entry);
  let rnd: Buffer | null = null;
  for (let t = 0; t < 90 && !(rnd = await readRandomness(connection, e.vrfRequest, e.vrfSeed)); t++) await sleep(2000);
  if (!rnd) fail(`entry #${e.seq}: randomness never fulfilled`);
  const before = await program.account.drawV4.fetch(draw);
  const pool = await fetchPool(connection, draw, before.ticketCap);
  const schedule = await fetchSchedule(connection, draw, before.ticketCap);
  const exp = expectedReveal(rnd, e.count, pool, schedule, before.tiers);
  const owner0 = BigInt(await connection.getBalance(e.owner));
  const vault0 = await vaultFree(draw);
  const sig = await revealEntry(program, draw, entry, e);
  const after = await program.account.entryV4.fetch(entry);
  const d = await program.account.drawV4.fetch(draw);
  if (after.tickets.join(",") !== exp.tickets.join(",")) fail(`entry #${e.seq}: tickets differ from the recomputation`);
  if (after.prizes.join(",") !== exp.prizes.join(",")) fail(`entry #${e.seq}: prizes differ from the recomputation`);
  if (big(after.instantPaid) !== exp.owed) fail(`entry #${e.seq}: instant_paid ${after.instantPaid} != owed ${exp.owed}`);
  if (BigInt(await connection.getBalance(e.owner)) - owner0 !== exp.owed) fail(`entry #${e.seq}: owner did not receive exactly ${exp.owed}`);
  if (vault0 - (await vaultFree(draw)) !== exp.owed) fail(`entry #${e.seq}: vault did not drop by ${exp.owed}`);
  if (new Set(after.tickets).size !== e.count || after.tickets.some((t) => t >= before.ticketCap)) fail(`entry #${e.seq}: tickets not distinct / in range`);
  const poolAfter = await fetchPool(connection, draw, before.ticketCap);
  if (poolAfter.remaining !== pool.remaining - e.count) fail(`entry #${e.seq}: pool remaining did not drop by ${e.count}`);
  if (after.tickets.some((t) => poolAfter.numbers.slice(0, poolAfter.remaining).includes(t))) fail(`entry #${e.seq}: an assigned number is still in the pool`);
  const schedAfter = await fetchSchedule(connection, draw, before.ticketCap);
  for (let i = 0; i < e.count; i++) {
    const t = after.tickets[i];
    if ((schedAfter[t] & SCHEDULE_TIER_MASK) !== after.prizes[i]) fail(`entry #${e.seq}: schedule tier of ticket ${t} != recorded prize`);
    if (after.prizes[i] && !(schedAfter[t] & SCHEDULE_WON_BIT)) fail(`entry #${e.seq}: won bit of ticket ${t} not set`);
  }
  if (big(d.instantsPaid) - big(before.instantsPaid) !== exp.owed) fail(`entry #${e.seq}: draw.instants_paid did not grow by ${exp.owed}`);
  const wins = after.prizes.filter((p) => p > 0).length;
  log(`entry #${e.seq} verified: ${e.count} ticket(s) [${after.tickets.slice(0, 10).join(",")}${e.count > 10 ? ",…" : ""}], ${wins} instant win(s), ${sol(after.instantPaid)} SOL ${sig}`);
  return exp.owed;
}

async function main() {
  log(`admin ${admin.publicKey}, balance ${sol(await connection.getBalance(admin.publicKey))} SOL`);
  const id = (await adminProgram.account.config.fetch(configPda())).nextDrawId.toNumber();
  cli(["create-scratch", "--preset", "weekly", "--price", String(PRICE), "--cap", String(CAP), "--min", String(MIN), "--prize", String(PRIZE),
    "--tiers", TIERS, "--usd-rate", "1", "--per-tx", "1000", "--per-wallet", "2000", "--free-cap", "5", "--minutes", minutes]);
  const draw = drawPda(id);
  let d = await adminProgram.account.drawV4.fetch(draw);
  if (statusName(d.status) !== "draft") fail("draw not in Draft after create-scratch");
  const pool0 = await fetchPool(connection, draw, d.ticketCap);
  if (pool0.remaining !== CAP || pool0.numbers.some((n, i) => n !== i)) fail("pool not initialised 0..cap");
  const schedule0 = await fetchSchedule(connection, draw, d.ticketCap);
  const registered = [...schedule0].filter((b) => b !== 0).length;
  if (registered !== 6 || d.scheduleSet !== 6) fail(`schedule has ${registered}/${d.scheduleSet} numbers, expected 6`);
  log(`draw #${id} draft complete: pool ${pool0.remaining}/${CAP}, schedule hash ${scheduleHash(schedule0).toString("hex")}`);

  const a0 = await connection.getBalance(admin.publicKey);
  cli(["open", "--draw", String(id)]);
  d = await adminProgram.account.drawV4.fetch(draw);
  const escrow = big(d.endPrizeLamports) + big(d.scheduleTotalLamports);
  if (statusName(d.status) !== "open") fail("draw not Open");
  if ((await vaultFree(draw)) !== escrow) fail(`vault holds ${await vaultFree(draw)}, expected the escrow ${escrow}`);
  if (BigInt(a0 - (await connection.getBalance(admin.publicKey))) < escrow) fail("the authority did not pay the escrow");
  log(`draw #${id} open: escrow ${sol(escrow)} SOL, closes ${new Date(d.closesAt.toNumber() * 1000).toISOString()}`);
  cli(["terms", "--draw", String(id)]);

  // buyer 0: 1000 tickets (0.1 SOL + ~0.04 rent + ORAO fee); buyer 1: 60 or 100; buyer 2: 5 + a free entry
  const second = outcome === "full" ? 100 : 60; // paid total 1105 ≥ 1100 (full) or 1065 < 1100 (fallback)
  const buyers = await fundBuyers(`d${id}`, [0.2, 0.03, 0.02]);
  try {
    const entries: PublicKey[] = [];
    for (const [bi, qty] of [[0, 1000], [1, second], [2, 5]] as [number, number][]) {
      const r = await buyTickets(makeProgram(buyers[bi]), draw, qty);
      log(`buyer ${bi} bought ${qty} (entry #${r.seq}, positions ${r.firstPos}–${r.firstPos + qty - 1}) ${r.sig}`);
      entries.push(r.entry);
    }
    const free = await claimFreeEntry(makeProgram(buyers[2]), draw);
    log(`buyer 2 claimed a free entry (entry #${free.seq}, position ${free.pos}) ${free.sig}`);
    entries.push(free.entry);
    d = await adminProgram.account.drawV4.fetch(draw);
    const paid = 1005 + second;
    if (d.paidTickets !== paid || d.freeTickets !== 1 || d.nextPos !== paid + 1) fail("draw counters after sales");
    if ((await vaultFree(draw)) !== escrow + BigInt(paid) * BigInt(PRICE * LAMPORTS_PER_SOL)) fail("vault after sales != escrow + revenue");

    let instants = 0n;
    for (const entry of entries) instants += await revealAndVerify(adminProgram, draw, entry);
    d = await adminProgram.account.drawV4.fetch(draw);
    if (d.revealedEntries !== 4 || d.assigned !== paid + 1) fail("not everything revealed");
    const allTickets = (await fetchEntries(adminProgram, draw)).flatMap((e) => e.account.tickets);
    if (new Set(allTickets).size !== allTickets.length) fail("a ticket number was assigned twice");
    const wonTiers = usedTiers(d).map((t) => t.won);
    log(`all 4 entries revealed: ${allTickets.length} distinct numbers, instants paid ${sol(instants)} SOL, won per tier ${wonTiers.join("/")}`);

    // Draw at draw_at (the admin is the authority, so it may request inside the keeper window).
    await waitUntil(d.drawAt.toNumber(), "draw_at");
    await requestDraw(adminProgram, draw);
    const pre = await adminProgram.account.drawV4.fetch(draw);
    const fallback = pre.paidTickets < pre.minTickets;
    if (fallback !== (outcome === "fallback")) fail(`expected the ${outcome} path (paid ${pre.paidTickets}, min ${pre.minTickets})`);
    const prize = fallback ? (big(pre.revenue) * BigInt(pre.potBps)) / 10_000n : big(pre.endPrizeLamports);
    const balances = new Map<string, bigint>();
    for (const b of buyers) balances.set(b.publicKey.toBase58(), BigInt(await connection.getBalance(b.publicKey)));
    const auth0 = BigInt(await connection.getBalance(admin.publicKey));
    let settled = null;
    for (let t = 0; t < 90 && !(settled = await settleIfReady(adminProgram, draw)); t++) await sleep(2000);
    if (!settled) fail("draw never settled");
    d = await adminProgram.account.drawV4.fetch(draw);
    if (statusName(d.status) !== "settled") fail(`status ${statusName(d.status)}`);
    const rnd = (await readRandomness(connection, d.drawVrfRequest, d.drawVrfSeed))!;
    const pos = winningPosition(rnd, d.nextPos);
    const win = (await fetchEntries(adminProgram, draw)).find((e) => pos >= e.account.firstPos && pos < e.account.firstPos + e.account.count)!;
    if (d.winningPos !== pos || d.winningTicket !== win.account.tickets[pos - win.account.firstPos]) fail("winning position → ticket mapping");
    if (!d.winner.equals(win.account.owner) || !d.winningEntry.equals(win.publicKey)) fail("winner / winning entry");
    if (big(d.endPrizePaid) !== prize) fail(`prize ${d.endPrizePaid} != ${prize}`);
    const wk = d.winner.toBase58();
    if (balances.has(wk) && BigInt(await connection.getBalance(d.winner)) - balances.get(wk)! !== prize) fail("winner did not receive the prize");
    const expectedBack = (fallback ? big(pre.endPrizeLamports) : 0n) + big(pre.scheduleTotalLamports) - big(pre.instantsPaid);
    const back = BigInt(await connection.getBalance(admin.publicKey)) - auth0;
    if (back < expectedBack - 20_000n || back > expectedBack) fail(`authority got ${back} back, expected ${expectedBack} (minus the settle fee)`);
    if (!d.escrowReturned || !d.instantEscrowReturned) fail("escrow flags");
    const house = big(pre.revenue) - (fallback ? prize : 0n);
    if (big(d.houseLamports) !== house || (await vaultFree(draw)) !== house) fail("after settlement the vault should hold exactly the house share");
    log(`draw #${id} settled and verified: position ${pos} → ticket #${d.winningTicket} → ${wk} won ${sol(prize)} SOL (${fallback ? "fallback pot" : "full end prize"}); house ${sol(house)} SOL`);

    const sig = await withdraw(adminProgram, draw);
    if ((await vaultFree(draw)) !== 0n) fail("vault not back to rent after withdraw");
    log(`draw #${id}: house share withdrawn ${sig}; vault at rent`);
    cli(["status", "--draw", String(id)]);
  } finally {
    await sweep(buyers);
  }
  log(`done. admin balance ${sol(await connection.getBalance(admin.publicKey))} SOL`);
}

main().catch((e) => {
  console.error(e?.logs ? `${e.message}\n${e.logs.join("\n")}` : e);
  process.exit(1);
});

// keep BN referenced for readers of the type signatures above
void BN;
