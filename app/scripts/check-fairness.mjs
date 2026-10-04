#!/usr/bin/env node
/**
 * Verifies app/src/lib/fairness.ts (and the PDA helpers) against the program's own test vectors:
 * tests-svm/fixtures/fairness_vectors.json (generated from fairness.rs). The v4 sections (assign,
 * winning_position, *_v4, pdas_v4) are the ones the app runs; the v3 / v2 sections cover the legacy draws
 * still read for history.
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

// ---- v4: the sections the app runs
for (const key of ["assign", "winning_position", "entry_seed_v4", "draw_seed_v4"]) {
  if (!Array.isArray(V[key]) || !V[key].length) {
    console.error(`FAIL the vectors file has no ${key} section`);
    fail++;
  }
}
if (!V.pdas_v4) {
  console.error("FAIL the vectors file has no pdas_v4 section");
  fail++;
}
for (const [i, v] of (V.assign ?? []).entries()) {
  const r = F.fromHex(v.randomness);
  for (let k = 0; k < v.count; k++) eq(`assign[${i}].rolls[${k}]`, F.assignRoll(r, k), v.rolls[k]);
  const pool = [...v.pool_before];
  const { tickets, remaining } = F.assignTickets(r, v.count, pool, v.remaining_before);
  eq(`assign[${i}].tickets`, tickets.join(","), v.tickets.join(","));
  eq(`assign[${i}].remaining_after`, remaining, v.remaining_after);
  eq(`assign[${i}].pool_after`, pool.slice(0, remaining).join(","), v.pool_after.join(","));
}
for (const [i, v] of (V.winning_position ?? []).entries()) {
  const r = F.fromHex(v.randomness);
  eq(`winning_position[${i}]`, F.winningPosition(r, v.next_pos), v.winning_pos);
}
for (const [i, v] of (V.entry_seed_v4 ?? []).entries()) {
  const seed = F.entrySeed(pk(v.draw), pk(v.buyer), v.seq, F.fromHex(v.client_nonce));
  eq(`entry_seed_v4[${i}].seed`, F.toHex(seed), v.seed);
  eq(`entry_seed_v4[${i}].vrf_request`, F.oraoRandomnessPda(seed).toBase58(), v.vrf_request);
}
for (const [i, v] of (V.draw_seed_v4 ?? []).entries()) {
  const seed = F.drawSeed(pk(v.draw), v.next_pos, F.fromHex(v.client_nonce));
  eq(`draw_seed_v4[${i}].seed`, F.toHex(seed), v.seed);
  eq(`draw_seed_v4[${i}].vrf_request`, F.oraoRandomnessPda(seed).toBase58(), v.vrf_request);
}
const p4 = V.pdas_v4 ?? {};
const d7 = P.drawPda(7);
eq("pda_v4 config", P.configPda().toBase58(), p4.config);
eq("pda_v4 draw_7", d7.toBase58(), p4.draw_7);
eq("pda_v4 draw_8", P.drawPda(8).toBase58(), p4.draw_8);
eq("pda_v4 vault", P.vaultPda(d7).toBase58(), p4.vault_of_draw_7);
eq("pda_v4 pool", P.poolPda(d7).toBase58(), p4.pool_of_draw_7);
eq("pda_v4 schedule", P.schedulePda(d7).toBase58(), p4.schedule_of_draw_7);
eq("pda_v4 entry 0", P.entryPda(d7, 0).toBase58(), p4.entry_0_of_draw_7);
eq("pda_v4 entry 7", P.entryPda(d7, 7).toBase58(), p4.entry_7_of_draw_7);
eq("pda_v4 player", P.playerPda(d7, pk(p4.player_of_draw_7.wallet)).toBase58(), p4.player_of_draw_7.player);
eq("pda_v4 profile", P.profilePda(pk(p4.profile.wallet)).toBase58(), p4.profile.profile);

// ---- v3 (legacy history: draws Nº 2 and Nº 3): seeds, the per-ticket roll, the winner, the PDAs
for (const [i, v] of (V.entry_seed_v3 ?? []).entries()) {
  const seed = F.entrySeedV3(pk(v.draw), pk(v.buyer), v.seq, F.fromHex(v.client_nonce));
  eq(`entry_seed_v3[${i}].seed`, F.toHex(seed), v.seed);
  eq(`entry_seed_v3[${i}].vrf_request`, F.oraoRandomnessPda(seed).toBase58(), v.vrf_request);
}
for (const [i, v] of (V.draw_seed_v3 ?? []).entries()) {
  const seed = F.drawSeedV3(pk(v.draw), v.next_ticket, F.fromHex(v.client_nonce));
  eq(`draw_seed_v3[${i}].seed`, F.toHex(seed), v.seed);
  eq(`draw_seed_v3[${i}].vrf_request`, F.oraoRandomnessPda(seed).toBase58(), v.vrf_request);
}
for (const [i, v] of (V.ticket_tier ?? []).entries()) {
  const r = F.fromHex(v.randomness);
  const tiers = v.tiers.map((t) => ({ odds: t.odds }));
  eq(`ticket_tier[${i}].roll`, F.ticketRoll(r, v.ticket), v.roll);
  eq(`ticket_tier[${i}].x`, F.ticketX(r, v.ticket, v.denominator), v.x);
  eq(`ticket_tier[${i}].tier`, F.rollTicket(r, v.ticket, v.denominator, tiers), v.tier);
}
for (const [i, v] of (V.winning_ticket ?? []).entries()) {
  const r = F.fromHex(v.randomness);
  eq(`winning_ticket[${i}].roll`, F.drawRoll(r), v.roll);
  eq(`winning_ticket[${i}].w`, F.winningTicket(r, v.next_ticket), v.winning_ticket);
}
const p3 = V.pdas_v3 ?? {};
if (p3.draw_2) {
  eq("pda_v3 draw_2", P.legacyDrawPda(2).toBase58(), p3.draw_2);
  eq("pda_v3 draw_3", P.legacyDrawPda(3).toBase58(), p3.draw_3);
  eq("pda_v3 vault", P.legacyVaultPda(pk(p3.draw_2)).toBase58(), p3.vault_of_draw_2);
  eq("pda_v3 entry 0", P.legacyEntryPda(pk(p3.draw_2), 0).toBase58(), p3.entry_0_of_draw_2);
  eq("pda_v3 entry 7", P.legacyEntryPda(pk(p3.draw_2), 7).toBase58(), p3.entry_7_of_draw_2);
  eq("pda_v3 player", P.legacyPlayerPda(pk(p3.draw_2), pk(p3.player_of_draw_2.wallet)).toBase58(), p3.player_of_draw_2.player);
}
// ---- v2 seeds (byte-identical sections; the v2 draws are closed, the functions stay checked)
for (const [i, v] of (V.entry_seed ?? []).entries()) {
  const seed = F.entrySeedV2(pk(v.draw), pk(v.buyer), v.seq, F.fromHex(v.client_nonce));
  eq(`entry_seed[v2 ${i}].seed`, F.toHex(seed), v.seed);
}
for (const [i, v] of (V.draw_seed ?? []).entries()) {
  const seed = F.drawSeedV2(pk(v.draw), v.next_ticket, F.fromHex(v.client_nonce));
  eq(`draw_seed[v2 ${i}].seed`, F.toHex(seed), v.seed);
}

rmSync(out, { recursive: true, force: true });
console.log(`fairness vectors: ${pass} passed, ${fail} failed (${vectorsPath})`);
process.exit(fail ? 1 : 0);
