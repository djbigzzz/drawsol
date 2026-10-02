# Building `drawsol` (v2)

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

Outputs: `target/deploy/drawsol.so`, `target/idl/drawsol.json`, `target/types/drawsol.ts`.
The frontend uses the generated IDL; after every interface change copy it over:

```bash
cp target/idl/drawsol.json app/src/idl/drawsol.json
cp target/types/drawsol.ts  app/src/idl/drawsol.ts
```

Program ID `FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb` (keypair `target/deploy/drawsol-keypair.json`).

## Test

The tests live in `tests-svm/` — a Rust [LiteSVM](https://github.com/LiteSVM/litesvm) 0.6.1 harness in its
**own** cargo workspace (empty `[workspace]` table) so its host-only dependencies never enter the SBF lockfile.
They load `target/deploy/drawsol.so` (deployed as an upgradeable program with a real ProgramData account), the
real ORAO VRF program dumped from devnet (`tests-svm/fixtures/orao_vrf.so`) and ORAO's devnet network-state
account (`tests-svm/fixtures/network_state.json`). Fulfilment is simulated by rewriting the request account into
the fulfilled `RandomnessV2` layout.

```bash
anchor build
cargo test --manifest-path tests-svm/Cargo.toml
```

(The Node `litesvm` package crashes with `std::bad_alloc` on this program set — use the Rust harness.)

`tests-svm/tests/vectors.rs` also (re)generates `tests-svm/fixtures/fairness_vectors.json` — cross-language
vectors for `app/src/lib/fairness.ts`. Regenerate with `DRAWSOL_REGEN_VECTORS=1 cargo test ... vectors`.
`npx tsx scripts/check-vectors.ts` checks the TypeScript port in `scripts/lib.ts` against them.

Refreshing fixtures from devnet:

```bash
solana program dump -u d VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y tests-svm/fixtures/orao_vrf.so
curl -s https://api.devnet.solana.com -H 'content-type: application/json' -d \
  '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK",{"encoding":"base64"}]}' \
  > tests-svm/fixtures/network_state.json
```

## Deploy (devnet)

```bash
solana config set --url devnet
solana rent $(stat -c %s target/deploy/drawsol.so)     # ProgramData rent; budget ~2x for the deploy buffer
anchor deploy --provider.cluster devnet
npx tsx scripts/admin.ts init-config                  # signer must be the upgrade authority
npx tsx scripts/admin.ts create-draw --preset demo
```
