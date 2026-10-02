/**
 * DrawSol v2 admin CLI.  Usage:  npx tsx scripts/admin.ts <command> [flags]
 *
 *   init-config
 *   create-draw --preset demo|prod [--prize SOL] [--reserve SOL] [--price SOL] [--cap N] [--minutes M]
 *               [--per-wallet N] [--free-cap N] [--per-tx N] [--dry-run]
 *   status [--draw id]
 *   withdraw --draw id
 *   reveal-all --draw id
 *   run-draw --draw id          (request_draw if due, wait for ORAO, settle_draw)
 *
 * Env: RPC_URL (default devnet), KEYPAIR_PATH (default ~/.config/solana/id.json).
 */
import { BN } from "@coral-xyz/anchor";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  CANCEL_GRACE_SECS,
  RESERVE_UNLOCK_SECS,
  ROOT,
  RPC_URL,
  configPda,
  drawPda,
  fetchEntries,
  isDue,
  lamports,
  makeProgram,
  programDataPda,
  readRandomness,
  requestDraw,
  revealReady,
  settleIfReady,
  sleep,
  sol,
  statusName,
  vaultPda,
  winningTicket,
  type DrawsolProgram,
} from "./lib";

type Tier = { amount: number; odds: number }; // amount in SOL
type Preset = {
  prize: number; reserve: number; price: number; cap: number; perTx: number; perWallet: number;
  freeCap: (cap: number) => number; minutes: number; denominator: number; tiers: Tier[]; label: string;
};

/** SPEC §3. */
const PRESETS: Record<string, Preset> = {
  demo: {
    label: "Devnet demo (boosted demo odds)",
    prize: 1, reserve: 2, price: 0.01, cap: 150, perTx: 25, perWallet: 50, freeCap: () => 15,
    minutes: 24 * 60, denominator: 1000,
    tiers: [{ amount: 0.2, odds: 10 }, { amount: 0.05, odds: 40 }, { amount: 0.01, odds: 150 }],
  },
  prod: {
    label: "Production",
    prize: 100, reserve: 32, price: 0.015, cap: 10_000, perTx: 25, perWallet: 200,
    freeCap: (cap) => Math.floor(cap * 0.05), minutes: 30 * 24 * 60, denominator: 10_000,
    tiers: [{ amount: 1, odds: 4 }, { amount: 0.25, odds: 16 }, { amount: 0.05, odds: 120 }, { amount: 0.015, odds: 400 }],
  },
};

function parseFlags(argv: string[]) {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
    const k = argv[i].slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
    else flags[k] = "true";
  }
  return flags;
}
const num = (f: Record<string, string>, k: string, dflt: number) => (f[k] !== undefined ? Number(f[k]) : dflt);
const drawFlag = (f: Record<string, string>) => {
  if (f.draw === undefined) throw new Error("--draw <id> is required");
  return drawPda(Number(f.draw));
};

// ------------------------------------------------------------------ commands

async function initConfig(program: DrawsolProgram) {
  const sig = await program.methods
    .initConfig()
    .accountsPartial({
      config: configPda(),
      admin: program.provider.publicKey!,
      program: program.programId,
      programData: programDataPda(),
    })
    .rpc();
  console.log(`config initialised, admin = ${program.provider.publicKey} ${sig}`);
}

function renderTerms(id: number, p: Preset & { closesAt: number; freeCapN: number }) {
  const template = fs.readFileSync(path.join(ROOT, "scripts/terms.md"), "utf8");
  const hit = p.tiers.reduce((a, t) => a + t.odds, 0);
  const ev = p.tiers.reduce((a, t) => a + t.amount * t.odds, 0) / p.denominator;
  const rows = p.tiers.map((t) => `| ${t.amount} SOL | ${t.odds} in ${p.denominator.toLocaleString("en-US")} |`).join("\n");
  return `${template}
## 7. Parameters of this draw

- Draw: #${id} (${p.label})
- Program: ${process.env.PROGRAM_ID ?? "FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb"}
- Grand prize: ${p.prize} SOL
- Instant-win reserve: ${p.reserve} SOL
- Ticket price: ${p.price} SOL
- Paid tickets: ${p.cap}; max ${p.perTx} per transaction, ${p.perWallet} per wallet (including the free entry)
- Free entries: up to ${p.freeCapN}, one per wallet
- Closes at: ${new Date(p.closesAt * 1000).toISOString()} (unix ${p.closesAt})

### Instant-win odds (per paid ticket)

| Prize | Odds |
|---|---|
${rows}

Instant hit rate: 1 in ${(p.denominator / hit).toFixed(1)}. Expected instant payout per ticket: ${ev.toFixed(6)} SOL.
`;
}

async function createDraw(program: DrawsolProgram, f: Record<string, string>) {
  const base = PRESETS[f.preset ?? ""];
  if (!base) throw new Error("--preset demo|prod is required");
  const cap = num(f, "cap", base.cap);
  const p = {
    ...base,
    prize: num(f, "prize", base.prize),
    reserve: num(f, "reserve", base.reserve),
    price: num(f, "price", base.price),
    cap,
    perTx: num(f, "per-tx", base.perTx),
    perWallet: num(f, "per-wallet", base.perWallet),
    freeCapN: num(f, "free-cap", base.freeCap(cap)),
    closesAt: Math.floor(Date.now() / 1000) + Math.round(num(f, "minutes", base.minutes) * 60),
  };
  const config = await program.account.config.fetchNullable(configPda());
  if (!config && !f["dry-run"]) throw new Error("config not initialised (run init-config)");
  const id = config ? config.nextDrawId.toNumber() : 0;
  const terms = renderTerms(id, p);
  const termsHash = createHash("sha256").update(terms).digest();

  const tiers = [...p.tiers, ...Array(4 - p.tiers.length).fill({ amount: 0, odds: 0 })].map((t: Tier) => ({
    amount: lamports(t.amount),
    odds: t.odds,
  }));
  const params = {
    ticketPrice: lamports(p.price),
    ticketCap: p.cap,
    maxPerTx: p.perTx,
    maxPerWallet: p.perWallet,
    freeCap: p.freeCapN,
    closesAt: new BN(p.closesAt),
    prizeLamports: lamports(p.prize),
    iwReserveLamports: lamports(p.reserve),
    iwDenominator: p.denominator,
    iwTiers: tiers,
    termsHash: Array.from(termsHash),
  };
  console.log(`draw #${id}: prize ${p.prize} SOL, reserve ${p.reserve} SOL, ${p.cap} × ${p.price} SOL, ` +
    `closes ${new Date(p.closesAt * 1000).toISOString()}, terms_hash ${termsHash.toString("hex")}`);
  if (f["dry-run"]) {
    console.log(terms);
    return;
  }
  const draw = drawPda(id);
  const sig = await program.methods
    .createDraw(params)
    .accountsPartial({ config: configPda(), draw, vault: vaultPda(draw), admin: program.provider.publicKey! })
    .rpc();
  const out = path.join(ROOT, `scripts/terms/draw-${id}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, terms);
  console.log(`created draw #${id} at ${draw} ${sig}\nterms saved to ${path.relative(ROOT, out)}`);
}

async function status(program: DrawsolProgram, f: Record<string, string>) {
  const conn = program.provider.connection;
  console.log(`RPC ${RPC_URL}, program ${program.programId}`);
  const config = await program.account.config.fetchNullable(configPda());
  if (!config) {
    console.log("config: not initialised (run init-config)");
    return;
  }
  console.log(`config: admin ${config.admin}, next draw id ${config.nextDrawId}`);
  const now = Math.floor(Date.now() / 1000);
  const ids = f.draw !== undefined ? [Number(f.draw)] : [...Array(config.nextDrawId.toNumber()).keys()];
  for (const id of ids) {
    const draw = drawPda(id);
    const d = await program.account.draw.fetch(draw);
    const vaultBal = await conn.getBalance(vaultPda(draw));
    const st = statusName(d.status);
    const closes = d.closesAt.toNumber();
    console.log(`\n#${id} ${draw}  [${st.toUpperCase()}]${isDue(d, now) ? "  ← DUE: run-draw" : ""}`);
    console.log(`  prize ${sol(d.prizeLamports)} SOL · price ${sol(d.ticketPrice)} · paid ${d.paidTickets}/${d.ticketCap} · ` +
      `free ${d.freeTickets}/${d.freeCap} · entries ${d.entryCount} (paid ${d.paidEntries}, revealed ${d.revealedEntries})`);
    console.log(`  closes ${new Date(closes * 1000).toISOString()} (${closes > now ? `in ${Math.round((closes - now) / 60)} min` : "closed"})`);
    console.log(`  vault ${sol(vaultBal)} SOL · proceeds ${sol(d.proceedsLamports)} · instant paid ${sol(d.iwPaidLamports)}/${sol(d.iwReserveLamports)}` +
      ` · refunded ${sol(d.refundedLamports)}`);
    console.log(`  flags: prize_paid=${d.prizePaid} proceeds_withdrawn=${d.proceedsWithdrawn} reserve_withdrawn=${d.reserveWithdrawn}`);
    if (st === "drawing") {
      const rnd = await readRandomness(conn, d.drawVrfRequest, d.drawVrfSeed);
      console.log(`  ORAO request ${d.drawVrfRequest}: ${rnd ? `fulfilled → winning ticket #${winningTicket(rnd, d.nextTicket)}` : "pending"}`);
      if (now > closes + CANCEL_GRACE_SECS) console.log("  randomness grace period over: cancel_draw is allowed");
    }
    if (st === "settled") console.log(`  winner ${d.winner} · ticket #${d.winningTicket} · entry ${d.winningEntry}`);
    if ((st === "settled" || st === "cancelled") && !d.reserveWithdrawn) {
      const unlocked = d.revealedEntries === d.paidEntries || now > closes + RESERVE_UNLOCK_SECS;
      console.log(`  reserve leftovers ${unlocked ? "withdrawable" : `locked until all entries are revealed or ${new Date((closes + RESERVE_UNLOCK_SECS) * 1000).toISOString()}`}`);
    }
  }
}

async function withdraw(program: DrawsolProgram, f: Record<string, string>) {
  const draw = drawFlag(f);
  const before = await program.provider.connection.getBalance(program.provider.publicKey!);
  const sig = await program.methods
    .withdraw()
    .accountsPartial({ draw, vault: vaultPda(draw), authority: program.provider.publicKey! })
    .rpc();
  const after = await program.provider.connection.getBalance(program.provider.publicKey!);
  console.log(`withdrew ≈${sol(after - before)} SOL (net of fee) ${sig}`);
}

async function revealAll(program: DrawsolProgram, f: Record<string, string>) {
  const draw = drawFlag(f);
  const n = await revealReady(program, draw);
  const pending = (await fetchEntries(program, draw)).filter((e) => !e.account.revealed && !e.account.isFree).length;
  console.log(`revealed ${n}; ${pending} paid entries still unrevealed (randomness pending or reveal failed)`);
}

async function runDraw(program: DrawsolProgram, f: Record<string, string>) {
  const draw = drawFlag(f);
  let d = await program.account.draw.fetch(draw);
  if (statusName(d.status) === "open") {
    if (!isDue(d)) throw new Error(`draw #${d.id} is not due until ${new Date(d.closesAt.toNumber() * 1000).toISOString()} (or sell-out)`);
    const req = await requestDraw(program, draw);
    if (!req) return;
  }
  d = await program.account.draw.fetch(draw);
  if (statusName(d.status) !== "drawing") {
    console.log(`draw #${d.id} is ${statusName(d.status)}; nothing to do`);
    return;
  }
  const deadline = Date.now() + num(f, "timeout", 300) * 1000;
  while (Date.now() < deadline) {
    if (await settleIfReady(program, draw)) return;
    console.log("waiting for ORAO fulfilment…");
    await sleep(3000);
  }
  throw new Error("timed out waiting for randomness; rerun `run-draw` later (settle is permissionless)");
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const f = parseFlags(rest);
  const program = makeProgram();
  switch (cmd) {
    case "init-config": return initConfig(program);
    case "create-draw": return createDraw(program, f);
    case "status": return status(program, f);
    case "withdraw": return withdraw(program, f);
    case "reveal-all": return revealAll(program, f);
    case "run-draw": return runDraw(program, f);
    default:
      console.log(fs.readFileSync(__filename, "utf8").split("*/")[0]);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e?.logs ? `${e.message}\n${e.logs.join("\n")}` : e);
  process.exit(1);
});

