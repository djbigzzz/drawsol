/**
 * DrawSol v2 keeper. Everything it does is permissionless — it holds no special authority and any
 * funded wallet can run it. Loop:
 *   1. reveal every paid entry whose ORAO randomness is fulfilled (instant wins paid to owners)
 *   2. request_draw for Open draws that are due (deadline passed or sold out)
 *   3. settle_draw once the grand-draw randomness is fulfilled
 *   4. cancel_draw if the grand-draw randomness never arrived (48 h after close)
 *
 * Run from the repo root (uses the root node_modules):  npx tsx keeper/index.ts
 * Env: RPC_URL (default devnet), KEYPAIR_PATH (default ~/.config/solana/id.json),
 *      POLL_MS (default 15000), ONCE=1 (single pass, for cron).
 */
import {
  cancelIfStuck,
  configPda,
  drawPda,
  isDue,
  log,
  makeProgram,
  requestDraw,
  revealReady,
  settleIfReady,
  sleep,
  statusName,
  type DrawsolProgram,
} from "../scripts/lib";

const POLL_MS = Number(process.env.POLL_MS || 15_000);

async function tick(program: DrawsolProgram) {
  const config = await program.account.config.fetchNullable(configPda());
  if (!config) {
    log("config not initialised yet");
    return;
  }
  for (let id = 0; id < config.nextDrawId.toNumber(); id++) {
    const draw = drawPda(id);
    try {
      let d = await program.account.draw.fetch(draw);
      const st = statusName(d.status);
      if (st === "settled" && d.reserveWithdrawn) continue; // finished
      if (st === "cancelled" && d.reserveWithdrawn) continue;

      if (d.paidEntries > d.revealedEntries && !d.reserveWithdrawn) await revealReady(program, draw);

      if (isDue(d)) {
        await requestDraw(program, draw);
        d = await program.account.draw.fetch(draw);
      }
      if (statusName(d.status) === "drawing") {
        if (!(await settleIfReady(program, draw))) await cancelIfStuck(program, draw);
      }
    } catch (err) {
      const e = err as Error & { logs?: string[] };
      log(`draw #${id}: ${e.message}${e.logs ? "\n" + e.logs.join("\n") : ""}`);
    }
  }
}

async function main() {
  const program = makeProgram();
  log(`keeper ${program.provider.publicKey} on ${program.provider.connection.rpcEndpoint}, program ${program.programId}`);
  for (;;) {
    await tick(program);
    if (process.env.ONCE === "1") return;
    await sleep(POLL_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
