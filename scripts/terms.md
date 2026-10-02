# DrawSol — Draw Terms (v2)

These terms are hashed (SHA-256) into each draw's on-chain `terms_hash` at creation. The rendered text for a
draw — this template followed by the "Parameters of this draw" section generated from the exact on-chain
parameters — is saved by `scripts/admin.ts create-draw` to `scripts/terms/draw-<id>.md` so anyone can
recompute the hash.

## 1. What you are entering

- Each draw has a fixed number of paid tickets and a fixed closing time, both set on-chain at creation and
  unchangeable.
- The grand prize is transferred into the draw's program vault when the draw is created, before any ticket
  is sold. The instant-win reserve is escrowed in the same vault at the same time.
- The grand draw happens when all paid tickets are sold or at the closing time, whichever comes first.
  Anyone can trigger it and anyone can settle it; the prize is always paid to the owner of the winning
  ticket.
- If the randomness for the grand draw has not arrived 48 hours after the closing time, anyone can cancel
  the draw and every paid entry can be refunded in full from the vault.
- If no tickets are entered by the closing time, the draw is cancelled and the escrow returns to the
  operator.

## 2. Randomness

All randomness comes from ORAO VRF. The program derives every randomness seed itself from on-chain state;
nobody — buyer, operator or keeper — can choose an outcome. Each purchase gets its own randomness request,
which decides the instant result of every ticket in it. The grand draw uses one further request made after
sales close. The functions are published in the program source (`fairness.rs`) and in the app
(`fairness.ts`), so any result can be recomputed.

## 3. Instant wins

Every paid ticket has an independent instant result decided by its purchase's randomness, paid in the same
transaction that reveals it from the escrowed reserve. Payouts are limited to the reserve remaining at the
time of the reveal; if the reserve is exhausted, a winning ticket is recorded but paid only what remains.
Free entries take part in the grand draw only and have no instant result.

## 4. Limits and free entry

- Maximum tickets per transaction and per wallet are set per draw (see below); the free entry counts toward
  the per-wallet limit.
- One free grand-draw entry per wallet, up to the draw's free-entry cap, while sales are open.
- Ticket prices are flat: every ticket buys the same odds.

## 5. Skill question

Before buying, the app asks the following question. It is asked in the app only and is **not** checked
on-chain.

> A split-flap board reads 097. Three more tickets sell. What does it read now?
> Options: 097 · 100 · 103 — correct answer: 100.

## 6. Responsible play

18+ only. Play only with money you can afford to lose. Help is available at https://www.begambleaware.org.
The devnet deployment uses play money (devnet SOL) and boosted "demo odds".
