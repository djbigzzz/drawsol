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
