# DrawSol — Pot Draw Terms (v3)

These terms are hashed (SHA-256) into the draw's on-chain `terms_hash` at creation. The hashed text is this
template followed by the "Parameters of this draw" section, which is generated only from the draw's on-chain
parameters, so anyone can re-render it (`npx tsx scripts/admin.ts terms --draw <id>`) and recompute the hash.

## 1. What you are entering

- A pot draw has a fixed ticket price, a fixed number of paid tickets and fixed sales-close and draw times,
  all set on-chain at creation and unchangeable.
- Every paid ticket is split on-chain the moment it is bought: the house share, the pot share and the
  instant-win share (see the parameters below). The three always add up to exactly the ticket price.
- The grand prize is the pot plus whatever is left in the instant-win pool when the draw is settled. It grows
  with every ticket sold. The house never takes the instant-win pool.
- Sales close at the closing time or when every paid ticket is sold, whichever comes first. The grand draw
  happens at the draw time, never earlier. During the first minutes after the draw time only the operator's
  automation may start it; after that window anyone can, and anyone can settle it. The prize is always paid
  to the owner of the winning ticket.
- A pot draw is drawn with whatever sold. If no tickets at all were entered, it is closed with nothing to pay.
- If the randomness for the grand draw has not arrived 48 hours after the draw time, anyone can cancel the
  draw. Every entry can then be refunded what it paid minus any instant-win SOL it already received. The house
  share is not withdrawable until the draw is settled, so it stays available for refunds.

## 2. Randomness

All randomness comes from ORAO VRF. The program derives every randomness seed itself from on-chain state;
nobody — buyer, operator or keeper — can choose an outcome. Each purchase gets its own randomness request,
which decides the instant result of every ticket in it. The grand draw uses one further request made at the
draw time. The functions are published in the program source (`fairness.rs`) and in the app (`fairness.ts`),
so any result can be recomputed.

## 3. Instant wins

Every ticket — paid, paid with a credit, or free — has an independent instant result. A SOL prize is a
percentage of the instant-win pool **as it stood right after your purchase** (your "pool snapshot"), so
revealing later can never change what you win. Payouts are limited to what the pool holds when the result is
revealed; if the pool is empty, a winning ticket is recorded but paid only what remains. A credit prize is a
free ticket you can use in any later purchase. Results can be revealed by anyone; after the draw is settled
the pool is empty, so late reveals record the result and credits only.

## 4. Limits, credits and free entry

- Maximum tickets per transaction and per wallet are set per draw (see below); every ticket kind counts toward
  the per-wallet limit.
- One free entry per wallet, up to the draw's free-entry cap, while sales are open. No purchase is needed.
  The claimant's wallet pays only the Solana rent, the network fee and the randomness fee.
- Free and credit tickets are numbered like any other ticket and have the same chance of the grand prize and
  of an instant result. They do not count toward the paid-ticket limit.
- Ticket prices are flat: every ticket buys the same odds.

## 5. How this draw works

This is a prize draw: every result is decided by chance (section 2), and there is a free entry route
(section 4) alongside paid tickets. There is no entry question, in the app or on-chain.

## 6. Responsible play

18+ only. Play only with money you can afford to lose. You can set an on-chain spend limit per 30 days (a lower
limit applies at once, a higher one after 72 hours) and exclude yourself for any period; neither can be
shortened by anyone. Help is available at https://www.begambleaware.org. The devnet deployment uses play money
(devnet SOL).

## 7. Parameters of this draw

- Draw: #4 (pot draw)
- Program: FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb
- Ticket price: 0.01 SOL
- Paid tickets: 300; max 25 per transaction, 50 per wallet (all ticket kinds)
- Free entries: up to 15, one per wallet
- Sales close: 2026-10-03T22:00:00.000Z (unix 1791064800) or at sell-out
- Draw time: 2026-10-03T22:00:00.000Z (unix 1791064800); keeper/operator-only for the first 30 min, then anyone
- Split of every paid ticket: 55% house · 35% pot · 10% instant-win pool
- Grand prize: the pot plus the unwon instant-win pool at settlement

### Instant-win table (per ticket)

| Prize | Odds |
|---|---|
| 20% of your pool snapshot (SOL) | 15 in 1,000 |
| 4% of your pool snapshot (SOL) | 60 in 1,000 |
| 1 free-ticket credit | 150 in 1,000 |

Any instant result: 1 in 4.4.
