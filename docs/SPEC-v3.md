# DrawSol v3 — Spec

v3 upgrades the devnet program **in place** (same program ID `FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb`,
same upgrade authority). v2 accounts are not readable by v3 except through `legacy_close_v2` (§2.9).
Everything in SPEC.md (v2) still applies unless this document changes it. Research basis:
`docs/research/ie-uk-prize-competitions.md`.

## 1. The model in one screen

Two kinds of draw, both **profitable for the operator by construction** — enforced by the program, not by hope.

| | **Pot draw** (nightly, automatic) | **Headline draw** (weekly, `/live` show) |
|---|---|---|
| Grand prize | The pot: `pot_bps` of every paid ticket, plus any unwon instant pool at the end. Grows live. | Fixed, escrowed by the authority at creation |
| Instant wins | Yes — paid from the instant pool (`instant_bps` of every paid ticket) | **None** |
| House share | `house_bps` of every paid ticket (5000–6000 bps; default 5500), withdrawable any time | ≥ `house_bps` at sell-out (checked at creation); ≥ `floor_margin_bps` at `min_tickets` |
| Undersold | Never refunded; drawn with whatever sold (0 tickets → closed) | Below `min_tickets` at draw time → cancelled, **full refunds**, prize back to authority |
| Who creates it | Admin or keeper (no escrow needed) | Admin only (escrows the prize) |

Why no instant wins in headline draws: a draw that can be refunded must never have paid anything out
first, or people could collect an instant win and still be refunded.

Ticket price is flat in SOL. Max 25 per purchase.

## 2. Program

### 2.1 Constants

```
MAX_PER_TX = 25            MAX_TIERS = 4
HOUSE_BPS_MIN = 5000       HOUSE_BPS_MAX = 6000
FLOOR_MARGIN_BPS_MIN = 1000
CANCEL_GRACE_SECS = 48h    (Drawing for longer than this after draw_at → anyone may cancel; refunds)
PUBLIC_GRACE_MAX = 48h     (window after draw_at in which only keeper/authority may request the draw)
LIMIT_INCREASE_DELAY = 72h
PERIOD_SECS = 30 days      (spend-limit period)
Seeds: b"config", b"draw3", b"vault3", b"player3", b"entry3", b"profile"
VRF domains: b"drawsol:v3:entry", b"drawsol:v3:draw"
```

New seed names guarantee no collision with v2 PDAs.

### 2.2 Accounts (new account names → new discriminators; v2 `Draw`/`Entry`/`Player`/`Vault` types are removed)

**Config** `[b"config"]` — `admin, keeper: Pubkey, next_draw_id: u64, bump`. Layout is extended with `keeper`:
`init_config` already ran on devnet, so add **`migrate_config(keeper)`** (admin only) which reallocs the
existing Config account and sets `keeper`; and **`set_keeper(keeper)`** (admin only).

**DrawV3** `[b"draw3", id_le_u64]`
```
id, authority, kind: DrawKind (Pot | Headline), status: DrawStatus (Open | Drawing | Settled | Cancelled)
ticket_price u64, ticket_cap u32, max_per_tx u16, max_per_wallet u32, free_cap u32
created_at, closes_at, draw_at i64        // draw_at >= closes_at; sell-out ends sales early, the draw still waits for draw_at
public_grace_secs u32                     // only keeper/authority may request the draw during [draw_at, draw_at+grace)
// money
house_bps u16, pot_bps u16, instant_bps u16          // pot: house+pot+instant == 10000; headline: pot=instant=0
prize_lamports u64                         // headline: fixed escrow; pot: 0 (prize computed at settle)
min_tickets u32, floor_margin_bps u16      // headline only
pot_lamports u64                           // pot draws: accumulated pot share
instant_pool_lamports u64                  // pot draws: current instant pool balance
house_lamports u64, house_withdrawn u64
revenue_lamports u64, refunded_lamports u64
iw_denominator u32, iw_tiers [IwTierV3; 4] // IwTierV3 { odds u32, kind u8 (0 none,1 sol_share,2 credits), value u32 }
                                           // sol_share: value = bps of the entry's pool snapshot; credits: value = free-ticket credits
// counters
paid_tickets u32, free_tickets u32, credit_tickets u32, next_ticket u32
entry_count u32, rolled_entries u32 (entries that need a reveal), revealed_entries u32
// result
draw_vrf_request Pubkey, draw_vrf_seed [u8;32], randomness [u8;64]
winning_ticket u32, winning_entry Pubkey, winner Pubkey, prize_paid_lamports u64, settled_at i64, prize_paid bool
terms_hash [u8;32], bump, vault_bump
```

**VaultV3** `[b"vault3", draw]` — program-owned, zero fields; holds every lamport of the draw.

**PlayerV3** `[b"player3", draw, wallet]` — `tickets u32 (all kinds), paid u64, won_sol u64, won_credits u32, free_claimed bool, bump`.

**EntryV3** `[b"entry3", draw, seq_le_u32]`
```
draw, owner, seq, first_ticket u32, count u16
paid_count u16, credit_count u16, is_free bool
paid_lamports u64, created_at i64
pool_snapshot u64        // pot draws: instant_pool_lamports right AFTER this purchase's contribution
vrf_request Pubkey, vrf_seed [u8;32]   // default for headline entries (no roll)
needs_reveal bool, revealed bool
tiers [u8;25], sol_paid u64, credits_won u32
refunded bool, bump
```

**Profile** `[b"profile", wallet]` (global across draws; `init_if_needed` in buy/claim)
```
wallet, credits u32
limit_lamports u64 (0 = no limit), pending_limit u64, pending_from i64
period_start i64, period_spent u64
excluded_until i64
bump
```

### 2.3 Per-ticket money flow

`buy_tickets(quantity, use_credits, client_nonce)`: `paid = quantity - use_credits`; the buyer pays
`paid × ticket_price` into the vault. Then:
- **Pot:** `house += paid×price×house_bps/1e4`, `instant_pool += paid×price×instant_bps/1e4`, `pot += remainder`
  (remainder absorbs rounding so the three always sum to the payment).
- **Headline:** all of it to `revenue_lamports`; `house` is computed at settle.

Credit tickets (`use_credits`) and free entries add tickets but no money.

### 2.4 Instant wins (pot draws only)

Every ticket of a pot-draw entry (paid, credit or free) rolls once via the entry's ORAO request, exactly as
v2 (§2.3 of SPEC.md: `x = uniform(sha256(rand||"ticket"||ticket_le), denominator)`, cumulative tiers).
At `reveal_entry`:
- `sol_share` tier: owed `pool_snapshot × value / 1e4`. Total SOL paid for the entry =
  `min(Σ owed, instant_pool_lamports)`. The snapshot (taken at purchase) means delaying a reveal can't
  inflate a payout.
- `credits` tier: `profile.credits += value` for each such ticket.
- Pays the owner directly from the vault; `instant_pool -= paid`.
Validation at creation: `Σ odds ≤ denominator`; each `sol_share` value ≤ 5000 bps.
At settlement any remaining `instant_pool` rolls into the pot (paid to the winner). The house never takes it.

### 2.5 Free entries

`claim_free_entry(client_nonce)` — 1 per wallet per draw, `free_tickets < free_cap`. Pot draws: requests
ORAO and rolls like any ticket (paid from the pool, so the house share is untouched). Headline: grand draw
only, no roll (same as paid tickets there). The claimant pays network fees and rent (disclosed in the UI).
Free and credit tickets never count towards `min_tickets` or the sell-out (`ticket_cap` counts paid tickets).

### 2.6 Spend limits & self-exclusion (Profile)

- `set_limit(lamports)`: decrease or set-from-zero → immediate; increase → `pending_limit` effective after 72h.
- `self_exclude(until)`: sets `excluded_until = max(current, until)`; can't be shortened.
- `buy_tickets` rejects if `now < excluded_until`; rolls the 30-day period; rejects if
  `limit > 0 && period_spent + payment > limit`. Applies to paid amounts only.

### 2.7 Creation-time profitability checks

- `create_pot_draw(params)` — signer admin or keeper. `house_bps ∈ [5000,6000]`,
  `house+pot+instant == 10000`, `pot_bps ≥ 2000`, tiers valid, `closes_at > now`, `draw_at ≥ closes_at`,
  `public_grace ≤ 48h`. No escrow (vault rent only).
- `create_headline_draw(params)` — admin only. Escrows `prize_lamports`. Requires
  `ticket_cap × price × (1e4 − house_bps) / 1e4 ≥ prize` (house ≥ house_bps at sell-out) and
  `min_tickets × price × 1e4 ≥ prize × (1e4 + floor_margin_bps)` with `floor_margin_bps ≥ 1000`,
  `min_tickets ≤ ticket_cap`. No instant tiers allowed.

### 2.8 Draw lifecycle

- **`request_draw(client_nonce)`**: status Open, `now ≥ draw_at` (sales closed: `now ≥ closes_at` or sold out).
  Signer must be keeper/authority while `now < draw_at + public_grace_secs`; anyone after.
  - `next_ticket == 0` → Cancelled; headline prize back to authority.
  - Headline with `paid_tickets < min_tickets` → Cancelled; prize back to authority; refunds open.
  - Otherwise ORAO request; Drawing.
- **`settle_draw()`**: permissionless; winning ticket over `next_ticket` (all ticket kinds); winning entry
  range check; prize = headline `prize_lamports`, or pot `pot_lamports + instant_pool_lamports`.
  Headline: `house_lamports = revenue` at settle.
- **`cancel_draw()`**: Drawing and `now > draw_at + CANCEL_GRACE_SECS` (randomness never arrived).
  Headline: refunds + prize back. Pot: refunds per entry from the vault (see `claim_refund`). Because a pot
  draw can be cancelled, **the pot house share is withdrawable only after Settled** — it is never paid out
  while refunds could still be owed.
- **`claim_refund()`**: Cancelled; pays `entry.paid_lamports` minus `entry.sol_paid` (never negative; pot
  entries that already won instant SOL get the difference only). Headline entries never have instant wins.
- **`withdraw()`**: authority. Settled → `house_lamports − house_withdrawn` (pot), or revenue (headline).
  Cancelled headline → prize (escrow) once; never the refund liability.
- **`reveal_entry()`**: permissionless; pot draws; any status while the pool has funds; after settlement the
  pool is 0 so late reveals only record tiers and credits (UI prompts users to reveal; the keeper reveals
  everything before requesting the draw).

### 2.9 Legacy

`legacy_close_v2(draw_id)` — admin only. Reads the v2 `Draw` account `[b"draw", id]` **by raw bytes**
(discriminator `sha256("account:Draw")[..8]`; parse only the fields needed), requires
`entry_count == 0 && next_ticket == 0` **or** status Settled with prize paid and proceeds/reserve withdrawn,
transfers all lamports of the v2 vault `[b"vault", draw]` and the draw account to the admin, and zeroes them.
Used once for draw #1 (3 SOL escrow, 0 entries) and draw #0 (settled).

### 2.10 Events

`DrawCreated{kind,…}`, `TicketsPurchased{…, paid_count, credit_count}`, `EntryRevealed{tiers, sol_paid, credits_won}`,
`FreeEntryClaimed`, `DrawRequested`, `DrawSettled{winning_ticket, winner, prize}`, `DrawCancelled{reason}`,
`Refunded`, `Withdrawn`, `LimitSet`, `SelfExcluded`.

## 3. Parameters

**Devnet pot draw (nightly):** 0.01 SOL ticket, cap 300, house 5500 / pot 3500 / instant 1000, 25 per tx,
50 per wallet, free cap 15, closes 22:00 UTC, draw_at 22:00 UTC, public grace 30 min. Instant tiers (/1000):
- 15 × sol_share 2000 bps (20% of pool snapshot)
- 60 × sol_share 400 bps
- 150 × credits 1 (a free ticket)
→ any instant result 1 in 4.4; SOL win 1 in 13.3.

**Devnet headline draw (weekly, Sunday 20:00 UTC, `/live`):** prize 1 SOL, 0.01 SOL ticket, cap 230
(house ≥ 56% at sell-out), min 120 (≥ 20% margin at the minimum), free cap 15, no instant tiers.

**House target:** 55% (configurable 50–60%), shown openly on every draw: "55% house · 45% back to players".

## 4. Keeper & automation

- Dedicated **keeper keypair** (low balance, fees only) set via `migrate_config`. Never the admin key.
- `keeper/index.ts` loop (also runnable once per invocation for cron): reveal any unrevealed entries; create
  tonight's pot draw if none is scheduled; at `draw_at` request the draw; settle when fulfilled; post results.
- Runs on a schedule (GitHub Actions cron every 10 min, or any host). Anyone can still run every step after the
  public grace window.

## 5. Frontend (after the P0 research pass is published)

- Draw catalogue: tonight's pot draw + the weekly headline draw, with clear kind labels.
- Pot draw ticket: live pot ("Pot 0.84 SOL and rising"), instant pool, house split line
  ("55% house · 35% pot · 10% instant wins — every lamport on-chain").
- **Instant prize board** per draw: every win (wallet, ticket, tier, SOL or free ticket, entry link), tier
  table with odds and wins so far.
- Credits: "You have 3 free tickets" in the buy panel; "use credits" toggle.
- Profile: spend limit (decrease now / increase after 72h), self-exclusion, period spent.
- `/live` page: countdown to `draw_at`, "Drawing now", barcode roll stopping on the winning ticket, WON →
  PAID stamps, recompute; designed to be streamed (OBS) with no presenter.
- Headline draws: "Draws on {draw_at} once {min} tickets sell — otherwise everyone is refunded in full."

## 6. Deviations (implementation notes)

The program implements §2 as written. These are the places where §2 left a detail open, or where the
implementation adds a safeguard. The generated IDL (`app/src/idl/drawsol.json`) is authoritative for account
and argument names; the v2 IDL is kept as `app/src/idl/drawsol-v2.json` for reading legacy history.

**Interface**
- `init_config(keeper)` takes the keeper (fresh deployments only; devnet uses `migrate_config`).
- Creation params are nested: `PotDrawParams { common, pot_bps, instant_bps, iw_denominator, iw_tiers }`,
  `HeadlineDrawParams { common, prize_lamports, min_tickets, floor_margin_bps }`, with
  `CommonDrawParams { ticket_price, ticket_cap, max_per_tx, max_per_wallet, free_cap, closes_at, draw_at,
  public_grace_secs, house_bps, terms_hash }`. `create_pot_draw` signer account is `creator`; the draw's
  `authority` is always `config.admin` (the keeper never receives the house share).
- The ORAO accounts of `buy_tickets`, `claim_free_entry` and `request_draw` (`vrf_request, vrf_config,
  vrf_treasury, vrf`) are **optional**: pass `null` when no roll is made (headline entries, pot draws without
  instant tiers, and a `request_draw` that cancels). When a roll is made, all four are required and checked
  (`VrfWrongAccount` otherwise).
- `reveal_entry` and `claim_refund` also take the owner's `profile` (credits). `request_draw` takes `config`
  (keeper check). Profile instructions: `set_limit(lamports)`, `self_exclude(until)`, accounts
  `profile, wallet (signer), system_program` (`init_if_needed`).
- A pot draw with `iw_denominator = 0` (no tiers) makes no ORAO requests at all ("roll only where needed").
- `revenue_lamports` is kept for pot draws too (total paid). A pot draw's `prize_lamports` stays 0; the prize
  actually paid is `prize_paid_lamports`. `prize_paid` = prize disbursed (to the winner, or a headline escrow
  back to the authority).

**Extra validation**
- Common: `ticket_price > 0`, `ticket_cap > 0`, `1 ≤ max_per_tx ≤ 25`, `max_per_wallet ≥ 1`,
  `ticket_price × ticket_cap` fits u64. Headline: `prize > 0`, `min_tickets ≥ 1`.
- Tiers: kind 0 must be all-zero; `sol_share` needs `odds > 0`, `0 < value ≤ 5000`; `credits` needs `odds > 0`,
  `0 < value ≤ 100`; `iw_denominator = 0` ⇔ no tiers; and **expected credits per ticket < 1**
  (`Σ odds × value < denominator` over credit tiers) — the keeper can create pot draws, and a table paying more
  than one free ticket per ticket on average would let credits compound without limit.

**Behaviour**
- Sell-out closes sales for every ticket kind: once `paid_tickets == ticket_cap`, credit-only purchases and
  `claim_free_entry` fail with `SoldOut` too.
- Self-exclusion also blocks `claim_free_entry` and credit-only purchases (§2.6 names only paid buys).
- `set_limit`: setting the current value clears a pending change; removing the limit (`0`) counts as an
  increase (72 h). The period starts at the first purchase and restarts at `now` when 30 days have passed.
- `reveal_entry` is refused once a draw is **Cancelled** (`WrongStatus`): refunds are net of instant SOL, so a
  reveal after cancellation (or after a refund) could otherwise pay twice. Credits are credited with
  saturating arithmetic so a reveal can never be blocked.
- `claim_refund` also returns the entry's spent credits to the owner's profile. A free entry (nothing paid, no
  credits) fails with `NothingToRefund`.
- **Cancelled pot draws can be short.** An entry that won more instant SOL than it paid (a free or credit
  ticket, or a big win on a small purchase) keeps that SOL, so the refunds owed can exceed the vault by up to
  the instant SOL paid out. `claim_refund` never pays one player's refund with another's: it fails with
  `VaultShortfall` until the operator tops up the vault (a plain SOL transfer to the vault PDA);
  `admin.ts status` reports the shortfall. A cancelled pot draw's house share is never withdrawable (all
  remaining funds back refunds). This only happens if ORAO fails to answer the draw request for 48 h.
- `cancel_draw` moves no money; a cancelled headline's escrow returns through `withdraw` (once). A
  `request_draw` that cancels (no tickets / undersold) pays the headline prize straight back.
- `withdraw` errors with `NothingToWithdraw` when the amount would be 0.
- `legacy_close_v2` also checks the stored id, the v2 Vault discriminator and both lengths. A v2 draw that is
  Settled must have `prize_paid && proceeds_withdrawn && reserve_withdrawn`; Cancelled v2 draws are refused.
  v2 Entry/Player accounts of draw #0 stay on chain (their rent belongs to the buyers; v3 cannot read them).

**Errors** (full list in the IDL): v2's `FreeEntryNoReveal` became `NoInstantRoll`; new: `NothingToRefund`,
`DrawNotDue`, `InsufficientCredits`, `SpendLimitExceeded`, `SelfExcluded`, `VaultShortfall`,
`AlreadyMigrated`, `NotLegacyAccount`, `LegacyNotClosable`. A vault debit that would breach rent exemption is
`VaultShortfall`.

**Events**: `DrawCreated` carries kind, creator, times, split, prize and min; `TicketsPurchased` also carries
the draw's pot and instant pool after the purchase; `Refunded` carries `credits`. Extra events: `KeeperSet`,
`LegacyClosed`.

**Fairness**: unchanged except the seed domains. `ticket_tier` now takes the tiers' odds (`[u32; 4]`) — same
function. `tests-svm/fixtures/fairness_vectors.json` keeps its v2 sections byte-identical and adds
`entry_seed_v3`, `draw_seed_v3`, `pdas_v3`, `functions_v3`.

**Terms**: the hashed terms are `scripts/terms-pot.md` / `scripts/terms-headline.md` plus a parameter section
generated only from on-chain fields, so a keeper-created draw's terms can be re-rendered and checked with
`npx tsx scripts/admin.ts terms --draw <id>`.

**Upgrade runbook (devnet)**: `solana program extend FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb <bytes>` (see
`programs/drawsol/BUILD.md`) → `anchor upgrade` / `solana program deploy` → `admin.ts migrate-config --keeper
<pubkey>` → `admin.ts legacy-close --draw 1` and `--draw 0` → `admin.ts create-headline --preset weekly` →
fund the keeper and set the `KEEPER_SECRET` secret / `RPC_URL` variable for `.github/workflows/keeper.yml`.
Draw ids continue at 2.
