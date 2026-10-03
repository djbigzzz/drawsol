/**
 * DrawSol v4 admin CLI.  Usage:  npx tsx scripts/admin.ts <command> [flags]
 *
 *   init-config --keeper <pubkey>             fresh deployments only (signer = upgrade authority)
 *   set-keeper --keeper <pubkey>
 *   create-scratch --preset weekly [overrides] [--dry-run]
 *                                             create (Draft) → fill the pool → pick + register the winning
 *                                             numbers → write scripts/terms/draw-<id>.{md,json}. Then `open`.
 *   setup --draw id                           resume an interrupted create-scratch (pool chunks / schedule batches)
 *   open --draw id                            Draft → Open: escrows end prize + schedule total (signer = authority)
 *   status [--draw id]
 *   withdraw --draw id
 *   reveal-all --draw id
 *   run-draw --draw id [--timeout s]          reveal, request_draw when due, wait for ORAO, settle_draw
 *   refund-all --draw id                      claim_refund for every entry of a cancelled draw (permissionless)
 *   cancel --draw id                          cancel a Draft (authority) or a Drawing draw stuck > 48 h (anyone)
 *   legacy-close-v3 --draw id                 close a v3 draw (#2 settled, #3 cancelled, #4–#6 empty) into the admin
 *   terms --draw id                           re-render a draw's terms from chain + terms file, check terms_hash
 *
 * create-scratch overrides: --prize SOL (default $prizeUsd / usd-rate) --price SOL --cap N --min N --per-tx N
 *   --per-wallet N --free-cap N --grace-min M --house BPS --pot BPS --instant BPS
 *   --tiers "25x2,10x4,5x8,2x15,1x40" (USD × count) --usd-rate R (SOL price in USD, default 119.30)
 *   timing: --closes <ISO|unix> --draw-at <ISO|unix>, or --minutes M (close in M minutes) [--draw-delay-min D];
 *   default: next Sunday 20:00 UTC, draw_at = closes_at.
 *
 * Env: RPC_URL (default devnet), KEYPAIR_PATH (default ~/.config/solana/id.json).
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  CANCEL_GRACE_SECS,
  PRESETS,
  ROOT,
  RPC_URL,
  SCHEDULE_TIER_MASK,
  SCHEDULE_WON_BIT,
  big,
  buildDraw,
  cancelIfStuck,
  configPda,
  createDraw,
  currentPrize,
  drawPda,
  fetchEntries,
  fetchLegacyDrawV3,
  fetchPool,
  fetchSchedule,
  initPoolAll,
  iso,
  isDue,
  legacyV3DrawPda,
  legacyV3VaultPda,
  makeProgram,
  nextWeeklyUtc,
  nowSecs,
  openDraw,
  parseTiers,
  pickSchedule,
  programDataPda,
  publicFrom,
  readRandomness,
  refundAll,
  renderParameters,
  renderTerms,
  requestDraw,
  revealReady,
  scheduleHash,
  scheduleSeed,
  scheduleTotal,
  setScheduleAll,
  settleIfReady,
  sha256,
  shapeFromChain,
  shapeFromJson,
  shapeToJson,
  sleep,
  sol,
  statusName,
  termsPaths,
  usedTiers,
  vaultPda,
  withdraw as withdrawIx,
  winningPosition,
  type DrawAccount,
  type DrawShape,
  type DrawsolProgram,
  type TermsFile,
} from "./lib";

type Flags = Record<string, string>;

function parseFlags(argv: string[]) {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    const k = argv[i].slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
    else flags[k] = "true";
  }
  return flags;
}
const num = (f: Flags, k: string) => (f[k] !== undefined ? Number(f[k]) : undefined);
const time = (v: string | undefined) => (v === undefined ? undefined : /^\d+$/.test(v) ? Number(v) : Math.floor(Date.parse(v) / 1000));
const drawId = (f: Flags) => {
  if (f.draw === undefined) throw new Error("--draw <id> is required");
  return Number(f.draw);
};
const keeperFlag = (f: Flags) => {
  if (!f.keeper) throw new Error("--keeper <pubkey> is required");
  return new PublicKey(f.keeper);
};

/** --minutes / --closes / --draw-at handling. */
function timing(f: Flags) {
  const minutes = num(f, "minutes");
  const closesAt = minutes !== undefined ? nowSecs() + Math.round(minutes * 60) : time(f.closes);
  const delay = num(f, "draw-delay-min");
  const drawAt = time(f["draw-at"]) ?? (closesAt !== undefined && delay !== undefined ? closesAt + Math.round(delay * 60) : undefined);
  return { closesAt, drawAt };
}

function readTermsFile(id: number): TermsFile | null {
  const p = termsPaths(id).json;
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as TermsFile) : null;
}

// ------------------------------------------------------------------ config

async function initConfig(program: DrawsolProgram, f: Flags) {
  const sig = await program.methods
    .initConfig(keeperFlag(f))
    .accountsPartial({ config: configPda(), admin: program.provider.publicKey!, program: program.programId, programData: programDataPda() })
    .rpc();
  console.log(`config initialised, admin = ${program.provider.publicKey} ${sig}`);
}

async function setKeeper(program: DrawsolProgram, f: Flags) {
  const sig = await program.methods.setKeeper(keeperFlag(f)).accountsPartial({ config: configPda(), admin: program.provider.publicKey! }).rpc();
  console.log(`keeper set to ${f.keeper} ${sig}`);
}

// ------------------------------------------------------------------ create-scratch / setup / open

function shapeFromFlags(f: Flags): DrawShape {
  const preset = PRESETS[f.preset ?? ""];
  if (!preset) throw new Error(`--preset ${Object.keys(PRESETS).join("|")} is required`);
  const { closesAt, drawAt } = timing(f);
  return buildDraw(preset, {
    prize: num(f, "prize"), price: num(f, "price"), cap: num(f, "cap"), minTickets: num(f, "min"), perTx: num(f, "per-tx"),
    perWallet: num(f, "per-wallet"), freeCap: num(f, "free-cap"), graceMin: num(f, "grace-min"), houseBps: num(f, "house"),
    potBps: num(f, "pot"), instantBps: num(f, "instant"), usdRate: num(f, "usd-rate"), tiers: f.tiers ? parseTiers(f.tiers) : undefined,
    closesAt, drawAt,
  }, nextWeeklyUtc(0, 20));
}

function describeShape(id: number, s: DrawShape) {
  return `draw #${id}: ${s.ticketCap} × ${sol(s.ticketPrice)} SOL, min ${s.minTickets}, end prize ${sol(s.endPrizeLamports)} SOL, ` +
    `schedule ${sol(scheduleTotal(s.tiers))} SOL over ${s.tiers.reduce((a, t) => a + t.count, 0)} numbers, split ${s.houseBps}/${s.potBps}/${s.instantBps}, ` +
    `closes ${iso(s.closesAt)}, draws ${iso(s.drawAt)}`;
}

/** Continues the Draft setup: pool chunks, schedule batches. */
async function fillDraft(program: DrawsolProgram, id: number, draw: PublicKey, numbers: number[][]) {
  const chunks = await initPoolAll(program, draw, (from, to, sig) => console.log(`  init_pool(${from}, ${to}) ${sig}`));
  console.log(`pool: ${chunks.length} chunk(s) sent`);
  const batches = await setScheduleAll(program, draw, numbers, (n, sig) => console.log(`  set_schedule(${n} numbers) ${sig}`));
  console.log(`schedule: ${batches} batch(es) sent`);
  const d = await program.account.drawV4.fetch(draw);
  const pool = await fetchPool(program.provider.connection, draw, d.ticketCap);
  const ready = pool.remaining === d.ticketCap && d.tiers.every((t) => t.set === t.count);
  console.log(`draw #${id}: pool ${pool.remaining}/${d.ticketCap}, schedule ${d.scheduleSet}/${usedTiers(d).reduce((a, t) => a + t.count, 0)} — ` +
    (ready ? `ready: npx tsx scripts/admin.ts open --draw ${id}` : "NOT complete; rerun `setup --draw " + id + "`"));
}

async function createScratch(program: DrawsolProgram, f: Flags) {
  const shape = shapeFromFlags(f);
  const config = await program.account.config.fetch(configPda());
  const id = config.nextDrawId.toNumber();
  console.log(describeShape(id, shape));
  if (f["dry-run"]) {
    const parameters = renderParameters(id, shape);
    const numbers = pickSchedule(scheduleSeed(id, parameters), shape.ticketCap, shape.tiers);
    const terms = renderTerms(id, shape, numbers);
    console.log(terms);
    console.log(`terms_hash ${sha256(terms).toString("hex")}`);
    return;
  }
  const r = await createDraw(program, shape);
  const out = termsPaths(r.id);
  fs.mkdirSync(path.dirname(out.md), { recursive: true });
  fs.writeFileSync(out.md, r.terms);
  const file: TermsFile = {
    id: r.id, draw: r.draw.toBase58(), shape: shapeToJson(shape), numbers: r.numbers,
    termsHash: r.termsHash.toString("hex"), scheduleSeed: r.seed.toString("hex"),
  };
  fs.writeFileSync(out.json, JSON.stringify(file, null, 2) + "\n");
  console.log(`created draft draw #${r.id} at ${r.draw} ${r.sig}\nterms saved to ${path.relative(ROOT, out.md)} (hash ${file.termsHash})`);
  await fillDraft(program, r.id, r.draw, r.numbers);
}

async function setup(program: DrawsolProgram, f: Flags) {
  const id = drawId(f);
  const t = readTermsFile(id);
  if (!t) throw new Error(`no scripts/terms/draw-${id}.json (the winning numbers live there)`);
  const draw = drawPda(id);
  const d = await program.account.drawV4.fetch(draw);
  if (statusName(d.status) !== "draft") throw new Error(`draw #${id} is ${statusName(d.status)}`);
  if (Buffer.from(d.termsHash).toString("hex") !== t.termsHash) throw new Error("terms file does not match the on-chain terms_hash");
  await fillDraft(program, id, draw, t.numbers);
}

async function open(program: DrawsolProgram, f: Flags) {
  const id = drawId(f);
  const draw = drawPda(id);
  const d = await program.account.drawV4.fetch(draw);
  const escrow = big(d.endPrizeLamports) + big(d.scheduleTotalLamports);
  const schedule = await fetchSchedule(program.provider.connection, draw, d.ticketCap);
  console.log(`opening draw #${id}: escrowing ${sol(escrow)} SOL (end prize ${sol(d.endPrizeLamports)} + schedule ${sol(d.scheduleTotalLamports)}); ` +
    `schedule hash ${scheduleHash(schedule).toString("hex")}`);
  const sig = await openDraw(program, draw);
  console.log(`draw #${id} is OPEN ${sig}`);
}

// ------------------------------------------------------------------ status

function describe(id: number, draw: PublicKey, d: DrawAccount, vaultBal: number, now: number) {
  const st = statusName(d.status);
  const lines = [`\n#${id} ${draw}  [${st.toUpperCase()}]${isDue(d, now) ? "  ← DUE: run-draw" : ""}`];
  lines.push(`  price ${sol(d.ticketPrice)} · paid ${d.paidTickets} · free ${d.freeTickets}/${d.freeCap} · positions ${d.nextPos}/${d.ticketCap} · ` +
    `entries ${d.entryCount} (revealed ${d.revealedEntries}, tickets assigned ${d.assigned})`);
  lines.push(`  closes ${iso(d.closesAt)} · draw ${iso(d.drawAt)} · public after ${iso(publicFrom(d))}`);
  lines.push(`  end prize ${sol(d.endPrizeLamports)} · min ${d.minTickets} paid (${d.paidTickets >= d.minTickets ? "reached" : `fallback pot ${sol(currentPrize(d))}`}) · ` +
    `split ${d.houseBps}/${d.potBps}/${d.instantBps}`);
  lines.push(`  schedule ${sol(d.scheduleTotalLamports)} over ${d.scheduleSet} numbers · instants paid ${sol(d.instantsPaid)} · ` +
    usedTiers(d).map((t) => `${sol(t.amount)}×${t.count} (set ${t.set}, won ${t.won})`).join(", "));
  lines.push(`  vault ${sol(vaultBal)} · revenue ${sol(d.revenue)} · house ${sol(d.houseLamports)} (withdrawn ${sol(d.houseWithdrawn)}) · ` +
    `refunded ${sol(d.refundedLamports)} · escrow returned ${d.escrowReturned}/${d.instantEscrowReturned}`);
  if (st === "settled") lines.push(`  winner ${d.winner} · position ${d.winningPos} → ticket #${d.winningTicket} · paid ${sol(d.endPrizePaid)} SOL`);
  return lines;
}

async function status(program: DrawsolProgram, f: Flags) {
  const conn = program.provider.connection;
  console.log(`RPC ${RPC_URL}, program ${program.programId}`);
  const c = await program.account.config.fetchNullable(configPda());
  if (!c) return console.log("config: not initialised");
  console.log(`config: admin ${c.admin}, keeper ${c.keeper}, next draw id ${c.nextDrawId}`);
  const now = nowSecs();
  const ids = f.draw !== undefined ? [Number(f.draw)] : [...Array(c.nextDrawId.toNumber()).keys()];
  for (const id of ids) {
    const legacy = await fetchLegacyDrawV3(conn, id);
    if (legacy) {
      console.log(`\n#${id} LEGACY v3 ${legacy.kind} ${legacy.draw} [${legacy.status.toUpperCase()}] entries ${legacy.entryCount}, ` +
        `${sol(legacy.drawLamports + legacy.vaultLamports)} SOL in draw + vault — ${legacy.closable ? "closable: legacy-close-v3" : "NOT closable"}`);
      continue;
    }
    const draw = drawPda(id);
    const d = await program.account.drawV4.fetchNullable(draw);
    if (!d) {
      console.log(`\n#${id}: no account (closed legacy draw)`);
      continue;
    }
    const vaultBal = await conn.getBalance(vaultPda(draw));
    for (const l of describe(id, draw, d, vaultBal, now)) console.log(l);
    const st = statusName(d.status);
    if (st === "draft") {
      const pool = await fetchPool(conn, draw, d.ticketCap);
      console.log(`  pool ${pool.remaining}/${d.ticketCap} initialised · schedule ${d.scheduleSet}/${usedTiers(d).reduce((a, t) => a + t.count, 0)} registered`);
    }
    if (st === "drawing") {
      const rnd = await readRandomness(conn, d.drawVrfRequest, d.drawVrfSeed);
      console.log(`  ORAO request ${d.drawVrfRequest}: ${rnd ? `fulfilled → winning position ${winningPosition(rnd, d.nextPos)}` : "pending"}`);
      if (now > d.drawAt.toNumber() + CANCEL_GRACE_SECS) console.log("  randomness grace period over: cancel is allowed");
    }
    if (st === "cancelled") {
      let owed = 0n;
      for (const { account: e } of await fetchEntries(program, draw)) {
        if (e.refunded) continue;
        const a = big(e.paidLamports) - big(e.instantPaid);
        if (a > 0n) owed += a;
      }
      const rent = BigInt(await conn.getMinimumBalanceForRentExemption(8));
      const free = BigInt(vaultBal) - rent;
      console.log(`  refunds outstanding ${sol(owed)} SOL; vault above rent ${sol(free)} SOL` +
        (owed > free ? `  ← SHORTFALL ${sol(owed - free)} SOL: top up the vault ${vaultPda(draw)}` : ""));
    }
  }
}

// ------------------------------------------------------------------ actions

async function withdrawCmd(program: DrawsolProgram, f: Flags) {
  const draw = drawPda(drawId(f));
  const before = await program.provider.connection.getBalance(program.provider.publicKey!);
  const sig = await withdrawIx(program, draw);
  const after = await program.provider.connection.getBalance(program.provider.publicKey!);
  console.log(`withdrew ≈${sol(after - before)} SOL (net of fee) ${sig}`);
}

async function revealAll(program: DrawsolProgram, f: Flags) {
  const draw = drawPda(drawId(f));
  const n = await revealReady(program, draw);
  const pending = (await fetchEntries(program, draw)).filter((e) => !e.account.revealed).length;
  console.log(`revealed ${n}; ${pending} entries still unrevealed (randomness pending or reveal failed)`);
}

async function runDraw(program: DrawsolProgram, f: Flags) {
  const draw = drawPda(drawId(f));
  let d = await program.account.drawV4.fetch(draw);
  if (statusName(d.status) === "open") {
    if (!isDue(d)) throw new Error(`draw #${d.id} is not due until ${iso(d.drawAt)}`);
    await revealReady(program, draw);
    if (!(await requestDraw(program, draw))) return;
  }
  d = await program.account.drawV4.fetch(draw);
  if (statusName(d.status) !== "drawing") return console.log(`draw #${d.id} is ${statusName(d.status)}; nothing to do`);
  const deadline = Date.now() + (num(f, "timeout") ?? 300) * 1000;
  while (Date.now() < deadline) {
    await revealReady(program, draw); // the winning entry must be revealed before settle
    if (await settleIfReady(program, draw)) return;
    console.log("waiting for ORAO fulfilment…");
    await sleep(3000);
  }
  throw new Error("timed out waiting for randomness; rerun `run-draw` later (settle is permissionless)");
}

async function refundAllCmd(program: DrawsolProgram, f: Flags) {
  const total = await refundAll(program, drawPda(drawId(f)));
  console.log(`refunded ${sol(total)} SOL in total`);
}

async function cancel(program: DrawsolProgram, f: Flags) {
  const id = drawId(f);
  const draw = drawPda(id);
  const d = await program.account.drawV4.fetch(draw);
  const st = statusName(d.status);
  if (st === "draft") {
    const sig = await program.methods.cancelDraw().accountsPartial({ draw, signer: program.provider.publicKey! }).rpc();
    return console.log(`draft draw #${id} cancelled ${sig}`);
  }
  if (st === "drawing") {
    if (!(await cancelIfStuck(program, draw))) throw new Error(`draw #${id} is Drawing but not cancellable yet (48 h after draw_at, randomness still pending)`);
    return;
  }
  throw new Error(`draw #${id} is ${st}: nothing to cancel`);
}

async function legacyCloseV3(program: DrawsolProgram, f: Flags) {
  const id = drawId(f);
  const legacy = await fetchLegacyDrawV3(program.provider.connection, id);
  if (!legacy) throw new Error(`no v3 draw #${id}`);
  if (!legacy.closable) throw new Error(`v3 draw #${id} is ${legacy.status} with ${legacy.entryCount} entries and liabilities: not closable`);
  const draw = legacyV3DrawPda(id);
  const sig = await program.methods
    .legacyCloseV3(new BN(id))
    .accountsPartial({ config: configPda(), admin: program.provider.publicKey!, legacyDraw: draw, legacyVault: legacyV3VaultPda(draw) })
    .rpc();
  console.log(`closed v3 draw #${id} (${legacy.kind}, ${legacy.status}): ${sol(legacy.drawLamports + legacy.vaultLamports)} SOL returned to the admin ${sig}`);
}

async function terms(program: DrawsolProgram, f: Flags) {
  const id = drawId(f);
  const draw = drawPda(id);
  const d = await program.account.drawV4.fetch(draw);
  const t = readTermsFile(id);
  const shape = t ? shapeFromJson(t.shape) : shapeFromChain(d);
  if (!t) console.log("(no terms file: USD figures unknown, rendering from chain only — the hash will not match)");
  const parameters = renderParameters(id, shape);
  const numbers = pickSchedule(scheduleSeed(id, parameters), shape.ticketCap, shape.tiers);
  const text = renderTerms(id, shape, numbers);
  console.log(text);
  const ok = sha256(text).equals(Buffer.from(d.termsHash));
  console.log(`terms_hash on chain ${Buffer.from(d.termsHash).toString("hex")} — ${ok ? "MATCHES" : "DOES NOT MATCH"} this rendering`);
  // the on-chain schedule must hold exactly these numbers
  const schedule = await fetchSchedule(program.provider.connection, draw, d.ticketCap);
  let mismatch = 0;
  numbers.forEach((nums, tier) => nums.forEach((n) => { if ((schedule[n] & SCHEDULE_TIER_MASK) !== tier + 1) mismatch++; }));
  const registered = [...schedule].filter((b) => (b & SCHEDULE_TIER_MASK) !== 0).length;
  const won = [...schedule].filter((b) => b & SCHEDULE_WON_BIT).length;
  console.log(`on-chain schedule: ${registered} numbers registered (${won} won), hash ${scheduleHash(schedule).toString("hex")}; ` +
    (mismatch ? `${mismatch} number(s) DIFFER from the terms` : "every published number matches"));
  if (!ok || mismatch) process.exit(1);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const f = parseFlags(rest);
  const program = makeProgram();
  switch (cmd) {
    case "init-config": return initConfig(program, f);
    case "set-keeper": return setKeeper(program, f);
    case "create-scratch": return createScratch(program, f);
    case "setup": return setup(program, f);
    case "open": return open(program, f);
    case "status": return status(program, f);
    case "withdraw": return withdrawCmd(program, f);
    case "reveal-all": return revealAll(program, f);
    case "run-draw": return runDraw(program, f);
    case "refund-all": return refundAllCmd(program, f);
    case "cancel": return cancel(program, f);
    case "legacy-close-v3": return legacyCloseV3(program, f);
    case "terms": return terms(program, f);
    default:
      console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e?.logs ? `${e.message}\n${e.logs.join("\n")}` : e);
  process.exit(1);
});
