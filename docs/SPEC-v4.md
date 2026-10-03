# DrawSol v4 — Spec

v4 replaces the v3 pot/headline kinds with ONE draw kind that matches how the best Irish/UK operators run a
competition (Ooosch "instant scratch" model), while keeping DrawSol's guarantees: prizes escrowed before
sales, randomness nobody can choose, every entry public, and a house share enforced by the program.
Same program ID `FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb`, upgraded in place. SPEC-v3 §2.6 (Profile:
spend limits, self-exclusion) is kept unchanged. Everything else in v3 is superseded.

## 1. The competition

- **End prize**, fixed and escrowed at open (e.g. $500 ≈ 4.19 SOL). Paid in full if `paid_tickets ≥ min_tickets`
  at the draw. Otherwise the end prize is the **fallback pot** = `pot_bps` of ticket revenue. The draw is
  **guaranteed**: it always happens, there are no refunds (except the VRF-timeout cancel path).
- **Instant prizes**: a published **schedule** of winning ticket numbers per tier (e.g. $25×2, $10×4, $5×8,
  $2×15, $1×40), fixed on-chain before sales open. Total ≤ `instant_bps` of `cap × price`. Escrowed at open.
  Unsold winning tickets' prizes return to the authority at settlement.
- **Ticket numbers are assigned at random** (ORAO VRF, Fisher–Yates over the remaining pool) when a purchase
  is revealed, so a known winning number cannot be sniped. Each ticket is a number in `0..cap`.
- **House share**: ≥ `house_bps` (5000–6000) of revenue in expectation at every sales level, enforced at open:
  `house_bps + pot_bps + instant_bps == 10000` and `min_tickets × price × (10000 − house_bps − instant_bps) / 10000 ≥ end_prize`
  and `Σ schedule ≤ instant_bps × cap × price / 10000`. (Instant payouts scale with sell-through in expectation
  because assignment is random; the worst case is bounded by the escrowed schedule total.)
- Per purchase up to `max_per_tx` (≤ 1000); per wallet `max_per_wallet` (e.g. 2000). Free entry: 1 per wallet,
  a normal ticket (random number, eligible for instant prizes and the end prize), `free_cap` per draw.

## 2. Accounts (new seeds; v3 types removed)

- **Config** `[b"config"]` — unchanged from v3 (admin, keeper, next_draw_id).
- **DrawV4** `[b"draw4", id_le_u64]`
  ```
  id, authority, status: Draft | Open | Drawing | Settled | Cancelled
  ticket_price u64, ticket_cap u32 (≤ 65_535), max_per_tx u16 (≤ 1000), max_per_wallet u32, free_cap u32
  created_at, closes_at, draw_at i64, public_grace_secs u32
  house_bps, pot_bps, instant_bps u16
  end_prize_lamports u64, min_tickets u32
  tiers [Tier; 8]  // Tier { amount u64, count u16, won u16 }
  schedule_total_lamports u64, schedule_set u32 (winning numbers registered so far)
  instants_paid u64, revenue u64, house_lamports u64, house_withdrawn u64
  paid_tickets u32, free_tickets u32, assigned u32 (tickets with numbers), next_pos u32 (positions handed out)
  entry_count u32, revealed_entries u32
  draw_vrf_request, draw_vrf_seed, randomness [u8;64], winning_pos u32, winning_ticket u32,
  winning_entry, winner, end_prize_paid u64, settled_at, prize_paid bool, escrow_returned bool
  terms_hash, bump, vault_bump, pool_bump, schedule_bump
  ```
- **Vault** `[b"vault4", draw]` — program-owned, holds everything.
- **Pool** `[b"pool", draw]` — `remaining: u32` then `u32[cap]` ticket numbers (filled 0..cap by `init_pool`
  in chunks of ≤ 2000 per call; realloc'd in ≤ 10 KB steps). Reveal does swap-remove.
- **Schedule** `[b"schedule", draw]` — `u8[cap]`: 0 = no prize, 1..=8 = tier index + 1; bit 7 = won.
- **PlayerV4** `[b"player4", draw, wallet]` — tickets, paid, won_lamports, free_claimed.
- **EntryV4** `[b"entry4", draw, seq_le_u32]`
  ```
  draw, owner, seq, first_pos u32, count u16, is_free bool, paid_lamports, created_at
  vrf_request, vrf_seed, revealed bool
  tickets: Vec<u32> (len == count after reveal), prizes: Vec<u8> (tier+1 per ticket, 0 none)
  instant_paid u64, bump
  ```
  Space is sized from `count` at purchase.
- **Profile** `[b"profile", wallet]` — unchanged (v3 §2.6).

## 3. Instructions

1. `create_draw(params)` — admin or keeper → status **Draft**. Params: price, cap, max_per_tx, max_per_wallet,
   free_cap, closes_at, draw_at, public_grace_secs, house/pot/instant bps, end_prize, min_tickets, tiers
   (amount, count), terms_hash. Validates the §1 inequalities and `Σ tiers.count ≤ cap`, `cap ≤ 65_535`.
   Creates Vault, Pool (header only), Schedule (zeroed, cap bytes; realloc in steps if > 10 KB).
2. `init_pool(from, to)` — fills `pool[from..to] = from..to` (chunks); Draft only.
3. `set_schedule(entries: Vec<(u32 ticket, u8 tier)>)` — Draft only, admin/keeper; each ticket once; updates
   `schedule_set` and per-tier registered counts. Batches of ≤ 300.
4. `open_draw()` — Draft → **Open**: requires the pool fully initialised, `schedule_set == Σ tiers.count`,
   and transfers `end_prize + schedule_total` from the signer (authority) into the Vault. Emits `DrawOpened`
   with the schedule hash (sha256 of the schedule bytes) so the published numbers are fixed.
5. `buy_tickets(quantity u16, client_nonce)` — Open, `now < closes_at`, caps, Profile limits/exclusion,
   `paid_tickets + quantity ≤ cap`. Pays `quantity × price`, splits house/pot/instant bookkeeping, CPIs ORAO,
   creates EntryV4 with `first_pos = next_pos`, `next_pos += quantity`. Sell-out (`paid_tickets == cap`) ends
   sales.
6. `claim_free_entry(client_nonce)` — 1 ticket, same as buy with no payment; `free_tickets < free_cap`;
   free tickets consume cap too (they are real numbers).
7. `reveal_entry()` — permissionless; reads fulfilled randomness; for i in 0..count: `r = u64(sha256(rand‖i))`,
   `j = r mod remaining`, `ticket = pool[j]`, swap-remove; `tier = schedule[ticket]`; if tier: mark won,
   `tiers[t].won += 1`, owed += amount. Pays owed from the Vault to the owner. Stores tickets/prizes.
   Compute: hash per ticket; `max_per_tx ≤ 1000` keeps it under the 1.4M CU request (client sets the CU limit).
8. `request_draw(client_nonce)` — Open and `now ≥ draw_at` (or sold out and `now ≥ draw_at`); keeper/authority
   during the public-grace window, anyone after. `next_pos == 0` → Cancelled + escrow returned. Else VRF → Drawing.
   Sales close at `closes_at` regardless.
9. `settle_draw()` — Drawing, fulfilled: `winning_pos = uniform(rand, next_pos)`; the winning EntryV4 must hold
   that position and be revealed (if unrevealed, the settle call reveals it first — settle requires the
   entry's VRF fulfilled; the keeper reveals everything before requesting). `winning_ticket = entry.tickets[pos − first_pos]`.
   End prize = `end_prize_lamports` if `paid_tickets ≥ min_tickets` else `pot_bps × revenue / 10000`.
   Pays the winner; returns unused escrow (`end_prize − paid` and `schedule_total − instants_paid`) to the
   authority; status Settled. `house_lamports = revenue − pot_paid_if_fallback` (house withdraws after Settled).
10. `cancel_draw()` — Drawing and `now > draw_at + 48h` with no fulfilment → Cancelled; refunds via
    `claim_refund()` net of instant SOL paid; escrow back to authority via `withdraw`.
11. `withdraw()` — authority; Settled: house share; Cancelled: escrow.
12. `set_limit`, `self_exclude` — unchanged.
13. `legacy_close_v3(draw_id)` — admin; closes v3 draws with zero entries (returns escrow) or settled/cancelled
    ones with nothing owed; zeroes their accounts.

Events: `DrawCreated, DrawOpened{schedule_hash}, TicketsPurchased, EntryRevealed{tickets, prizes, paid},
FreeEntryClaimed, DrawRequested, DrawSettled{winning_ticket, winner, end_prize_paid, fallback bool},
DrawCancelled, Refunded, Withdrawn, LimitSet, SelfExcluded`.

## 4. Demo parameters (devnet, draw #7)

End prize $500 = 4.1911 SOL (SOL at $119.30), price 0.00838 SOL (≈$1), cap 2,000, min 1,430,
house 5500 / pot 3500 / instant 1000, max_per_tx 1000, max_per_wallet 2000, free_cap 20,
closes/draws Sun 11 Oct 2026 20:00 UTC, public grace 30 min.
Schedule (≈$200 = 1.676 SOL): $25×2, $10×4, $5×8, $2×15, $1×40 (69 winning numbers), amounts converted at the
same SOL price; winning numbers chosen by the admin script with a seeded shuffle and published in
`scripts/terms/draw-7.md` (the terms hash covers them).

## 5. Keeper

As v3: reveal unrevealed entries; request at `draw_at`; settle when fulfilled; after settlement, create and
open the next week's draw from a preset. Runs with the keeper key; `open_draw` escrow must come from the
authority, so weekly creation is an admin step (`admin.ts create-scratch --preset weekly && open`).
