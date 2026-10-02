/**
 * Checks scripts/lib.ts fairness functions against tests-svm/fixtures/fairness_vectors.json (Rust-generated):
 * the v2 sections (legacy draws #0–#1) with the v2 seed domains, the *_v3 sections with the v3 ones.
 */
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import {
  ROOT, drawPda, drawVrfSeed, drawVrfSeedV2, entryPda, entryVrfSeed, entryVrfSeedV2, legacyDrawPda, oraoRequestPda,
  playerPda, profilePda, ticketRoll, ticketTier, uniformIndex, vaultPda, winningTicket,
} from "./lib";

const v = JSON.parse(fs.readFileSync(path.join(ROOT, "tests-svm/fixtures/fairness_vectors.json"), "utf8"));
let n = 0;
const eq = (a: unknown, b: unknown, what: string) => {
  if (String(a) !== String(b)) throw new Error(`${what}: got ${a}, want ${b}`);
  n++;
};
for (const c of v.ticket_tier) {
  const r = Buffer.from(c.randomness, "hex");
  const roll = ticketRoll(r, c.ticket);
  eq(roll, c.roll, "roll");
  eq(uniformIndex(roll, c.denominator), c.x, "x");
  eq(ticketTier(r, c.ticket, c.denominator, c.tiers), c.tier, "tier");
}
for (const c of v.winning_ticket) eq(winningTicket(Buffer.from(c.randomness, "hex"), c.next_ticket), c.winning_ticket, "winner");
for (const [key, fn] of [["entry_seed", entryVrfSeedV2], ["entry_seed_v3", entryVrfSeed]] as const) {
  for (const c of v[key]) {
    const s = fn(new PublicKey(c.draw), new PublicKey(c.buyer), c.seq, Buffer.from(c.client_nonce, "hex"));
    eq(s.toString("hex"), c.seed, `${key} seed`);
    eq(oraoRequestPda(s).toBase58(), c.vrf_request, `${key} vrf_request`);
  }
}
for (const [key, fn] of [["draw_seed", drawVrfSeedV2], ["draw_seed_v3", drawVrfSeed]] as const) {
  for (const c of v[key]) {
    const s = fn(new PublicKey(c.draw), c.next_ticket, Buffer.from(c.client_nonce, "hex"));
    eq(s.toString("hex"), c.seed, `${key} seed`);
    eq(oraoRequestPda(s).toBase58(), c.vrf_request, `${key} vrf_request`);
  }
}
eq(legacyDrawPda(0).toBase58(), v.pdas.draw_0, "v2 draw_0");
const p = v.pdas_v3;
const d2 = drawPda(2);
eq(d2.toBase58(), p.draw_2, "draw_2");
eq(drawPda(3).toBase58(), p.draw_3, "draw_3");
eq(vaultPda(d2).toBase58(), p.vault_of_draw_2, "vault");
eq(entryPda(d2, 0).toBase58(), p.entry_0_of_draw_2, "entry 0");
eq(entryPda(d2, 7).toBase58(), p.entry_7_of_draw_2, "entry 7");
eq(playerPda(d2, new PublicKey(p.player_of_draw_2.wallet)).toBase58(), p.player_of_draw_2.player, "player");
eq(profilePda(new PublicKey(p.profile.wallet)).toBase58(), p.profile.profile, "profile");
console.log(`fairness vectors OK (${n} checks)`);
