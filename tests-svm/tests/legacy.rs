//! legacy_close_v2: closing v2 draws (raw-byte parse) — real devnet bytes plus synthetic v2 layouts.
mod common;

use anchor_lang::prelude::{borsh, Pubkey};
use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use common::*;
use drawsol::instructions::{v2_offsets, V2_DRAW_DISCRIMINATOR, V2_DRAW_LEN, V2_VAULT_DISCRIMINATOR};
use solana_signer::Signer;

/// Independent replica of the v2 `Draw` account (SPEC.md §2.2) used to build v2 bytes in tests.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Debug)]
struct V2Tier {
    amount: u64,
    odds: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
struct V2Draw {
    id: u64,
    authority: Pubkey,
    status: u8,
    ticket_price: u64,
    ticket_cap: u32,
    max_per_tx: u16,
    max_per_wallet: u32,
    free_cap: u32,
    created_at: i64,
    closes_at: i64,
    prize_lamports: u64,
    iw_reserve_lamports: u64,
    iw_paid_lamports: u64,
    iw_denominator: u32,
    iw_tiers: [V2Tier; 4],
    proceeds_lamports: u64,
    refunded_lamports: u64,
    paid_tickets: u32,
    free_tickets: u32,
    next_ticket: u32,
    entry_count: u32,
    paid_entries: u32,
    revealed_entries: u32,
    draw_vrf_request: Pubkey,
    draw_vrf_seed: [u8; 32],
    randomness: [u8; 64],
    winning_ticket: u32,
    winning_entry: Pubkey,
    winner: Pubkey,
    settled_at: i64,
    prize_paid: bool,
    proceeds_withdrawn: bool,
    reserve_withdrawn: bool,
    terms_hash: [u8; 32],
    bump: u8,
    vault_bump: u8,
}

impl V2Draw {
    fn bytes(&self) -> Vec<u8> {
        let mut out = V2_DRAW_DISCRIMINATOR.to_vec();
        self.serialize(&mut out).unwrap();
        out
    }
    fn parse(data: &[u8]) -> Self {
        V2Draw::try_from_slice(&data[8..]).unwrap()
    }
}

fn disc(name: &str) -> [u8; 8] {
    anchor_lang::solana_program::hash::hashv(&[format!("account:{name}").as_bytes()]).to_bytes()[..8]
        .try_into()
        .unwrap()
}

/// Installs a v2 draw + vault at their v2 PDAs. Returns (draw, vault, total lamports).
fn install(env: &mut Env, id: u64, draw_bytes: Vec<u8>, draw_lamports: u64, vault_lamports: u64) -> (Pubkey, Pubkey, u64) {
    let d = legacy_draw_pda(id);
    let v = legacy_vault_pda(&d);
    env.set_program_account(d, draw_bytes, draw_lamports);
    env.set_program_account(v, V2_VAULT_DISCRIMINATOR.to_vec(), vault_lamports);
    (d, v, draw_lamports + vault_lamports)
}

fn close(env: &mut Env, id: u64) -> Result<TxOk, String> {
    let admin = env.admin.insecure_clone();
    let c = env.cranker.insecure_clone();
    let ix = env.ix_legacy_close(&admin.pubkey(), id);
    env.send(&[ix], &[&c, &admin])
}

#[test]
fn v2_layout_constants_match_the_real_devnet_bytes() {
    assert_eq!(V2_DRAW_DISCRIMINATOR, disc("Draw"));
    assert_eq!(V2_VAULT_DISCRIMINATOR, disc("Vault"));
    for f in ["v2_draw_0.json", "v2_draw_1.json"] {
        let raw = rpc_fixture_data(f);
        assert_eq!(raw.len(), V2_DRAW_LEN);
        assert_eq!(raw[..8], V2_DRAW_DISCRIMINATOR);
        // the replica round-trips the real bytes exactly, so its field order is the v2 layout...
        let d = V2Draw::parse(&raw);
        assert_eq!(d.bytes(), raw, "{f}");
        // ...and the program's offsets point at the right fields
        let u32_at = |o: usize| u32::from_le_bytes(raw[o..o + 4].try_into().unwrap());
        assert_eq!(u64::from_le_bytes(raw[v2_offsets::ID..v2_offsets::ID + 8].try_into().unwrap()), d.id);
        assert_eq!(raw[v2_offsets::STATUS], d.status);
        assert_eq!(u32_at(v2_offsets::NEXT_TICKET), d.next_ticket);
        assert_eq!(u32_at(v2_offsets::ENTRY_COUNT), d.entry_count);
        assert_eq!(raw[v2_offsets::PRIZE_PAID] == 1, d.prize_paid);
        assert_eq!(raw[v2_offsets::PROCEEDS_WITHDRAWN] == 1, d.proceeds_withdrawn);
        assert_eq!(raw[v2_offsets::RESERVE_WITHDRAWN] == 1, d.reserve_withdrawn);
    }
    assert_eq!(rpc_fixture_data("v2_vault_1.json"), V2_VAULT_DISCRIMINATOR.to_vec());
}

#[test]
fn closes_devnet_draw_1_zero_entries_with_escrow() {
    let mut env = Env::new();
    let raw = rpc_fixture_data("v2_draw_1.json");
    let d = V2Draw::parse(&raw);
    assert_eq!((d.id, d.status, d.entry_count, d.next_ticket), (1, 0, 0, 0), "open, no entries");
    let (draw, vault, total) = install(&mut env, 1, raw, rpc_fixture_lamports("v2_draw_1.json"), rpc_fixture_lamports("v2_vault_1.json"));
    assert!(total > 3 * SOL, "3 SOL escrow + rent");

    // admin only
    let mallory = env.user(1);
    let ix = env.ix_legacy_close(&mallory.pubkey(), 1);
    expect_err(env.send(&[ix], &[&mallory]), &code("Unauthorized"));
    // id must match the PDA / the stored id
    expect_err(close(&mut env, 5), &code("NotLegacyAccount"));

    let a0 = env.balance(&env.admin.pubkey());
    close(&mut env, 1).unwrap();
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, total, "every lamport to the admin");
    for k in [draw, vault] {
        assert_eq!(env.balance(&k), 0);
        assert!(env.svm.get_account(&k).map_or(true, |a| a.data.is_empty() && a.owner != drawsol::ID));
    }
    expect_err(close(&mut env, 1), &code("NotLegacyAccount"));
}

#[test]
fn closes_devnet_draw_0_settled_and_withdrawn() {
    let mut env = Env::new();
    let raw = rpc_fixture_data("v2_draw_0.json");
    let d = V2Draw::parse(&raw);
    assert_eq!(d.status, 2, "settled");
    assert!(d.entry_count > 0 && d.prize_paid && d.proceeds_withdrawn && d.reserve_withdrawn);
    let (_, _, total) = install(&mut env, 0, raw, rpc_fixture_lamports("v2_draw_0.json"), rpc_fixture_lamports("v2_vault_0.json"));
    let a0 = env.balance(&env.admin.pubkey());
    close(&mut env, 0).unwrap();
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, total);
}

#[test]
fn refuses_v2_draws_with_liabilities() {
    let mut env = Env::new();
    let base = V2Draw::parse(&rpc_fixture_data("v2_draw_1.json"));
    let lam = env.rent(V2_DRAW_LEN);

    // built from scratch in the v2 layout: an open draw with entries
    let mut d = base.clone();
    d.id = 7;
    (d.entry_count, d.next_ticket, d.paid_tickets) = (3, 10, 10);
    install(&mut env, 7, d.bytes(), lam, 2 * SOL);
    expect_err(close(&mut env, 7), &code("LegacyNotClosable"));

    // only free tickets / only an entry counter set: still refused
    let mut d = base.clone();
    d.id = 8;
    d.next_ticket = 1;
    install(&mut env, 8, d.bytes(), lam, SOL);
    expect_err(close(&mut env, 8), &code("LegacyNotClosable"));

    // settled draw #0 whose reserve was not withdrawn yet, or proceeds, or prize unpaid
    let d0 = V2Draw::parse(&rpc_fixture_data("v2_draw_0.json"));
    for (i, f) in [
        |d: &mut V2Draw| d.reserve_withdrawn = false,
        |d: &mut V2Draw| d.proceeds_withdrawn = false,
        |d: &mut V2Draw| d.prize_paid = false,
        |d: &mut V2Draw| d.status = 3, // cancelled with entries: refunds may be owed
    ]
    .iter()
    .enumerate()
    {
        let mut d = d0.clone();
        d.id = 20 + i as u64;
        f(&mut d);
        install(&mut env, d.id, d.bytes(), lam, SOL);
        expect_err(close(&mut env, d.id), &code("LegacyNotClosable"));
    }

    // not a v2 Draw: wrong discriminator / wrong length
    let mut bad = base.clone();
    bad.id = 30;
    let mut bytes = bad.bytes();
    bytes[0] ^= 1;
    install(&mut env, 30, bytes, lam, SOL);
    expect_err(close(&mut env, 30), &code("NotLegacyAccount"));
    let mut bad = base.clone();
    bad.id = 31;
    let mut bytes = bad.bytes();
    bytes.push(0);
    install(&mut env, 31, bytes, lam, SOL);
    expect_err(close(&mut env, 31), &code("NotLegacyAccount"));
}
