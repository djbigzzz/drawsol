# DrawSol — Draw Terms (v4)

These terms are hashed (SHA-256) into the draw's on-chain `terms_hash` at creation. The hashed text is this
template followed by the "Parameters of this draw" section (generated only from the draw's parameters) and
the full list of winning numbers, so anyone can re-render it (`npx tsx scripts/admin.ts terms --draw <id>`)
and recompute the hash.

## 1. What you are entering

- A draw has a fixed end prize, a fixed ticket price, a fixed number of ticket numbers (0 to cap−1), a
  minimum number of paid tickets for the full end prize, a published schedule of instant prizes and fixed
  sales-close and draw times, all set on-chain before sales open and unchangeable afterwards.
- Before any ticket is sold the operator transfers the end prize **and** every instant prize of the schedule
  into the draw's program vault (the `DrawOpened` event carries the escrow amount and the hash of the schedule).
- Sales close at the closing time or when every ticket number is taken, whichever comes first. The end-prize
  draw happens at the draw time, never earlier. During the first minutes after the draw time only the
  operator's automation may start it; after that window anyone can, and anyone can settle it.
- **The draw is guaranteed.** If fewer paid tickets than the minimum have sold at the draw time, the end
  prize is the fallback pot — the pot share of ticket revenue — instead of the fixed prize. Nothing is refunded.
- The only refund path: if the randomness for the end-prize draw has not arrived 48 hours after the draw
  time, anyone can cancel the draw and every paid entry can be refunded in full, less the instant prizes it
  already received.

## 2. Randomness and ticket numbers

All randomness comes from ORAO VRF. Ticket numbers are **not** chosen by the buyer: when a purchase is
revealed, its numbers are drawn at random from the numbers still in the pool (Fisher–Yates swap-remove driven
by the purchase's VRF output), so no one can pick a known winning number. The end-prize draw picks a random
position among all tickets sold; the ticket at that position wins. The program derives every randomness seed
itself from on-chain state; nobody — buyer, operator or keeper — can choose the outcome. The functions are
published in the program source (`fairness.rs`) and in `scripts/lib.ts`, so every result can be recomputed.

## 3. Instant prizes

The schedule lists, per prize tier, exactly which ticket numbers win. The numbers were chosen before sales
opened by a seeded shuffle of all ticket numbers (Fisher–Yates, `j = sha256(seed || i) mod (i+1)` for
`i = cap−1 … 1`, seed = `sha256(draw id as u64 LE || the parameters section below)`), taking the first
numbers of the shuffle tier by tier. A ticket wins an instant prize the moment its purchase is revealed and
its number is one of the scheduled numbers; the prize is paid to the buyer's wallet in the same transaction.
Unsold winning numbers' prizes return to the operator after the draw. Anyone can reveal a purchase; the
operator's automation reveals every purchase before the end-prize draw.

## 4. Limits and free entry

- Maximum tickets per transaction and per wallet are set per draw (see below); every ticket kind counts.
- One free entry per wallet, up to the draw's free-entry cap, while sales are open. No purchase is needed. A
  free ticket is a normal ticket: it gets a random number and is eligible for every prize. The claimant's
  wallet pays only the Solana rent for the entry record, the VRF fee and the network fee.
- Ticket prices are flat: every ticket buys the same odds.

## 5. How this draw works

This is a prize draw: the result is decided by chance (section 2), and there is a free entry route
(section 4) alongside paid tickets. There is no entry question, in the app or on-chain.

## 6. Responsible play

18+ only. Play only with money you can afford to lose. You can set an on-chain spend limit per 30 days (a lower
limit applies at once, a higher one after 72 hours) and exclude yourself for any period; neither can be
shortened by anyone. Help is available at https://www.begambleaware.org. The devnet deployment uses play money
(devnet SOL).

## 7. Parameters of this draw

- Draw: #7
- Program: FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb
- Ticket price: 0.00838 SOL
- Ticket numbers: 0 to 1999 (2000 tickets of every kind); max 1000 per transaction, 2000 per wallet
- Free entries: up to 20, one per wallet
- Sales close: 2026-10-11T20:00:00.000Z (unix 1791748800) or at sell-out
- Draw time: 2026-10-11T20:00:00.000Z (unix 1791748800); keeper/operator-only for the first 30 min, then anyone
- End prize: 4.1922 SOL ($500 at $119.27 per SOL), escrowed in the vault at opening
- Minimum paid tickets for the full end prize: 1430; below that the end prize is the fallback pot, 35% of ticket revenue
- Split: 55% house · 35% end prize / fallback pot · 10% instant prizes (the schedule total is at most 10% of a sell-out)

### Instant prizes

| Prize | Winning numbers |
|---|---|
| 0.2095 SOL ($25) | 2 |
| 0.0838 SOL ($10) | 4 |
| 0.0419 SOL ($5) | 8 |
| 0.0168 SOL ($2) | 15 |
| 0.0084 SOL ($1) | 40 |

Schedule total: 1.6760 SOL, escrowed in the vault at opening.

### Winning numbers

Chosen before sales opened by the seeded shuffle described in section 3; every number below is
fixed in the on-chain schedule (hash published in the `DrawOpened` event).

- 0.2095 SOL ($25) × 2: 1228, 1516
- 0.0838 SOL ($10) × 4: 202, 253, 358, 566
- 0.0419 SOL ($5) × 8: 158, 399, 404, 533, 548, 1261, 1387, 1607
- 0.0168 SOL ($2) × 15: 41, 229, 254, 426, 759, 888, 1082, 1103, 1318, 1321, 1431, 1546, 1707, 1851, 1993
- 0.0084 SOL ($1) × 40: 76, 119, 133, 205, 243, 246, 324, 327, 388, 437, 472, 482, 590, 641, 654, 734, 798, 834, 878, 983, 1098, 1185, 1282, 1319, 1341, 1425, 1428, 1499, 1580, 1584, 1622, 1700, 1742, 1784, 1841, 1908, 1916, 1967, 1992, 1998
