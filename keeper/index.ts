/**
 * DrawSol v4 keeper (SPEC-v4 §5). Signs with the dedicated low-balance keeper key set by `set-keeper` —
 * never the admin key. Each pass, for every v4 draw:
 *   1. reveals every entry whose ORAO randomness is fulfilled (ticket numbers assigned, instant prizes paid)
 *   2. at draw_at, requests the end-prize draw (keeper-only window first, then anyone) — or it cancels when
 *      nothing was sold (escrow back to the authority)
 *   3. settles once the draw randomness is fulfilled and the winning entry is revealed; cancels if the
 *      randomness never arrived (48 h after draw_at)
 *   4. posts results: stdout, the GitHub Actions job summary, and RESULTS_WEBHOOK_URL (JSON {text}) if set
 * Steps 1 and 3 are permissionless; after the public grace window so is 2 — anyone can run this loop.
 * Creating and opening the next draw escrows the admin's money, so it stays an admin step
 * (`admin.ts create-scratch --preset weekly && admin.ts open --draw <id>`); the keeper only reports when no
 * draw is open for sale.
 *
 * Run from the repo root (uses the root node_modules):
 *   npx tsx keeper/index.ts            loop forever (POLL_MS, default 15000)
 *   npx tsx keeper/index.ts --once     single pass (cron / GitHub Actions); ONCE=1 works too
 * Env: RPC_URL (default devnet); KEEPER_KEYPAIR (path) or KEEPER_SECRET (JSON array, CI).
 */
import * as fs from "fs";
import {
  cancelIfStuck,
  configPda,
  fetchDraws,
  iso,
  isDue,
  loadKeeperKeypair,
  log,
  makeProgram,
  nowSecs,
  publicFrom,
  requestDraw,
  revealReady,
  settleIfReady,
  sleep,
  sol,
  statusName,
  type DrawsolProgram,
} from "../scripts/lib";

const POLL_MS = Number(process.env.POLL_MS || 15_000);
const ONCE = process.argv.includes("--once") || process.env.ONCE === "1";

const results: string[] = [];
function post(line: string) {
  log(line);
  results.push(line);
}

async function flushResults() {
  if (!results.length) return;
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, results.map((r) => `- ${r}`).join("\n") + "\n");
  }
  const url = process.env.RESULTS_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: results.join("\n") }) });
    } catch (e) {
      log("results webhook failed:", (e as Error).message);
    }
  }
  results.length = 0;
}

async function tick(program: DrawsolProgram) {
  const me = program.provider.publicKey!;
  const config = await program.account.config.fetchNullable(configPda()).catch(() => null);
  if (!config) {
    log("config missing (run `admin.ts init-config`)");
    return;
  }
  const isKeeper = config.keeper.equals(me);
  const now = nowSecs();
  const draws = await fetchDraws(program);

  for (const { publicKey: draw, account: d } of draws) {
    const id = d.id.toNumber();
    const st = statusName(d.status);
    try {
      if (st === "cancelled" || st === "draft") continue;
      if (d.revealedEntries < d.entryCount) await revealReady(program, draw);

      if (isDue(d, now)) {
        const allowed = isKeeper || d.authority.equals(me) || now >= publicFrom(d);
        if (!allowed) {
          log(`draw #${id} is due but this wallet is not the keeper; public from ${iso(publicFrom(d))}`);
        } else {
          const req = await requestDraw(program, draw);
          if (!req) {
            post(`Draw #${id} cancelled at draw time — no tickets; escrow returned`);
            continue;
          }
        }
      }

      const cur = await program.account.drawV4.fetch(draw);
      if (statusName(cur.status) === "drawing") {
        if (cur.revealedEntries < cur.entryCount) await revealReady(program, draw); // the winner must be revealed
        const r = await settleIfReady(program, draw);
        if (r) post(`Draw #${id} settled: position ${r.pos} → ticket #${r.ticket} won ${sol(r.prize)} SOL${r.fallback ? " (fallback pot)" : ""} → ${r.winner.toBase58()} (${r.sig})`);
        else if (await cancelIfStuck(program, draw, now)) post(`Draw #${id} cancelled: randomness never arrived; refunds open`);
      }
    } catch (err) {
      const e = err as Error & { logs?: string[] };
      log(`draw #${id}: ${e.message}${e.logs ? "\n" + e.logs.join("\n") : ""}`);
    }
  }

  const selling = draws.some(({ account: d }) => statusName(d.status) === "open" && d.closesAt.toNumber() > now);
  if (!selling) log("no draw is open for sale: create and open the next one with `admin.ts create-scratch --preset weekly` + `open`");
}

async function main() {
  const program = makeProgram(loadKeeperKeypair());
  const bal = await program.provider.connection.getBalance(program.provider.publicKey!);
  log(`keeper ${program.provider.publicKey} (${sol(bal)} SOL) on ${program.provider.connection.rpcEndpoint}, program ${program.programId}`);
  for (;;) {
    await tick(program);
    await flushResults();
    if (ONCE) return;
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
