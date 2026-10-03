/**
 * Checks scripts/lib.ts fairness functions against tests-svm/fixtures/fairness_vectors.json (Rust-generated):
 * the v4 sections (assign, winning_position, *_v4), plus the v3 / v2 sections used for legacy history.
 */
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  ROOT, assignRoll, assignTickets, drawPda, drawVrfSeed, drawVrfSeedV2, drawVrfSeedV3, entryPda, entryVrfSeed, entryVrfSeedV2,
  entryVrfSeedV3, legacyDrawPda, legacyV3DrawPda, oraoRequestPda, playerPda, poolPda, profilePda, schedulePda, ticketRoll,
  ticketTier, uniformIndex, vaultPda, winningPosition, winningTicket,
} from "./lib";

const v = JSON.parse(fs.readFileSync(path.join(ROOT, "tests-svm/fixtures/fairness_vectors.json"), "utf8"));
let n = 0;
const eq = (a: unknown, b: unknown, what: string) => {
  if (String(a) !== String(b)) throw new Error(`${what}: got ${a}, want ${b}`);
  n++;
};

// --- v4
for (const c of v.assign) {
  const r = Buffer.from(c.randomness, "hex");
  for (let i = 0; i < c.count; i++) eq(assignRoll(r, i), c.rolls[i], `assign roll ${i}`);
  const pool: number[] = [...c.pool_before];
  const { tickets, remaining } = assignTickets(r, c.count, pool, c.remaining_before);
  eq(tickets.join(","), c.tickets.join(","), "assign tickets");
  eq(remaining, c.remaining_after, "assign remaining");
  eq(pool.slice(0, remaining).join(","), c.pool_after.join(","), "assign pool_after");
}
for (const c of v.winning_position) eq(winningPosition(Buffer.from(c.randomness, "hex"), c.next_pos), c.winning_pos, "winning_pos");
for (const c of v.entry_seed_v4) {
  const s = entryVrfSeed(new PublicKey(c.draw), new PublicKey(c.buyer), c.seq, Buffer.from(c.client_nonce, "hex"));
  eq(s.toString("hex"), c.seed, "entry_seed_v4");
  eq(oraoRequestPda(s).toBase58(), c.vrf_request, "entry_seed_v4 vrf_request");
}
for (const c of v.draw_seed_v4) {
  const s = drawVrfSeed(new PublicKey(c.draw), c.next_pos, Buffer.from(c.client_nonce, "hex"));
  eq(s.toString("hex"), c.seed, "draw_seed_v4");
  eq(oraoRequestPda(s).toBase58(), c.vrf_request, "draw_seed_v4 vrf_request");
}
const p = v.pdas_v4;
const d7 = drawPda(7);
eq(d7.toBase58(), p.draw_7, "draw_7");
eq(drawPda(8).toBase58(), p.draw_8, "draw_8");
eq(vaultPda(d7).toBase58(), p.vault_of_draw_7, "vault");
eq(poolPda(d7).toBase58(), p.pool_of_draw_7, "pool");
eq(schedulePda(d7).toBase58(), p.schedule_of_draw_7, "schedule");
eq(entryPda(d7, 0).toBase58(), p.entry_0_of_draw_7, "entry 0");
eq(entryPda(d7, 7).toBase58(), p.entry_7_of_draw_7, "entry 7");
eq(playerPda(d7, new PublicKey(p.player_of_draw_7.wallet)).toBase58(), p.player_of_draw_7.player, "player");
eq(profilePda(new PublicKey(p.profile.wallet)).toBase58(), p.profile.profile, "profile");

// --- v3 / v2 history
for (const c of v.ticket_tier) {
  const r = Buffer.from(c.randomness, "hex");
  const roll = ticketRoll(r, c.ticket);
  eq(roll, c.roll, "roll");
  eq(uniformIndex(roll, c.denominator), c.x, "x");
  eq(ticketTier(r, c.ticket, c.denominator, c.tiers), c.tier, "tier");
}
for (const c of v.winning_ticket) eq(winningTicket(Buffer.from(c.randomness, "hex"), c.next_ticket), c.winning_ticket, "winner");
for (const [key, fn] of [["entry_seed", entryVrfSeedV2], ["entry_seed_v3", entryVrfSeedV3]] as const) {
  for (const c of v[key]) {
    const s = fn(new PublicKey(c.draw), new PublicKey(c.buyer), c.seq, Buffer.from(c.client_nonce, "hex"));
    eq(s.toString("hex"), c.seed, `${key} seed`);
    eq(oraoRequestPda(s).toBase58(), c.vrf_request, `${key} vrf_request`);
  }
}
for (const [key, fn] of [["draw_seed", drawVrfSeedV2], ["draw_seed_v3", drawVrfSeedV3]] as const) {
  for (const c of v[key]) {
    const s = fn(new PublicKey(c.draw), c.next_ticket, Buffer.from(c.client_nonce, "hex"));
    eq(s.toString("hex"), c.seed, `${key} seed`);
    eq(oraoRequestPda(s).toBase58(), c.vrf_request, `${key} vrf_request`);
  }
}
eq(legacyDrawPda(0).toBase58(), v.pdas.draw_0, "v2 draw_0");
eq(legacyV3DrawPda(2).toBase58(), v.pdas_v3.draw_2, "v3 draw_2");
console.log(`fairness vectors OK (${n} checks)`);
