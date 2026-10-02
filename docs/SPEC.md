# DrawSol v2 — Product & Interface Spec

This document is the single source of truth for the v2 rebuild. The program (`programs/drawsol`) and the
frontend (`app/`) both implement exactly this interface.

## 1. The idea in one paragraph

DrawSol is a prize draw where every promise is checkable on-chain. The prize is locked in a program vault
**before the first ticket sells**. Each draw has a fixed number of tickets and a fixed closing time; the draw
happens at sell-out or at the deadline, whichever comes first — guaranteed. Every ticket also gets an instant
result, decided by ORAO VRF randomness that nobody (buyer, operator, keeper) can choose, and paid in the same
transaction that reveals it. Anyone can trigger the draw and anyone can settle it — if the operator disappears,
the winner still gets paid. Everything is priced and paid in SOL.

### What changed from v1 and why

| v1 | v2 | Why |
|---|---|---|
| Prize deposited only when the pool reached 1.5× its USD value | Prize escrowed at `create_draw` | Players can verify the prize exists before buying |
| No deadline | `closes_at` fixed at creation, cannot change | No "dead pool"; money is never stuck |
| Callers passed the randomness in | ORAO VRF CPI; seeds fixed by program state | v1 let anyone pick any outcome |
| Buyer passed the SOL price, rewriting the threshold | No oracle — everything in SOL | Removed a griefing vector and FX risk |
| 1 Ticket account per purchase, `tickets_sold += qty` | One `Entry` per purchase owning a ticket **range** | v1 left unowned slots; the draw could get stuck forever |
| USDC tickets, USDC vault | SOL tickets, SOL vault | One asset; judges only need faucet SOL |
| Instant wins paid after 24h, unbacked | Paid in the reveal tx from an escrowed reserve | "Instant" is actually instant, and always solvent |
| Bulk discounts up to 30% | Flat price | Every lamport buys the same odds |
| Max 100 per tx | Max 25 per tx (hard cap), plus a per-wallet cap | Readable reveal; responsible play; bounded CU |
| Unlimited free entries via new wallets | 1 per wallet, capped by `free_cap`, grand draw only | Bounded dilution |
| Skill-answer hash on-chain (public, so it checked nothing) | No question: a prize draw decided by chance, with a free entry route beside paid tickets. Draws 0 and 1 were created with terms that mention an in-app question; it was removed from the app on 2 Oct 2026 and was never checked on-chain (research P0-3) | Don't claim enforcement we don't have |

## 2. Program

Program ID: `FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb` (new keypair; v1's `Ezd47g…` was never deployed).

Anchor `0.31.1`, `orao-solana-vrf = "=0.6.1"` (`default-features = false, features = ["cpi"]`),
Agave 2.1.21 / platform-tools v1.43. See `programs/drawsol/BUILD.md` for the lockfile recipe.

### 2.1 Constants

```
MAX_PER_TX           = 25        // hard cap, also the size of Entry.tiers
MAX_TIERS            = 4
CANCEL_GRACE_SECS    = 48 * 3600 // Drawing for this long after closes_at => anyone may cancel
RESERVE_UNLOCK_SECS  = 7 * 86400 // reserve leftovers withdrawable after this even if entries remain unrevealed
SEEDS: b"config", b"draw", b"vault", b"player", b"entry"
VRF seed domains: b"drawsol:v2:entry", b"drawsol:v2:draw"
```

### 2.2 Accounts (all `#[derive(InitSpace)]`)

**Config** — seeds `[b"config"]`
```
admin: Pubkey
next_draw_id: u64
bump: u8
```

**Draw** — seeds `[b"draw", id.to_le_bytes()]` (id: u64)
```
id: u64
authority: Pubkey              // admin at creation; receives proceeds/leftovers
status: DrawStatus             // Open | Drawing | Settled | Cancelled
ticket_price: u64              // lamports
ticket_cap: u32                // paid tickets
max_per_tx: u16                // <= 25
max_per_wallet: u32            // includes free entry
free_cap: u32                  // max free tickets (separate from ticket_cap)
created_at: i64
closes_at: i64
prize_lamports: u64
iw_reserve_lamports: u64       // escrowed instant-win budget
iw_paid_lamports: u64
iw_denominator: u32
iw_tiers: [IwTier; 4]          // IwTier { amount: u64, odds: u32 }; unused tiers = {0,0}
proceeds_lamports: u64         // sum of paid ticket revenue
refunded_lamports: u64
paid_tickets: u32
free_tickets: u32
next_ticket: u32               // paid + free; ticket numbers are 0..next_ticket
entry_count: u32
paid_entries: u32
revealed_entries: u32          // paid entries revealed
draw_vrf_request: Pubkey       // default until request_draw
draw_vrf_seed: [u8; 32]
randomness: [u8; 64]           // copied at settlement for audit
winning_ticket: u32
winning_entry: Pubkey
winner: Pubkey
settled_at: i64
prize_paid: bool
proceeds_withdrawn: bool
reserve_withdrawn: bool
terms_hash: [u8; 32]           // sha256 of the published terms + odds (draws 0–1: also the since-removed in-app question)
bump: u8
vault_bump: u8
```

**Vault** — seeds `[b"vault", draw.key()]`, program-owned, zero fields (`pub struct Vault {}`).
Holds prize + reserve + proceeds. The program debits it directly; it must stay rent-exempt.

**Player** — seeds `[b"player", draw.key(), wallet]`
```
draw: Pubkey
wallet: Pubkey
tickets: u32           // paid + free
spent: u64
won: u64               // instant wins paid
free_claimed: bool
bump: u8
```

**Entry** — seeds `[b"entry", draw.key(), seq.to_le_bytes()]` (seq: u32 = draw.entry_count at creation)
```
draw: Pubkey
owner: Pubkey
seq: u32
first_ticket: u32
count: u16
is_free: bool
paid_lamports: u64
created_at: i64
vrf_request: Pubkey    // default for free entries
vrf_seed: [u8; 32]
revealed: bool         // free entries are created revealed (no instant roll)
tiers: [u8; 25]        // per ticket: 0 = no win, 1..=4 = tier index+1
instant_paid: u64
refunded: bool
bump: u8
```

### 2.3 Randomness (ORAO VRF)

- Entry seed: `sha256("drawsol:v2:entry" || draw || buyer || seq_le_u32 || client_nonce[16])`.
- Draw seed: `sha256("drawsol:v2:draw" || draw || next_ticket_le_u32 || client_nonce[16])`.
- The handler re-derives the ORAO PDA `[b"orao-vrf-randomness-request", seed]` and requires the passed
  account to match; `request_v2` `init`s it, so a seed can never be reused. The nonce only prevents third
  parties pre-creating the PDA (griefing); it gives the caller no control over the output.
- Reading: owner must be the ORAO program, key must equal the stored request, the seed must match the stored
  seed, and the account must be fulfilled. `RandomnessAccountData::try_deserialize`.
- Per-ticket roll: `r = u64_le(sha256(rand64 || "ticket" || ticket_le_u32)[0..8])`,
  `x = (r as u128 * iw_denominator as u128 >> 64) as u32`; walk tiers cumulatively by `odds`; first tier with
  `x < cumulative` wins.
- Winning ticket: `r = u64_le(sha256(rand64 || "draw")[0..8])`, `w = (r as u128 * next_ticket as u128 >> 64)`.

The frontend implements the same functions in TS (`app/src/lib/fairness.ts`) so anyone can recompute results.

### 2.4 Instructions

All arithmetic is checked. All instructions emit an event (§2.5).

1. **`init_config()`** — signer must be the program's upgrade authority (checked through the ProgramData
   account). Creates Config with `admin = signer`.
2. **`create_draw(params: CreateDrawParams)`** — admin only. `CreateDrawParams { ticket_price, ticket_cap,
   max_per_tx, max_per_wallet, free_cap, closes_at, prize_lamports, iw_reserve_lamports, iw_denominator,
   iw_tiers: [IwTier;4], terms_hash }`. Creates Draw (id = `config.next_draw_id`, then increments it) and Vault,
   and transfers `prize + reserve` from the admin into the Vault in the same instruction. Validates:
   `closes_at > now`, `ticket_cap > 0`, `1 <= max_per_tx <= 25`, `max_per_wallet >= 1`, `prize > 0`,
   `sum(odds) <= denominator`, `denominator > 0`, expected instant payout per ticket `< ticket_price`.
3. **`buy_tickets(quantity: u16, client_nonce: [u8;16])`** — status Open, `now < closes_at`,
   `1 <= quantity <= max_per_tx`, `paid_tickets + quantity <= ticket_cap`,
   `player.tickets + quantity <= max_per_wallet`. Transfers `quantity * ticket_price` buyer → Vault, CPIs ORAO
   `request_v2` (buyer pays the ORAO fee), inits Entry and `init_if_needed` Player. Accounts: draw, vault,
   entry, player, buyer (signer), vrf_request, vrf_config (ORAO network state), vrf_treasury
   (`address = vrf_config.config.treasury`), vrf (ORAO program), system_program.
4. **`reveal_entry()`** — permissionless (anyone may pay the fee). Accounts: draw, vault, entry, player
   (of entry.owner), owner (`mut`, `address = entry.owner`), vrf_request (`address = entry.vrf_request`).
   Requires `!entry.revealed`, `!entry.is_free`. Computes tiers, pays `min(total, reserve remaining)` from the
   Vault to the owner, sets `revealed`, `tiers`, `instant_paid`, bumps `revealed_entries`, `iw_paid_lamports`,
   `player.won`. Allowed in any status while `!reserve_withdrawn`.
5. **`claim_free_entry()`** — status Open, `now < closes_at`, `free_tickets < free_cap`,
   `!player.free_claimed`, `player.tickets + 1 <= max_per_wallet`. Creates a 1-ticket Entry with
   `is_free = true, revealed = true`. Grand draw only.
6. **`request_draw(client_nonce: [u8;16])`** — permissionless. Status Open and
   (`now >= closes_at` or `paid_tickets == ticket_cap`).
   - If `next_ticket == 0`: refunds prize + reserve from the Vault to `authority` (passed, `mut`,
     `address = draw.authority`), sets `prize_paid = reserve_withdrawn = true`, status Cancelled.
   - Otherwise CPIs ORAO `request_v2` with the draw seed (caller pays the fee), stores request + seed,
     status Drawing.
7. **`settle_draw()`** — permissionless. Status Drawing. Accounts: draw, vault, vrf_request
   (`address = draw.draw_vrf_request`), winning_entry (Entry PDA of this draw), winner
   (`mut`, `address = winning_entry.owner`). Computes `w`, requires
   `first_ticket <= w < first_ticket + count`, pays `prize_lamports` Vault → winner, stores
   `randomness, winning_ticket, winning_entry, winner, settled_at`, `prize_paid = true`, status Settled.
8. **`cancel_draw()`** — permissionless. Status Drawing and `now > closes_at + CANCEL_GRACE_SECS`.
   Status Cancelled.
9. **`claim_refund()`** — permissionless. Status Cancelled, entry not free, not refunded. Pays
   `entry.paid_lamports` Vault → owner (`address = entry.owner`), `refunded = true`, bumps `refunded_lamports`.
10. **`withdraw()`** — authority only.
    - Settled and `!proceeds_withdrawn`: pays `proceeds_lamports`.
    - `!reserve_withdrawn` and status Settled or Cancelled and
      (`revealed_entries == paid_entries` or `now > closes_at + RESERVE_UNLOCK_SECS`): pays
      `iw_reserve - iw_paid`.
    - Cancelled and `!prize_paid`: pays `prize_lamports`. Never touches the refund liability
      (`proceeds - refunded`) while refunds are outstanding.
    Does whatever is currently allowed; errors if nothing is.

### 2.5 Events

```
DrawCreated      { draw, id, prize_lamports, iw_reserve_lamports, ticket_price, ticket_cap, closes_at }
TicketsPurchased { draw, entry, owner, seq, first_ticket, count, paid_lamports }
EntryRevealed    { draw, entry, owner, first_ticket, count, tiers: [u8;25], paid }
FreeEntryClaimed { draw, entry, owner, ticket }
DrawRequested    { draw, vrf_request, total_tickets }
DrawSettled      { draw, winning_ticket, winning_entry, winner, prize_lamports }
DrawCancelled    { draw, reason: u8 }  // 0 = no tickets, 1 = randomness timeout
Refunded         { draw, entry, owner, amount }
Withdrawn        { draw, amount }
```

### 2.6 Errors

`Unauthorized, InvalidParams, SalesClosed, SalesStillOpen, SoldOut, ExceedsPerTx, ExceedsWalletCap,
FreeCapReached, FreeAlreadyClaimed, WrongStatus, VrfWrongOwner, VrfWrongAccount, VrfSeedMismatch,
VrfNotFulfilled, AlreadyRevealed, FreeEntryNoReveal, WrongWinningEntry, NotCancellable, AlreadyRefunded,
NothingToWithdraw, MathOverflow`

### 2.7 Deviations

No deviations from the account fields, seeds, instruction names/args, event names or error list above.
The points below are where §2.4 left a detail open, and what the program does:

- **Account names the spec did not fix** (generated IDL, `app/src/idl/drawsol.json`, is authoritative):
  `init_config` = `config, admin, program, program_data, system_program`;
  `create_draw` = `config, draw, vault, admin, system_program`;
  `claim_free_entry` = `draw, entry, player, buyer (signer), system_program`;
  `request_draw` = `draw, vault, authority, payer (signer, pays ORAO fee), vrf_request, vrf_config, vrf_treasury, vrf, system_program`;
  `cancel_draw` = `draw`; `claim_refund` = `draw, vault, entry, owner`; `withdraw` = `draw, vault, authority (signer)`.
  `reveal_entry` and `settle_draw` take no signer account (the tx fee payer need not be listed).
  Anchor 0.31 auto-resolves the PDAs: e.g. `buyTickets(...).accounts({ draw, buyer, vrfRequest, vrfTreasury })` is enough.
- **Extra `create_draw` validation:** each tier must be either unused `{0,0}` or have both `amount > 0` and
  `odds > 0`; `ticket_price * ticket_cap` must fit in u64. (Both → `InvalidParams`.)
- **Error choices:** `quantity == 0` → `ExceedsPerTx`; `claim_refund` on a free entry → `FreeEntryNoReveal`;
  `reveal_entry` after the reserve was withdrawn → `WrongStatus`; a vault debit that would breach rent
  exemption (should be unreachable) → `MathOverflow`. A wrong `vrf_request` on `reveal_entry`/`settle_draw`
  fails the `address` constraint with `VrfWrongAccount`; an Entry of another draw fails Anchor's
  `ConstraintSeeds`; a wrong owner/winner account fails `ConstraintAddress`.
- **`withdraw`** succeeds when any action is allowed even if its amount is 0 (e.g. the reserve was fully paid
  out, so only `reserve_withdrawn` flips); `Withdrawn.amount` is the total paid in that call.
- **`request_draw` with zero tickets** refunds `prize + (reserve − iw_paid)` (iw_paid is necessarily 0) and
  emits `DrawCancelled { reason: 0 }`.
- The IDL also contains ORAO's `NetworkState` account type (because `vrf_config` is a typed account), so
  `program.account.networkState.fetch(...)` can read the ORAO treasury.

## 3. Draw parameters

| | Production (mainnet target) | Devnet demo |
|---|---|---|
| Prize | 100 SOL | 1 SOL |
| Ticket price | 0.015 SOL | 0.01 SOL |
| Ticket cap | 10,000 (sell-out = 1.5× prize) | 150 |
| Max per tx / wallet | 25 / 200 | 25 / 50 |
| Free cap | 5% of cap, 1 per wallet | 15, 1 per wallet |
| Instant tiers (denominator) | 1 SOL 4, 0.25 SOL 16, 0.05 SOL 120, 0.015 SOL 400 (/10,000) | 0.2 SOL 10, 0.05 SOL 40, 0.01 SOL 150 (/1,000) |
| Instant hit rate | 1 in 18.5 | 1 in 5 (boosted, labelled "demo odds") |
| Reserve | 32 SOL | 2 SOL |

## 4. Frontend

Static Next.js export on GitHub Pages (`basePath: /drawsol`). Talks to devnet via `NEXT_PUBLIC_RPC_URL`
(default `https://api.devnet.solana.com`). Uses the **generated** IDL (`app/src/idl/drawsol.json`) with
`@coral-xyz/anchor@0.31.1`. No hand-written IDL.

### 4.1 Honesty rules (non-negotiable)

- Every number comes from the chain. If a read fails: "Can't reach devnet — retry", no numbers.
- No invented activity, viewer counts, fallback ticket counts, or winners. Empty states are honest
  ("No tickets yet — the first entry gets ticket #0000").
- Reveal visuals show the tier already stored on-chain (or recomputed from the fulfilled randomness with
  `fairness.ts`, then confirmed by the reveal tx). Never decide a result in the client.
- USD values only as "≈ $X" from a live price, hidden when unavailable. No hard-coded price.
- Persistent "Devnet demo · play money" marker. Demo odds labelled as boosted.
- Never claim "not a lottery", "legal" or "compliant", and never call a draw a "competition" or a "skill" game.

### 4.2 Visual identity — "Night Draw" (broadcast studio)

> **Superseded by [`docs/DESIGN.md`](DESIGN.md) ("Ticket Office").** It replaces this section and the visual
> details of §4.3 (split-flaps, ON AIR lamp, "verify ↗" chips, mono labels). The §4.3 information architecture
> still holds; §4.1 and §4.4 are unchanged. The text below is kept for history only.

A lottery-draw TV studio rendered as an interface: split-flap boards, an ON AIR lamp, brass rules, and
physical ticket stubs. Motion only for real events (purchase confirmed, VRF landed, draw settled).

- Palette: studio black `#0B0A09`, board `#151311`, panel `#1C1A17`, line `#2A2622`, cream `#F3EAD6`,
  dim `#8A8174`, brass `#D4A24C` (prize/value — the only gold), on-air red `#FF3B2F` (live/urgent only),
  verified green `#4FB286` (sparingly: confirmed/verified chips).
- Type (self-hosted via `@fontsource`, no third-party CSS): **Big Shoulders Display** (condensed caps —
  headlines, board digits), **IBM Plex Sans** (UI/body), **IBM Plex Mono** (ticket numbers, hashes, odds).
- Signature elements: split-flap digits for prize / countdown / tickets sold / winning number;
  perforated ticket stubs (serial = on-chain ticket number) for entries; "verify ↗" chips next to every
  on-chain fact linking to Solscan (devnet).
- Banned: purple, glow blobs, floating particles, glassmorphism, shimmer on idle elements, emoji icons,
  gradient text everywhere.

### 4.3 Information architecture (single page + sections)

1. **Header** — wordmark, network chip (DEVNET), "My tickets", wallet button (restyled).
2. **On-air board (hero)** — Draw #N, ON AIR lamp when Open; prize on split-flap; "Locked in vault ·
   X SOL · verify ↗"; countdown with absolute close time (UTC + local); tickets sold / cap bar; current odds
   per ticket; instant-win hit rate. Primary CTA. When the draw is due, a permissionless "Run the draw"
   button (request_draw), then "Settle" when randomness is ready.
3. **Buy panel** (sticky on desktop, beside the board) — quantity stepper + presets 1/5/10/25 (clamped to
   remaining, per-tx and per-wallet allowances), price × qty, network fee note (ORAO fee ≈ 0.0005 SOL + rent),
   "your tickets after purchase / share of draw", 18+ confirmation (once per device), Buy. A "Free entry" tab
   sits beside "Buy tickets" at equal weight. States: disconnected, wrong balance, sold out, closed, wallet cap reached, tx pending/failed with
   decoded Anchor error.
4. **Reveal sheet** — (1) confirming purchase → (2) "Randomness requested from ORAO VRF" with request link,
   polls until fulfilled (~2 s) → (3) ticket stubs flip to their results, "Reveal all" → (4) total won,
   payout tx link. Reveal tx sent automatically after fulfilment.
5. **My tickets** — the wallet's entries as stubs (#0041–#0050), each ticket's instant result, status in the
   grand draw, refund button when Cancelled, spent/won totals for this draw.
6. **Live entries board** — departures-board list of real Entry accounts for the current draw (time, wallet,
   tickets, instant result). Honest empty state.
7. **Past draws** — settled/cancelled draws: winning ticket, winner, randomness, prize tx, "recompute" button
   that runs `fairness.ts` in the browser and shows it matches.
8. **The rules (how it works)** — four guarantees, each linked to its proof: prize in vault before sales;
   draw at sell-out or deadline; randomness from ORAO VRF (nobody chooses it); anyone can run and settle the
   draw. Plus odds table, free entry (claim button), a note on the removed question for draws whose terms mention it, responsible play (18+, caps,
   BeGambleAware link).
9. **Footer** — program ID ↗, source ↗, terms, devnet notice.

### 4.4 Data layer

- `useProgram()` — read-only Anchor Program (no wallet) + wallet Program when connected.
- `useDraws()` — Config + all Draw accounts (`program.account.draw.all()`), current = newest Open (else newest).
- `useDraw(id)` — Draw + Vault balance; `connection.onAccountChange` + 15 s poll fallback.
- `useEntries(draw)` — `program.account.entry.all([memcmp draw @ offset 8])`; `useMyEntries` adds owner filter.
- `useBuy()`, `useReveal()`, `useClaimFree()`, `useRunDraw()`, `useSettle()`, `useRefund()` — build txs with
  `.accountsPartial`, simulate first, map Anchor errors to human copy.
- Settle needs the winning entry: compute `w` client-side from the fulfilled randomness, find the Entry whose
  range contains it, pass it.
- `fairness.ts` — seeds, ORAO PDA derivation, roll and winner functions identical to §2.3.
