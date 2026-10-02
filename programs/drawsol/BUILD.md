# Building `drawsol` (v3)

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
```

Outputs: `target/deploy/drawsol.so` (v3: 659,472 bytes), `target/idl/drawsol.json`, `target/types/drawsol.ts`.
The frontend, `scripts/` and the keeper use the generated IDL; after every interface change copy it over:

```bash
cp target/idl/drawsol.json app/src/idl/drawsol.json
cp target/types/drawsol.ts  app/src/idl/drawsol.ts
```

`app/src/idl/drawsol-v2.json` is the frozen v2 IDL, kept only to decode legacy v2 history (draws #0–#1, their
entries and events). Do not overwrite it.

Note: `AccountInfo::resize` is not available in every `solana-account-info` 2.x that the program and the test
workspace resolve to, so the program uses the (deprecated) `realloc` with `#[allow(deprecated)]`.

Program ID `FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb` (keypair `target/deploy/drawsol-keypair.json`).

## Test

The tests live in `tests-svm/` (`config.rs`, `creation.rs`, `pot.rs`, `headline.rs`, `profile.rs`, `legacy.rs`,
`vectors.rs`; shared harness in `tests/common/mod.rs`) — a Rust [LiteSVM](https://github.com/LiteSVM/litesvm) 0.6.1 harness in its
**own** cargo workspace (empty `[workspace]` table) so its host-only dependencies never enter the SBF lockfile.
They load `target/deploy/drawsol.so` (deployed as an upgradeable program with a real ProgramData account), the
real ORAO VRF program dumped from devnet (`tests-svm/fixtures/orao_vrf.so`) and ORAO's devnet network-state
account (`tests-svm/fixtures/network_state.json`). Fulfilment is simulated by rewriting the request account into
the fulfilled `RandomnessV2` layout. The v2 → v3 migration tests use the real devnet v2 accounts
(`fixtures/v2_config.json`, `v2_draw_{0,1}.json`, `v2_vault_{0,1}.json`, `getAccountInfo` dumps from
2 Oct 2026; the Config's admin is swapped for the test admin).

```bash
anchor build
cargo test --manifest-path tests-svm/Cargo.toml
```

(The Node `litesvm` package crashes with `std::bad_alloc` on this program set — use the Rust harness.)

`tests-svm/tests/vectors.rs` also (re)generates `tests-svm/fixtures/fairness_vectors.json` — cross-language
vectors for `app/src/lib/fairness.ts` (v2 sections for legacy draws, `*_v3` sections for v3 seeds/PDAs). Regenerate with `DRAWSOL_REGEN_VECTORS=1 cargo test ... vectors`.
`npx tsx scripts/check-vectors.ts` checks the TypeScript port in `scripts/lib.ts` against them.

Refreshing fixtures from devnet:

```bash
solana program dump -u d VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y tests-svm/fixtures/orao_vrf.so
curl -s https://api.devnet.solana.com -H 'content-type: application/json' -d \
  '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK",{"encoding":"base64"}]}' \
  > tests-svm/fixtures/network_state.json
```

## Upgrade devnet to v3 (in place)

The v3 program is larger than the deployed v2 ProgramData (515,728 bytes), so extend it first:

```bash
solana config set --url devnet
NEW=$(stat -c %s target/deploy/drawsol.so)                     # 659,472 at the time of writing
solana program show FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb   # Data Length: 515728
solana program extend FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb $((NEW - 515728))
#   +143,744 bytes ≈ 0.7302 SOL of extra rent (ProgramData 2.6208 → 3.3510 SOL);
#   the deploy buffer needs ≈ 3.351 SOL more temporarily (refunded when the upgrade completes)
solana program deploy target/deploy/drawsol.so --program-id FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb
npx tsx scripts/admin.ts migrate-config --keeper <KEEPER_PUBKEY>  # realloc v2 Config → v3, set keeper
npx tsx scripts/admin.ts legacy-close --draw 1                     # v2 draw #1: 0 entries, 3 SOL escrow back
npx tsx scripts/admin.ts legacy-close --draw 0                     # v2 draw #0: settled, fully withdrawn
npx tsx scripts/admin.ts create-headline --preset weekly           # next Sunday 20:00 UTC
npx tsx scripts/admin.ts status
```

Then fund the keeper key (fees + rent for nightly draws, ~0.05 SOL lasts weeks), add the repo secret
`KEEPER_SECRET` (its JSON array) and the variable `RPC_URL`; `.github/workflows/keeper.yml` runs
`npx tsx keeper/index.ts --once` every 10 minutes and creates the nightly pot draw itself.
`npx tsx scripts/e2e-devnet-v3.ts` exercises one pot draw and one undersold headline draw end to end.

## Deploy (fresh cluster)

```bash
solana rent $(( $(stat -c %s target/deploy/drawsol.so) + 45 ))   # ProgramData rent; budget ~2x for the deploy buffer
anchor deploy --provider.cluster <cluster>
npx tsx scripts/admin.ts init-config --keeper <KEEPER_PUBKEY>     # signer must be the upgrade authority
npx tsx scripts/admin.ts create-pot --preset nightly
```
