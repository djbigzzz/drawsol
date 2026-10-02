/** Checks scripts/lib.ts fairness functions against tests-svm/fixtures/fairness_vectors.json (Rust-generated). */
import { PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import { ROOT, drawVrfSeed, entryVrfSeed, oraoRequestPda, ticketRoll, ticketTier, uniformIndex, winningTicket } from "./lib";

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
for (const c of v.entry_seed) {
  const s = entryVrfSeed(new PublicKey(c.draw), new PublicKey(c.buyer), c.seq, Buffer.from(c.client_nonce, "hex"));
  eq(s.toString("hex"), c.seed, "entry seed");
  eq(oraoRequestPda(s).toBase58(), c.vrf_request, "entry vrf_request");
}
for (const c of v.draw_seed) {
  const s = drawVrfSeed(new PublicKey(c.draw), c.next_ticket, Buffer.from(c.client_nonce, "hex"));
  eq(s.toString("hex"), c.seed, "draw seed");
  eq(oraoRequestPda(s).toBase58(), c.vrf_request, "draw vrf_request");
}
console.log(`fairness vectors OK (${n} checks)`);
