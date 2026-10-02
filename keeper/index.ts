/**
 * DrawSol v3 keeper (SPEC-v3 §4). Signs with the dedicated low-balance keeper key set by `migrate-config` /
 * `set-keeper` — never the admin key. Each pass:
 *   1. reveals every rolled entry whose ORAO randomness is fulfilled (pot draws; instant wins paid to owners)
 *   2. at draw_at, requests the draw (keeper-only window first, then anyone) — or it cancels: no tickets /
 *      headline below min_tickets (refunds open, prize back to the authority)
 *   3. settles once the draw randomness is fulfilled; cancels if it never arrived (48 h after draw_at)
 *   4. creates tonight's pot draw (22:00 UTC, preset `nightly`) if no pot draw is open for sale
 *   5. posts results: stdout, the GitHub Actions job summary, and RESULTS_WEBHOOK_URL (JSON {text}) if set
 * Steps 1 and 3 are permissionless; after the public grace window so is 2 — anyone can run this loop.
 *
 * Run from the repo root (uses the root node_modules):
 *   npx tsx keeper/index.ts            loop forever (POLL_MS, default 15000)
 *   npx tsx keeper/index.ts --once     single pass (cron / GitHub Actions); ONCE=1 works too
 * Env: RPC_URL (default devnet); KEEPER_KEYPAIR (path) or KEEPER_SECRET (JSON array, CI);
 *      KEEPER_CREATE_POT=0 to never create pot draws; POT_HOUR_UTC (default 22).
 */
import * as fs from "fs";
import {
  POT_PRESETS,
  buildPotDraw,
  cancelIfStuck,
  configPda,
  createDraw,
  fetchDraws,
  iso,
  isDue,
  kindName,
  loadKeeperKeypair,
  log,
  makeProgram,
  nextDailyUtc,
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
const CREATE_POT = process.env.KEEPER_CREATE_POT !== "0";
const POT_HOUR_UTC = Number(process.env.POT_HOUR_UTC ?? 22);

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
    log("config missing or still in the v2 layout (run `admin.ts migrate-config`)");
    return;
  }
  const isKeeper = config.keeper.equals(me);
  const now = nowSecs();
  const draws = await fetchDraws(program);

  for (const { publicKey: draw, account: d } of draws) {
    const id = d.id.toNumber();
    const st = statusName(d.status);
    try {
      if (st === "cancelled") continue;
      if (d.rolledEntries > d.revealedEntries) await revealReady(program, draw);

      if (isDue(d, now)) {
        const allowed = isKeeper || d.authority.equals(me) || now >= publicFrom(d);
        if (!allowed) {
          log(`draw #${id} is due but this wallet is not the keeper; public from ${iso(publicFrom(d))}`);
        } else {
          await revealReady(program, draw); // last reveals before the pool rolls into the pot
          const req = await requestDraw(program, draw);
          if (!req) {
            const after = await program.account.drawV3.fetch(draw);
            post(`Draw #${id} (${kindName(d.kind)}) cancelled at draw time — ${after.nextTicket === 0 ? "no tickets" : `only ${after.paidTickets}/${after.minTickets} paid tickets; full refunds open`}`);
            continue;
          }
        }
      }

      const cur = await program.account.drawV3.fetch(draw);
      if (statusName(cur.status) === "drawing") {
        const r = await settleIfReady(program, draw);
        if (r) post(`Draw #${id} (${r.kind}) settled: ticket #${r.ticket} won ${sol(r.prize)} SOL → ${r.winner.toBase58()} (${r.sig})`);
        else if (await cancelIfStuck(program, draw, now)) post(`Draw #${id} cancelled: randomness never arrived; refunds open`);
      }
    } catch (err) {
      const e = err as Error & { logs?: string[] };
      log(`draw #${id}: ${e.message}${e.logs ? "\n" + e.logs.join("\n") : ""}`);
    }
  }

  // Tonight's pot draw: create one if no pot draw is open for sale.
  if (CREATE_POT && (isKeeper || config.admin.equals(me))) {
    const scheduled = draws.some(({ account: d }) => kindName(d.kind) === "pot" && statusName(d.status) === "open" && d.closesAt.toNumber() > now);
    if (!scheduled) {
      try {
        const shape = buildPotDraw(POT_PRESETS.nightly, {}, nextDailyUtc(POT_HOUR_UTC, now));
        const r = await createDraw(program, shape);
        post(`Pot draw #${r.id} created: closes and draws ${iso(shape.closesAt)} (terms_hash ${r.termsHash.toString("hex")}) ${r.sig}`);
      } catch (err) {
        const e = err as Error & { logs?: string[] };
        log(`creating the nightly pot draw failed: ${e.message}${e.logs ? "\n" + e.logs.join("\n") : ""}`);
      }
    }
  }
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
