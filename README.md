# DrawSol - Win 100 SOL

Skill-based prize competition on Solana. Buy tickets, scratch for instant wins, and compete for the 100 SOL grand prize.

Built for the **Colosseum Frontier Hackathon 2026**.

## How It Works

1. **Answer & Buy** — Answer a skill question and buy tickets at $1.99 USDC each (bulk discounts up to 30%)
2. **Scratch & Win** — Every ticket triggers an on-chain scratch card via ORAO VRF. Win up to $50 USDC instantly
3. **Threshold Hit** — When the vault reaches 150% of the 100 SOL value, the grand draw triggers automatically
4. **Winner Selected** — VRF selects a random ticket. 100 SOL transferred directly to the winner

## Architecture

```
drawsol/
├── programs/drawsol/    # Anchor smart contract (Rust)
│   └── src/
│       ├── lib.rs               # Program entry point
│       ├── instructions/        # 7 instructions
│       ├── state/               # Account structs
│       ├── constants.rs         # Config values
│       └── errors.rs            # Custom errors
├── app/                 # Next.js 14 frontend
│   └── src/
│       ├── app/                 # Pages
│       ├── components/          # UI components
│       ├── hooks/               # React hooks
│       └── lib/                 # Anchor client, types
├── keeper/              # Keeper bot (TypeScript)
├── tests-svm/           # LiteSVM program tests (Rust) + fairness vectors
├── scripts/             # Admin CLI, terms, shared TS helpers
└── Anchor.toml          # Anchor config
```

## Smart Contract

**Program ID:** `FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb` (v2 — Anchor 0.31.1, ORAO VRF 0.6.1).
Full interface: [`docs/SPEC.md` §2](docs/SPEC.md). Build notes: [`programs/drawsol/BUILD.md`](programs/drawsol/BUILD.md).

Guarantees enforced on-chain:

- **Prize locked before sales.** `create_draw` moves prize + instant-win reserve into the draw's program vault in the same instruction.
- **Draw at sell-out or deadline.** `closes_at` is fixed at creation; anyone can run the draw once it is due.
- **Nobody chooses the randomness.** Every ORAO VRF seed is derived by the program from on-chain state; the request account is re-derived and checked (owner, address, seed, fulfilled) before use.
- **Anyone can settle.** The prize goes to the owner of the entry holding the winning ticket, whoever sends the transaction.
- **No stuck money.** If randomness never arrives (48 h after close) anyone can cancel, and every paid entry is refundable.

### Instructions

| Instruction | Who | Description |
|---|---|---|
| `init_config` | upgrade authority | Creates the Config; admin = the program's upgrade authority (checked via ProgramData) |
| `create_draw` | admin | Creates Draw + Vault, escrows prize + instant-win reserve, validates params (EV per ticket < price) |
| `buy_tickets(quantity, client_nonce)` | buyer | 1–25 tickets as one Entry (a ticket range); pays price × qty into the vault; requests ORAO randomness |
| `reveal_entry` | anyone | Recomputes each ticket's instant tier from the fulfilled randomness and pays min(total, reserve left) to the owner |
| `claim_free_entry` | wallet | One free grand-draw ticket per wallet, up to `free_cap` |
| `request_draw(client_nonce)` | anyone | Once due: requests the grand-draw randomness (or, with zero tickets, cancels and returns the escrow) |
| `settle_draw` | anyone | Computes the winning ticket and pays the prize to the owner of the entry that holds it |
| `cancel_draw` | anyone | Cancels a draw stuck in `Drawing` 48 h after close |
| `claim_refund` | anyone | Refunds a paid entry of a cancelled draw to its owner |
| `withdraw` | draw authority | Proceeds after settlement; unspent reserve once all entries are revealed (or 7 days); never the refund liability |

### Accounts

- **Config** `["config"]` — admin, next draw id
- **Draw** `["draw", id]` — parameters, counters, VRF request, result, payout flags
- **Vault** `["vault", draw]` — program-owned lamport escrow (prize + reserve + proceeds), always rent-exempt
- **Entry** `["entry", draw, seq]` — one purchase: owner, ticket range, VRF request, per-ticket tiers, amount paid
- **Player** `["player", draw, wallet]` — per-wallet totals (tickets, spent, won, free entry claimed)

### Economics

Everything is priced and paid in SOL; flat ticket price (every lamport buys the same odds).

| | Production (mainnet target) | Devnet demo |
|---|---|---|
| Prize | 100 SOL | 1 SOL |
| Ticket price | 0.015 SOL | 0.01 SOL |
| Ticket cap | 10,000 (sell-out = 1.5× prize) | 150 |
| Max per tx / wallet | 25 / 200 | 25 / 50 |
| Free entries | 5% of cap, 1 per wallet | 15, 1 per wallet |
| Instant tiers | 1 SOL 4, 0.25 SOL 16, 0.05 SOL 120, 0.015 SOL 400 (per 10,000) | 0.2 SOL 10, 0.05 SOL 40, 0.01 SOL 150 (per 1,000) |
| Instant hit rate | 1 in 18.5 | 1 in 5 (boosted "demo odds") |
| Instant-win reserve (escrowed) | 32 SOL | 2 SOL |

Instant wins are paid from the escrowed reserve in the reveal transaction, capped by what is left of it, so the
program is always solvent. Buyers also pay the ORAO VRF fee (0.0003 SOL on devnet) and rent for their Entry.

## Development

### Prerequisites

- Agave / solana-cli 2.1.21 (platform-tools v1.43)
- Anchor CLI 0.31.1
- Rust stable (host, for tests)
- Node.js 22

### Program

```bash
anchor build                                         # see programs/drawsol/BUILD.md for the lockfile recipe
cp target/idl/drawsol.json app/src/idl/drawsol.json  # the frontend uses the generated IDL
cp target/types/drawsol.ts  app/src/idl/drawsol.ts
cargo test --manifest-path tests-svm/Cargo.toml      # LiteSVM tests with the real ORAO program
```

### Admin CLI and keeper

```bash
npm install
npx tsx scripts/admin.ts init-config                       # signer = program upgrade authority
npx tsx scripts/admin.ts create-draw --preset demo         # [--prize SOL] [--reserve SOL] [--price SOL] [--cap N]
                                                           # [--minutes M] [--per-wallet N] [--free-cap N] [--dry-run]
npx tsx scripts/admin.ts status [--draw 0]
npx tsx scripts/admin.ts reveal-all --draw 0
npx tsx scripts/admin.ts run-draw --draw 0                 # request_draw, wait for ORAO, settle_draw
npx tsx scripts/admin.ts withdraw --draw 0
npx tsx keeper/index.ts                                    # loop: reveal, request when due, settle, cancel if stuck
npx tsx scripts/check-vectors.ts                           # TS fairness port vs Rust-generated vectors
```

`create-draw` hashes `scripts/terms.md` plus the draw's parameters and odds into `terms_hash` and saves the
rendered terms to `scripts/terms/draw-<id>.md` for publication.

Environment: `RPC_URL` (default `https://api.devnet.solana.com`), `KEYPAIR_PATH` (default
`~/.config/solana/id.json`); keeper also `POLL_MS`, `ONCE=1`.

### Frontend

```bash
cd app
yarn install
yarn dev
```

## Devnet Demo Flow

1. Initialize draw: `anchor run initialize`
2. Buy tickets via the frontend
3. VRF callback resolves instant wins
4. When threshold met, trigger grand draw
5. Settle draw — winner receives 100 SOL
6. Keeper processes pending instant win payouts

## Tech Stack

- **Smart Contract:** Anchor 0.30.1 / Rust
- **Frontend:** Next.js 14, Tailwind CSS, @solana/wallet-adapter
- **Oracles:** ORAO VRF (randomness), Pyth (SOL price)
- **Token:** USDC (SPL Token)
- **Wallets:** Phantom, Solflare, Backpack, Coinbase

## Legal

DrawSol is a skill-based competition, not a lottery. Every entry requires answering a general knowledge question correctly. Free entry route available (one per wallet per draw). Governed under Irish law. Tickets are non-refundable.

## License

MIT
