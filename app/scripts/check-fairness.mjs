#!/usr/bin/env node
/**
 * Verifies app/src/lib/fairness.ts (and the PDA helpers) against the program's own
 * test vectors: tests-svm/fixtures/fairness_vectors.json (generated from fairness.rs).
 *
 *   node scripts/check-fairness.mjs [path/to/fairness_vectors.json]
 *
 * The TS sources are transpiled on the fly with the TypeScript compiler, so this
 * checks the exact code the browser runs.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const require = createRequire(join(app, "package.json"));
const ts = require("typescript");
const vectorsPath = process.argv[2] ?? join(app, "..", "tests-svm", "fixtures", "fairness_vectors.json");
const V = JSON.parse(readFileSync(vectorsPath, "utf8"));

// transpile lib/{config,fairness,pdas}.ts → .mjs next to node_modules resolution
const out = mkdtempSync(join(app, "node_modules", ".fairness-check-"));
for (const name of ["config", "fairness", "pdas"]) {
  const src = readFileSync(join(app, "src", "lib", `${name}.ts`), "utf8");
  let js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  js = js.replace(/from "\.\/(\w+)"/g, 'from "./$1.mjs"').replace(/from "@noble\/hashes\/sha256"/g, 'from "@noble/hashes/sha256.js"');
  writeFileSync(join(out, `${name}.mjs`), js);
}
const F = await import(pathToFileURL(join(out, "fairness.mjs")).href);
const P = await import(pathToFileURL(join(out, "pdas.mjs")).href);
const C = await import(pathToFileURL(join(out, "config.mjs")).href);
const { PublicKey } = require("@solana/web3.js");

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  if (String(got) === String(want)) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}\n  got  ${got}\n  want ${want}`);
  }
};
const pk = (s) => new PublicKey(s);

eq("program id", C.PROGRAM_ID.toBase58(), V.program_id);
eq("orao program id", C.ORAO_PROGRAM_ID.toBase58(), V.orao_program_id);

for (const [i, v] of V.entry_seed.entries()) {
  const seed = F.entrySeed(pk(v.draw), pk(v.buyer), v.seq, F.fromHex(v.client_nonce));
  eq(`entry_seed[${i}].seed`, F.toHex(seed), v.seed);
  eq(`entry_seed[${i}].vrf_request`, F.oraoRandomnessPda(seed).toBase58(), v.vrf_request);
}
for (const [i, v] of V.draw_seed.entries()) {
  const seed = F.drawSeed(pk(v.draw), v.next_ticket, F.fromHex(v.client_nonce));
  eq(`draw_seed[${i}].seed`, F.toHex(seed), v.seed);
  eq(`draw_seed[${i}].vrf_request`, F.oraoRandomnessPda(seed).toBase58(), v.vrf_request);
}
for (const [i, v] of V.ticket_tier.entries()) {
  const r = F.fromHex(v.randomness);
  const tiers = v.tiers.map((t) => ({ amount: BigInt(t.amount), odds: t.odds }));
  eq(`ticket_tier[${i}].roll`, F.ticketRoll(r, v.ticket), v.roll);
  eq(`ticket_tier[${i}].x`, F.ticketX(r, v.ticket, v.denominator), v.x);
  eq(`ticket_tier[${i}].tier`, F.rollTicket(r, v.ticket, v.denominator, tiers), v.tier);
}
for (const [i, v] of V.winning_ticket.entries()) {
  const r = F.fromHex(v.randomness);
  eq(`winning_ticket[${i}].roll`, F.drawRoll(r), v.roll);
  eq(`winning_ticket[${i}].w`, F.winningTicket(r, v.next_ticket), v.winning_ticket);
}

const pd = V.pdas ?? {};
if (pd.config) eq("pda config", P.configPda().toBase58(), pd.config);
if (pd.draw_0) eq("pda draw_0", P.drawPda(0).toBase58(), pd.draw_0);
if (pd.draw_1) eq("pda draw_1", P.drawPda(1).toBase58(), pd.draw_1);
if (pd.vault_of_draw_0) eq("pda vault", P.vaultPda(pk(pd.draw_0)).toBase58(), pd.vault_of_draw_0);
if (pd.entry_0_of_draw_0) eq("pda entry 0", P.entryPda(pk(pd.draw_0), 0).toBase58(), pd.entry_0_of_draw_0);
if (pd.entry_7_of_draw_0) eq("pda entry 7", P.entryPda(pk(pd.draw_0), 7).toBase58(), pd.entry_7_of_draw_0);
if (pd.player_of_draw_0)
  eq("pda player", P.playerPda(pk(pd.draw_0), pk(pd.player_of_draw_0.wallet)).toBase58(), pd.player_of_draw_0.player);

rmSync(out, { recursive: true, force: true });
console.log(`fairness vectors: ${pass} passed, ${fail} failed (${vectorsPath})`);
process.exit(fail ? 1 : 0);
