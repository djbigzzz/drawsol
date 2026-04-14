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
├── tests/               # Anchor integration tests
└── Anchor.toml          # Anchor config
```

## Smart Contract

**Program ID:** `Ezd47gH9g4jheYrN8M7svheSszkjpPXXvW3NHc2V4Emg`

### Instructions

| Instruction | Description |
|---|---|
| `initialize_draw` | Create a new draw with ticket cap and skill answer |
| `buy_tickets` | Purchase tickets with USDC, validates skill answer |
| `vrf_callback` | Resolve instant win outcome from VRF randomness |
| `trigger_grand_draw` | Lock 100 SOL when threshold met |
| `settle_draw` | Select winner via VRF, transfer prize, sweep vault |
| `process_payout` | Process due instant win payouts |
| `claim_free_entry` | One free entry per wallet per draw |

### Accounts

- **DrawState** — Global draw configuration and status
- **Ticket** — One per ticket, tracks owner and instant win
- **PendingPayout** — Pending instant win payouts
- **Vault (PDA)** — USDC token account holding all revenue
- **PrizeEscrow (PDA)** — Native SOL escrow for grand prize

### Economics

- Ticket price: $1.99 USDC
- Ticket cap: 25,000
- Grand prize: 100 SOL
- Bulk discounts: 10+ (10%), 30+ (20%), 70+ (30%)
- Instant win pool: $5,000 across 730 winners
- Draw trigger: vault >= SOL price × 100 × 1.5

## Development

### Prerequisites

- Rust 1.75+
- Solana CLI 1.18+
- Anchor CLI 0.30.1
- Node.js 18+
- Yarn

### Build

```bash
# Install dependencies
yarn install

# Build smart contract
anchor build
# or: cargo build-sbf --manifest-path programs/drawsol/Cargo.toml

# Run tests
anchor test

# Deploy to devnet
solana config set --url devnet
anchor deploy --provider.cluster devnet
```

### Frontend

```bash
cd app
yarn install
yarn dev
```

### Keeper Bot

```bash
cd keeper
yarn install
yarn start
```

Set environment variables:
- `RPC_URL` — Solana RPC endpoint (defaults to devnet)
- `KEYPAIR_PATH` — Path to payer keypair

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
