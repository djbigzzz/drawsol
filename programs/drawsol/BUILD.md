# Building `drawsol` (v4)

## Toolchain

| Tool | Version |
|---|---|
| anchor-cli | 0.31.1 |
| solana-cli / cargo-build-sbf | 2.1.21 (Agave) — platform-tools v1.43 = rustc/cargo **1.79** |
| host Rust (tests, lockfile) | any recent stable (tested with 1.94) |
| Node | 22 (scripts / keeper) |

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
```

Program dependencies: `anchor-lang =0.31.1` (feature `init-if-needed`) and
`orao-solana-vrf =0.6.1` (`default-features = false, features = ["cpi"]`).

## Lockfile recipe (load-bearing)

The SBF build runs under platform-tools' own **cargo 1.79**, which cannot parse crates published with
`edition = "2024"` (or manifests needing newer cargo). A lockfile generated naively by a recent host cargo
pulls such crates in and `anchor build` then fails while *reading manifests*, before compiling anything.

What keeps it working:

1. `programs/drawsol/Cargo.toml` declares `rust-version = "1.79"`.
2. The workspace (`/Cargo.toml`) stays on `resolver = "2"`.
3. Generate the lockfile with the **host** cargo, telling the resolver to fall back to versions compatible
   with `rust-version`, then pin `blake3`:

```bash
rm -f Cargo.lock
CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS=fallback cargo generate-lockfile
cargo update -p blake3 --precise 1.8.2
```

`blake3` newer than 1.8.2 drags in `cpufeatures 0.3` (edition 2024). Check with
`grep -A1 'name = "cpufeatures"' Cargo.lock` — it must be `0.2.x`. If 1.8.2 ever starts pulling
`cpufeatures 0.3`, use `--precise 1.5.5`.

Do not run a plain `cargo update` afterwards; repeat the whole recipe instead.

## Build

```bash
anchor build
mkdir -p target/idl-v4 && cp target/idl/drawsol.json target/idl-v4/drawsol.json && cp target/types/drawsol.ts target/idl-v4/drawsol.ts
```

Outputs: `target/deploy/drawsol.so` (v4: 699,440 bytes), `target/idl/drawsol.json`, `target/types/drawsol.ts`.
`scripts/` and the keeper import the IDL from **`target/idl-v4/`** (the copy above; `target/` is gitignored, so
build before running them). The frontend keeps its own copy under `app/src/idl/` and is updated by its owner.

Note: `AccountInfo::resize` is not available in every `solana-account-info` 2.x that the program and the test
workspace resolve to, so the program uses the (deprecated) `realloc` with `#[allow(deprecated)]`.

Program ID `FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb` (keypair `target/deploy/drawsol-keypair.json`).

## Compute budget (clients)

`reveal_entry` does one swap-remove, one schedule lookup and (every 4 tickets) one sha256 per ticket, plus
the re-serialisation of the entry's two vectors. Measured in LiteSVM (`cargo test ... -- --nocapture`):

| instruction | CU |
|---|---|
| `reveal_entry`, 1 ticket | ≈ 25k |
| `reveal_entry`, 30 tickets | ≈ 37k |
| `reveal_entry`, 1000 tickets | **≈ 386k** (limit 1.4M; fails under the 200k default) |
| `buy_tickets`, 5 / 1000 tickets | ≈ 64k / 65k |
| `init_pool`, 2000 numbers | ≈ 75k |

≈ 24k + 362 CU per ticket. Clients must prepend `ComputeBudgetProgram.setComputeUnitLimit` to every reveal;
`scripts/lib.ts` uses `revealCuLimit(count) = min(1.4M, 80_000 + 400 × count)` (480k for 1000 tickets).
The tests send `SetComputeUnitLimit(1_400_000)` with every reveal (`tests/common/mod.rs`), and
`reveal_1000_tickets_fits_the_compute_budget` asserts the 1000-ticket reveal stays under 1.4M.

## Test

The tests live in `tests-svm/` (`config.rs`, `creation.rs`, `setup.rs`, `buy.rs`, `reveal.rs`, `settle.rs`,
`cancel.rs`, `profile.rs`, `legacy.rs`, `vectors.rs`; shared harness in `tests/common/mod.rs`) — a Rust
[LiteSVM](https://github.com/LiteSVM/litesvm) 0.6.1 harness in its **own** cargo workspace (empty `[workspace]`
table) so its host-only dependencies never enter the SBF lockfile. They load `target/deploy/drawsol.so`
(deployed as an upgradeable program with a real ProgramData account), the real ORAO VRF program dumped from
devnet (`tests-svm/fixtures/orao_vrf.so`) and ORAO's devnet network-state account
(`tests-svm/fixtures/network_state.json`). Fulfilment is simulated by rewriting the request account into the
fulfilled `RandomnessV2` layout. `legacy_close_v3` is tested on the real devnet v3 accounts
(`fixtures/v3_draw_{2..6}.json`, `v3_vault_{2..6}.json`: `solana account <pda> --url devnet --output json`
dumps of 3 Oct 2026; draw PDAs `[b"draw3", id le u64]`, vaults `[b"vault3", draw]`).

```bash
anchor build
cargo test --manifest-path tests-svm/Cargo.toml                 # 41 tests
cargo test --manifest-path tests-svm/Cargo.toml -- --nocapture  # prints the CU figures above
```

(The Node `litesvm` package crashes with `std::bad_alloc` on this program set — use the Rust harness.)

`tests-svm/tests/vectors.rs` also (re)generates `tests-svm/fixtures/fairness_vectors.json` — cross-language
vectors for `scripts/lib.ts` / the app's `fairness.ts`: v4 sections `assign` (random ticket assignment over a
pool state), `winning_position`, `entry_seed_v4`, `draw_seed_v4`, `pdas_v4`, `functions_v4`; the v2 / v3
sections are kept for the history of draws #0–#6. Regenerate with `DRAWSOL_REGEN_VECTORS=1 cargo test ... vectors`.
`npx tsx scripts/check-vectors.ts` checks the TypeScript port in `scripts/lib.ts` against them (118 checks).
`npx tsc --noEmit -p tsconfig.json` typechecks `scripts/` and `keeper/`.

Refreshing fixtures from devnet:

```bash
solana program dump -u d VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y tests-svm/fixtures/orao_vrf.so
curl -s https://api.devnet.solana.com -H 'content-type: application/json' -d \
  '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK",{"encoding":"base64"}]}' \
  > tests-svm/fixtures/network_state.json
```

## Upgrade devnet to v4 (in place)

The v4 program is larger than the deployed v3 ProgramData (659,472 bytes), so extend it first:

```bash
solana config set --url devnet
NEW=$(stat -c %s target/deploy/drawsol.so)                     # 699,440 at the time of writing
solana program show FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb   # Data Length: 659472
solana program extend FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb $((NEW - 659472))
#   +39,968 bytes ≈ 0.2030 SOL of extra rent (`solana rent 39968` → 0.20368768 SOL incl. the 128-byte
#   account overhead; ProgramData 3.3510 → ≈3.5540 SOL); the deploy buffer needs ≈ 3.55 SOL more
#   temporarily (refunded when the upgrade completes)
solana program deploy target/deploy/drawsol.so --program-id FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb
npx tsx scripts/admin.ts status                                     # Config is unchanged (v3 layout == v4)
npx tsx scripts/admin.ts legacy-close-v3 --draw 4                   # v3 pot #4: 0 entries
npx tsx scripts/admin.ts legacy-close-v3 --draw 5                   # v3 headline #5: 0 entries, 1 SOL escrow back
npx tsx scripts/admin.ts legacy-close-v3 --draw 6                   # v3 headline #6: 0 entries, 4.1911 SOL escrow back
npx tsx scripts/admin.ts legacy-close-v3 --draw 2                   # settled, house withdrawn
npx tsx scripts/admin.ts legacy-close-v3 --draw 3                   # cancelled, fully refunded
npx tsx scripts/admin.ts create-scratch --preset weekly             # draw #7: Draft + pool + schedule + terms
npx tsx scripts/admin.ts open --draw 7                              # escrows end prize + schedule (authority)
npx tsx scripts/admin.ts status
```

The keeper key stays as set (`set-keeper` to change it). `.github/workflows/keeper.yml` runs
`npx tsx keeper/index.ts --once` every 10 minutes (reveal / request / settle); weekly creation is the admin
step above. `npx tsx scripts/e2e-devnet-v4.ts` exercises one whole draw end to end (incl. a 1000-ticket entry).

## Deploy (fresh cluster)

```bash
solana rent $(( $(stat -c %s target/deploy/drawsol.so) + 45 ))   # ProgramData rent; budget ~2x for the deploy buffer
anchor deploy --provider.cluster <cluster>
npx tsx scripts/admin.ts init-config --keeper <KEEPER_PUBKEY>     # signer must be the upgrade authority
npx tsx scripts/admin.ts create-scratch --preset weekly && npx tsx scripts/admin.ts open --draw 0
```
