/**
 * Live purchase smoke test for an OPEN v4 draw: funds throwaway buyers from the admin wallet, buys a few
 * entries (plus one free entry), waits for ORAO and reveals them, then prints the draw status.
 *
 *   npx tsx scripts/smoke-buy.ts --draw 7 [--buys 30,12] [--free]
 *
 * Buyer keys are written to $E2E_KEYS_DIR (default os.tmpdir()). Leftover SOL is swept back to the admin.
 */
import { Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ROOT, buyTickets, claimFreeEntry, drawPda, fetchEntries, loadKeypair, log, makeProgram, revealReady, sleep } from "./lib";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

async function main() {
  const id = Number(arg("draw", ""));
  if (!Number.isInteger(id)) throw new Error("--draw <id> is required");
  const buys = arg("buys", "30,12").split(",").map(Number);
  const wantFree = process.argv.includes("--free");
  const admin = loadKeypair();
  const adminProgram = makeProgram(admin);
  const connection = adminProgram.provider.connection;
  const draw = drawPda(id);
  const d0 = await adminProgram.account.drawV4.fetch(draw);
  const price = Number(d0.ticketPrice.toString()) / LAMPORTS_PER_SOL;

  const keysDir = process.env.E2E_KEYS_DIR || os.tmpdir();
  const buyers = buys.map(() => Keypair.generate());
  buyers.forEach((k, i) => fs.writeFileSync(path.join(keysDir, `drawsol-smoke-${id}-${i}.json`), JSON.stringify(Array.from(k.secretKey))));
  const fund = new Transaction().add(
    ...buyers.map((b, i) =>
      SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: b.publicKey, lamports: Math.round((buys[i] * price + 0.05) * LAMPORTS_PER_SOL) }),
    ),
  );
  log(`funded ${buyers.length} buyers ${await sendAndConfirmTransaction(connection, fund, [admin])}`);

  for (let i = 0; i < buyers.length; i++) {
    const r = await buyTickets(makeProgram(buyers[i]), draw, buys[i]);
    log(`buyer ${i} (${buyers[i].publicKey.toBase58().slice(0, 6)}…) bought ${buys[i]} tickets: entry #${r.seq} ${r.sig}`);
  }
  if (wantFree) {
    const f = await claimFreeEntry(makeProgram(buyers[0]), draw);
    log(`buyer 0 claimed a free entry: entry #${f.seq} ${f.sig}`);
  }

  for (let t = 0; t < 30; t++) {
    const pending = (await fetchEntries(adminProgram, draw)).filter(({ account: e }) => !e.revealed);
    if (!pending.length) break;
    await sleep(2000);
    await revealReady(adminProgram, draw);
  }
  for (const { account: e } of await fetchEntries(adminProgram, draw)) {
    if (!e.revealed) { log(`entry #${e.seq} still unrevealed`); continue; }
    const wins = Array.from(e.prizes as Uint8Array).map((p, i) => (p ? `#${e.tickets[i]}→tier${p}` : "")).filter(Boolean);
    log(`entry #${e.seq}: ${e.count} tickets ${e.tickets.slice(0, 8).join(",")}${e.count > 8 ? "…" : ""} · instant wins: ${wins.length ? wins.join(" ") : "none"} · paid ${Number(e.instantPaid.toString()) / LAMPORTS_PER_SOL} SOL`);
  }

  for (const b of buyers) {
    const bal = await connection.getBalance(b.publicKey);
    if (bal <= 5000) continue;
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: b.publicKey, toPubkey: admin.publicKey, lamports: bal - 5000 }));
    await sendAndConfirmTransaction(connection, tx, [b]).catch((e) => log(`sweep failed: ${e.message}`));
  }
  execFileSync("npx", ["tsx", "scripts/admin.ts", "status", "--draw", String(id)], { cwd: ROOT, stdio: "inherit" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
