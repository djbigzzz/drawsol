# DrawSol — Headline Draw Terms (v3)

These terms are hashed (SHA-256) into the draw's on-chain `terms_hash` at creation. The hashed text is this
template followed by the "Parameters of this draw" section, which is generated only from the draw's on-chain
parameters, so anyone can re-render it (`npx tsx scripts/admin.ts terms --draw <id>`) and recompute the hash.

## 1. What you are entering

- A headline draw has a fixed grand prize, a fixed ticket price, a fixed number of paid tickets, a minimum
  number of paid tickets and fixed sales-close and draw times, all set on-chain at creation and unchangeable.
- The grand prize is transferred into the draw's program vault when the draw is created, before any ticket is
  sold.
- Sales close at the closing time or when every paid ticket is sold, whichever comes first. The grand draw
  happens at the draw time, never earlier. During the first minutes after the draw time only the operator's
  automation may start it; after that window anyone can, and anyone can settle it. The prize is always paid to
  the owner of the winning ticket.
- **If fewer paid tickets than the minimum have sold at the draw time, the draw is cancelled: every paid entry
  can be refunded in full from the vault, credits used are returned, and the prize returns to the operator.**
- If the randomness for the grand draw has not arrived 48 hours after the draw time, anyone can cancel the draw
  and every paid entry can be refunded in full.

## 2. Randomness

All randomness comes from ORAO VRF, requested once at the draw time. The program derives the randomness seed
itself from on-chain state; nobody — buyer, operator or keeper — can choose the outcome. The functions are
published in the program source (`fairness.rs`) and in the app (`fairness.ts`), so the result can be
recomputed.

## 3. No instant wins

Headline draws have no instant wins: a draw that can be refunded never pays anything out before the draw.

## 4. Limits, credits and free entry

- Maximum tickets per transaction and per wallet are set per draw (see below); every ticket kind counts toward
  the per-wallet limit.
- One free entry per wallet, up to the draw's free-entry cap, while sales are open. No purchase is needed. The
  claimant's wallet pays only the Solana rent for the entry record and the network fee.
- Free tickets and tickets paid with credits are numbered like any other ticket and have the same chance of the
  grand prize. They do not count toward the paid-ticket limit or the minimum.
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

- Draw: #6 (headline draw)
- Program: FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb
- Ticket price: 0.00838 SOL
- Paid tickets: 1150; max 25 per transaction, 50 per wallet (all ticket kinds)
- Free entries: up to 15, one per wallet
- Sales close: 2026-10-11T20:00:00.000Z (unix 1791748800) or at sell-out
- Draw time: 2026-10-11T20:00:00.000Z (unix 1791748800); keeper/operator-only for the first 30 min, then anyone
- Grand prize: 4.1911 SOL, escrowed in the vault at creation
- Minimum paid tickets: 560 — below this at the draw time, the draw is cancelled and every paid entry refunded in full
- House share: at least 55% of ticket revenue at sell-out; at least 10% over the prize at the minimum
