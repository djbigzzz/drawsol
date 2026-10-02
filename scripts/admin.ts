/**
 * DrawSol v3 admin CLI.  Usage:  npx tsx scripts/admin.ts <command> [flags]
 *
 *   migrate-config --keeper <pubkey>          v2 Config → v3 layout + keeper (once, after the upgrade)
 *   set-keeper --keeper <pubkey>
 *   init-config --keeper <pubkey>             fresh deployments only (signer = upgrade authority)
 *   create-pot --preset nightly [overrides] [--dry-run]
 *   create-headline --preset weekly [overrides] [--dry-run]
 *   status [--draw id]
 *   withdraw --draw id
 *   reveal-all --draw id
 *   run-draw --draw id [--timeout s]          request_draw when due, wait for ORAO, settle_draw
 *   refund-all --draw id                      claim_refund for every entry of a cancelled draw (permissionless)
 *   legacy-close --draw id                    close a v2 draw (#0 settled / #1 empty) into the admin wallet
 *   terms --draw id                           re-render a draw's terms from chain and check its terms_hash
 *
 * Overrides (both kinds): --price SOL --cap N --house BPS --per-tx N --per-wallet N --free-cap N --grace-min M
 *   timing: --closes <ISO|unix> --draw-at <ISO|unix>, or --minutes M (close in M minutes) [--draw-delay-min D]
 *   default timing: pot = next 22:00 UTC; headline = next Sunday 20:00 UTC; draw_at = closes_at.
 * Pot only: --pot BPS --instant BPS.   Headline only: --prize SOL --min N --margin BPS.
 *
 * Env: RPC_URL (default devnet), KEYPAIR_PATH (default ~/.config/solana/id.json).
 */
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  CANCEL_GRACE_SECS,
  HEADLINE_PRESETS,
  POT_PRESETS,
  ROOT,
  RPC_URL,
  buildHeadlineDraw,
  buildPotDraw,
  configPda,
  createDraw,
  currentPrize,
  drawPda,
  fetchEntries,
  fetchLegacyDraw,
  iso,
  isDue,
  kindName,
  legacyDrawPda,
  legacyVaultPda,
  makeProgram,
  nextDailyUtc,
  nextWeeklyUtc,
  nowSecs,
  programDataPda,
  publicFrom,
  readRandomness,
  refundAll,
  renderTerms,
  requestDraw,
  revealReady,
  settleIfReady,
  sha256,
  sleep,
  sol,
  statusName,
  vaultPda,
  willCancelAtRequest,
  winningTicket,
  type DrawAccount,
  type DrawsolProgram,
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

/** --minutes / --closes / --draw-at handling shared by both kinds. */
function timing(f: Flags) {
  const minutes = num(f, "minutes");
  const closesAt = minutes !== undefined ? nowSecs() + Math.round(minutes * 60) : time(f.closes);
  const delay = num(f, "draw-delay-min");
  const drawAt = time(f["draw-at"]) ?? (closesAt !== undefined && delay !== undefined ? closesAt + Math.round(delay * 60) : undefined);
  return { closesAt, drawAt };
}

// ------------------------------------------------------------------ config

async function initConfig(program: DrawsolProgram, f: Flags) {
  const sig = await program.methods
    .initConfig(keeperFlag(f))
    .accountsPartial({ config: configPda(), admin: program.provider.publicKey!, program: program.programId, programData: programDataPda() })
    .rpc();
  console.log(`config initialised, admin = ${program.provider.publicKey} ${sig}`);
}

async function migrateConfig(program: DrawsolProgram, f: Flags) {
  const keeper = keeperFlag(f);
  const acc = await program.provider.connection.getAccountInfo(configPda());
  if (!acc) throw new Error("no Config account: use init-config on a fresh deployment");
  console.log(`config is ${acc.data.length} bytes (${acc.data.length === 49 ? "v2 layout" : "v3 layout?"})`);
  const sig = await program.methods.migrateConfig(keeper).accountsPartial({ config: configPda(), admin: program.provider.publicKey! }).rpc();
  const c = await program.account.config.fetch(configPda());
  console.log(`migrated: admin ${c.admin}, keeper ${c.keeper}, next draw id ${c.nextDrawId} ${sig}`);
}

async function setKeeper(program: DrawsolProgram, f: Flags) {
  const sig = await program.methods.setKeeper(keeperFlag(f)).accountsPartial({ config: configPda(), admin: program.provider.publicKey! }).rpc();
  console.log(`keeper set to ${f.keeper} ${sig}`);
}

// ------------------------------------------------------------------ creation

async function create(program: DrawsolProgram, f: Flags, kind: "pot" | "headline") {
  const { closesAt, drawAt } = timing(f);
  const common = {
    price: num(f, "price"), cap: num(f, "cap"), houseBps: num(f, "house"), perTx: num(f, "per-tx"),
    perWallet: num(f, "per-wallet"), freeCap: num(f, "free-cap"), graceMin: num(f, "grace-min"), closesAt, drawAt,
  };
  let shape;
  if (kind === "pot") {
    const preset = POT_PRESETS[f.preset ?? ""];
    if (!preset) throw new Error(`--preset ${Object.keys(POT_PRESETS).join("|")} is required`);
    shape = buildPotDraw(preset, { ...common, potBps: num(f, "pot"), instantBps: num(f, "instant") }, nextDailyUtc(22));
  } else {
    const preset = HEADLINE_PRESETS[f.preset ?? ""];
    if (!preset) throw new Error(`--preset ${Object.keys(HEADLINE_PRESETS).join("|")} is required`);
    shape = buildHeadlineDraw(preset, { ...common, prize: num(f, "prize"), minTickets: num(f, "min"), floorMarginBps: num(f, "margin") }, nextWeeklyUtc(0, 20));
  }
  const config = await program.account.config.fetchNullable(configPda()).catch(() => null); // null while still v2
  if (!config && !f["dry-run"]) throw new Error("config not migrated/initialised (run migrate-config)");
  const id = config ? config.nextDrawId.toNumber() : 0;
  const terms = renderTerms(id, shape);
  console.log(`${kind} draw #${id}: ${shape.ticketCap} × ${sol(shape.ticketPrice)} SOL, closes ${iso(shape.closesAt)}, draw ${iso(shape.drawAt)}` +
    (kind === "headline" ? `, prize ${sol(shape.prizeLamports)} SOL, min ${shape.minTickets}` : `, split ${shape.houseBps}/${shape.potBps}/${shape.instantBps}`) +
    `, terms_hash ${sha256(terms).toString("hex")}`);
  if (f["dry-run"]) {
    console.log(terms);
    return;
  }
  const r = await createDraw(program, shape);
  const out = path.join(ROOT, `scripts/terms/draw-${r.id}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.terms);
  console.log(`created ${kind} draw #${r.id} at ${r.draw} ${r.sig}\nterms saved to ${path.relative(ROOT, out)}`);
}

// ------------------------------------------------------------------ status

function describe(id: number, draw: PublicKey, d: DrawAccount, vaultBal: number, now: number) {
  const st = statusName(d.status);
  const kind = kindName(d.kind);
  const lines = [`\n#${id} ${kind.toUpperCase()} ${draw}  [${st.toUpperCase()}]${isDue(d, now) ? "  ← DUE: run-draw" : ""}`];
  lines.push(`  price ${sol(d.ticketPrice)} · paid ${d.paidTickets}/${d.ticketCap} · credit ${d.creditTickets} · free ${d.freeTickets}/${d.freeCap}` +
    ` · entries ${d.entryCount} (rolled ${d.rolledEntries}, revealed ${d.revealedEntries})`);
  lines.push(`  closes ${iso(d.closesAt)} · draw ${iso(d.drawAt)} · public after ${iso(publicFrom(d))}`);
  if (kind === "pot") {
    lines.push(`  split ${d.houseBps}/${d.potBps}/${d.instantBps} · pot ${sol(d.potLamports)} · instant pool ${sol(d.instantPoolLamports)}` +
      ` · house ${sol(d.houseLamports)} (withdrawn ${sol(d.houseWithdrawn)})`);
  } else {
    lines.push(`  prize ${sol(d.prizeLamports)} · min ${d.minTickets} paid · revenue ${sol(d.revenueLamports)} · house ${sol(d.houseLamports)} (withdrawn ${sol(d.houseWithdrawn)})` +
      (st === "open" && willCancelAtRequest(d) ? "  [below min: would cancel + refund]" : ""));
  }
  lines.push(`  vault ${sol(vaultBal)} SOL · revenue ${sol(d.revenueLamports)} · refunded ${sol(d.refundedLamports)} · prize_paid=${d.prizePaid}`);
  if (st === "open") lines.push(`  prize if drawn now: ${sol(currentPrize(d))} SOL`);
  if (st === "settled") lines.push(`  winner ${d.winner} · ticket #${d.winningTicket} · prize ${sol(d.prizePaidLamports)} SOL`);
  return lines;
}

async function status(program: DrawsolProgram, f: Flags) {
  const conn = program.provider.connection;
  console.log(`RPC ${RPC_URL}, program ${program.programId}`);
  const raw = await conn.getAccountInfo(configPda());
  if (!raw) return console.log("config: not initialised");
  if (raw.data.length === 49) {
    console.log("config: v2 layout — run `migrate-config --keeper <pubkey>`");
  } else {
    const c = await program.account.config.fetch(configPda());
    console.log(`config: admin ${c.admin}, keeper ${c.keeper}, next draw id ${c.nextDrawId}`);
  }
  const now = nowSecs();
  const next = raw.data.readBigUInt64LE(raw.data.length === 49 ? 40 : 72);
  const ids = f.draw !== undefined ? [Number(f.draw)] : [...Array(Number(next)).keys()];
  for (const id of ids) {
    const legacy = await fetchLegacyDraw(conn, id);
    if (legacy) {
      console.log(`\n#${id} LEGACY v2 ${legacy.draw} [${legacy.status.toUpperCase()}] entries ${legacy.entryCount}, ` +
        `${sol(legacy.drawLamports + legacy.vaultLamports)} SOL in draw + vault — ${legacy.closable ? "closable: legacy-close" : "NOT closable"}`);
      continue;
    }
    const draw = drawPda(id);
    const d = await program.account.drawV3.fetchNullable(draw);
    if (!d) {
      console.log(`\n#${id}: no account (closed v2 draw)`);
      continue;
    }
    const vaultBal = await conn.getBalance(vaultPda(draw));
    for (const l of describe(id, draw, d, vaultBal, now)) console.log(l);
    const st = statusName(d.status);
    if (st === "drawing") {
      const rnd = await readRandomness(conn, d.drawVrfRequest, d.drawVrfSeed);
      console.log(`  ORAO request ${d.drawVrfRequest}: ${rnd ? `fulfilled → winning ticket #${winningTicket(rnd, d.nextTicket)}` : "pending"}`);
      if (now > d.drawAt.toNumber() + CANCEL_GRACE_SECS) console.log("  randomness grace period over: cancel_draw is allowed");
    }
    if (st === "cancelled") {
      // Outstanding refunds vs vault (a pot entry that won more instant SOL than it paid can leave a shortfall).
      let owed = 0n;
      for (const { account: e } of await fetchEntries(program, draw)) {
        if (e.refunded) continue;
        const a = BigInt(e.paidLamports.toString()) - BigInt(e.solPaid.toString());
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

async function withdraw(program: DrawsolProgram, f: Flags) {
  const draw = drawPda(drawId(f));
  const before = await program.provider.connection.getBalance(program.provider.publicKey!);
  const sig = await program.methods.withdraw().accountsPartial({ draw, vault: vaultPda(draw), authority: program.provider.publicKey! }).rpc();
  const after = await program.provider.connection.getBalance(program.provider.publicKey!);
  console.log(`withdrew ≈${sol(after - before)} SOL (net of fee) ${sig}`);
}

async function revealAll(program: DrawsolProgram, f: Flags) {
  const draw = drawPda(drawId(f));
  const n = await revealReady(program, draw);
  const pending = (await fetchEntries(program, draw)).filter((e) => e.account.needsReveal && !e.account.revealed).length;
  console.log(`revealed ${n}; ${pending} rolled entries still unrevealed (randomness pending or reveal failed)`);
}

async function runDraw(program: DrawsolProgram, f: Flags) {
  const draw = drawPda(drawId(f));
  let d = await program.account.drawV3.fetch(draw);
  if (statusName(d.status) === "open") {
    if (!isDue(d)) throw new Error(`draw #${d.id} is not due until ${iso(d.drawAt)}`);
    await revealReady(program, draw); // reveal before the pool rolls into the pot
    if (!(await requestDraw(program, draw))) return;
  }
  d = await program.account.drawV3.fetch(draw);
  if (statusName(d.status) !== "drawing") return console.log(`draw #${d.id} is ${statusName(d.status)}; nothing to do`);
  const deadline = Date.now() + (num(f, "timeout") ?? 300) * 1000;
  while (Date.now() < deadline) {
    if (await settleIfReady(program, draw)) return;
    console.log("waiting for ORAO fulfilment…");
    await sleep(3000);
  }
  throw new Error("timed out waiting for randomness; rerun `run-draw` later (settle is permissionless)");
}

async function refundAllCmd(program: DrawsolProgram, f: Flags) {
  const total = await refundAll(program, drawPda(drawId(f)));
  console.log(`refunded ${sol(Number(total))} SOL in total`);
}

async function legacyClose(program: DrawsolProgram, f: Flags) {
  const id = drawId(f);
  const conn = program.provider.connection;
  const legacy = await fetchLegacyDraw(conn, id);
  if (!legacy) throw new Error(`no v2 draw #${id}`);
  if (!legacy.closable) throw new Error(`v2 draw #${id} is ${legacy.status} with ${legacy.entryCount} entries and not fully withdrawn: not closable`);
  const draw = legacyDrawPda(id);
  const sig = await program.methods
    .legacyCloseV2(new BN(id))
    .accountsPartial({ config: configPda(), admin: program.provider.publicKey!, legacyDraw: draw, legacyVault: legacyVaultPda(draw) })
    .rpc();
  console.log(`closed v2 draw #${id}: ${sol(legacy.drawLamports + legacy.vaultLamports)} SOL returned to the admin ${sig}`);
}

async function terms(program: DrawsolProgram, f: Flags) {
  const id = drawId(f);
  const d = await program.account.drawV3.fetch(drawPda(id));
  const text = renderTerms(id, d);
  const ok = sha256(text).equals(Buffer.from(d.termsHash));
  console.log(text);
  console.log(`terms_hash on chain ${Buffer.from(d.termsHash).toString("hex")} — ${ok ? "MATCHES" : "DOES NOT MATCH"} this rendering`);
  if (!ok) process.exit(1);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const f = parseFlags(rest);
  const program = makeProgram();
  switch (cmd) {
    case "init-config": return initConfig(program, f);
    case "migrate-config": return migrateConfig(program, f);
    case "set-keeper": return setKeeper(program, f);
    case "create-pot": return create(program, f, "pot");
    case "create-headline": return create(program, f, "headline");
    case "status": return status(program, f);
    case "withdraw": return withdraw(program, f);
    case "reveal-all": return revealAll(program, f);
    case "run-draw": return runDraw(program, f);
    case "refund-all": return refundAllCmd(program, f);
    case "legacy-close": return legacyClose(program, f);
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

