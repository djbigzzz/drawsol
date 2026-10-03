//! legacy_close_v3: closing v3 draws (raw-byte parse) — the real devnet accounts of draws #2–#6
//! (`solana account … --output json` dumps of 3 Oct 2026) plus synthetic v3 layouts.
mod common;

use anchor_lang::prelude::{borsh, Pubkey};
use anchor_lang::{AnchorDeserialize, AnchorSerialize};
use common::*;
use drawsol::instructions::{v3_offsets, V3_DRAW_DISCRIMINATOR, V3_DRAW_LEN, V3_VAULT_DISCRIMINATOR};
use solana_signer::Signer;

/// Independent replica of the v3 `DrawV3` account (SPEC-v3 §2.2) used to build v3 bytes in tests.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, PartialEq, Debug)]
struct V3Tier {
    odds: u32,
    kind: u8,
    value: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Debug)]
struct V3Draw {
    id: u64,
    authority: Pubkey,
    kind: u8,
    status: u8,
    ticket_price: u64,
    ticket_cap: u32,
    max_per_tx: u16,
    max_per_wallet: u32,
    free_cap: u32,
    created_at: i64,
    closes_at: i64,
    draw_at: i64,
    public_grace_secs: u32,
    house_bps: u16,
    pot_bps: u16,
    instant_bps: u16,
    prize_lamports: u64,
    min_tickets: u32,
    floor_margin_bps: u16,
    pot_lamports: u64,
    instant_pool_lamports: u64,
    house_lamports: u64,
    house_withdrawn: u64,
    revenue_lamports: u64,
    refunded_lamports: u64,
    iw_denominator: u32,
    iw_tiers: [V3Tier; 4],
    paid_tickets: u32,
    free_tickets: u32,
    credit_tickets: u32,
    next_ticket: u32,
    entry_count: u32,
    rolled_entries: u32,
    revealed_entries: u32,
    draw_vrf_request: Pubkey,
    draw_vrf_seed: [u8; 32],
    randomness: [u8; 64],
    winning_ticket: u32,
    winning_entry: Pubkey,
    winner: Pubkey,
    prize_paid_lamports: u64,
    settled_at: i64,
    prize_paid: bool,
    terms_hash: [u8; 32],
    bump: u8,
    vault_bump: u8,
}

impl V3Draw {
    fn bytes(&self) -> Vec<u8> {
        let mut out = V3_DRAW_DISCRIMINATOR.to_vec();
        self.serialize(&mut out).unwrap();
        out
    }
    fn parse(data: &[u8]) -> Self {
        V3Draw::try_from_slice(&data[8..]).unwrap()
    }
}

fn disc(name: &str) -> [u8; 8] {
    anchor_lang::solana_program::hash::hashv(&[format!("account:{name}").as_bytes()]).to_bytes()[..8]
        .try_into()
        .unwrap()
}

/// Installs a v3 draw + vault at their v3 PDAs. Returns (draw, vault, total lamports).
fn install(env: &mut Env, id: u64, draw_bytes: Vec<u8>, draw_lamports: u64, vault_lamports: u64) -> (Pubkey, Pubkey, u64) {
    let d = legacy_v3_draw_pda(id);
    let v = legacy_v3_vault_pda(&d);
    env.set_program_account(d, draw_bytes, draw_lamports);
    env.set_program_account(v, V3_VAULT_DISCRIMINATOR.to_vec(), vault_lamports);
    (d, v, draw_lamports + vault_lamports)
}

/// Installs the real devnet accounts of v3 draw `id` (checking the dumps are at the v3 PDAs).
fn install_devnet(env: &mut Env, id: u64) -> (Pubkey, Pubkey, u64, V3Draw) {
    let (data, lamports, pubkey) = cli_fixture(&format!("v3_draw_{id}.json"));
    assert_eq!(pubkey, legacy_v3_draw_pda(id), "fixture is the v3 draw PDA");
    let (vdata, vlamports, vpubkey) = cli_fixture(&format!("v3_vault_{id}.json"));
    assert_eq!(vpubkey, legacy_v3_vault_pda(&pubkey));
    assert_eq!(vdata, V3_VAULT_DISCRIMINATOR.to_vec());
    let d = V3Draw::parse(&data);
    assert_eq!(d.id, id);
    let (draw, vault, total) = install(env, id, data, lamports, vlamports);
    (draw, vault, total, d)
}

fn close(env: &mut Env, id: u64) -> Result<TxOk, String> {
    let admin = env.admin.insecure_clone();
    let c = env.cranker.insecure_clone();
    let ix = env.ix_legacy_close_v3(&admin.pubkey(), id);
    env.send(&[ix], &[&c, &admin])
}

#[track_caller]
fn assert_closed(env: &Env, draw: Pubkey, vault: Pubkey) {
    for k in [draw, vault] {
        assert_eq!(env.balance(&k), 0);
        assert!(env.svm.get_account(&k).map_or(true, |a| a.data.is_empty() && a.owner != drawsol::ID));
    }
}

#[test]
fn v3_layout_constants_match_the_real_devnet_bytes() {
    assert_eq!(V3_DRAW_DISCRIMINATOR, disc("DrawV3"));
    assert_eq!(V3_VAULT_DISCRIMINATOR, disc("VaultV3"));
    for id in 2..=6u64 {
        let (raw, _, _) = cli_fixture(&format!("v3_draw_{id}.json"));
        assert_eq!(raw.len(), V3_DRAW_LEN);
        assert_eq!(raw[..8], V3_DRAW_DISCRIMINATOR);
        // the replica round-trips the real bytes exactly, so its field order is the v3 layout...
        let d = V3Draw::parse(&raw);
        assert_eq!(d.bytes(), raw, "draw {id}");
        // ...and the program's offsets point at the right fields
        let u32_at = |o: usize| u32::from_le_bytes(raw[o..o + 4].try_into().unwrap());
        let u64_at = |o: usize| u64::from_le_bytes(raw[o..o + 8].try_into().unwrap());
        assert_eq!(u64_at(v3_offsets::ID), d.id);
        assert_eq!(raw[v3_offsets::KIND], d.kind);
        assert_eq!(raw[v3_offsets::STATUS], d.status);
        assert_eq!(u64_at(v3_offsets::HOUSE_LAMPORTS), d.house_lamports);
        assert_eq!(u64_at(v3_offsets::HOUSE_WITHDRAWN), d.house_withdrawn);
        assert_eq!(u64_at(v3_offsets::REVENUE_LAMPORTS), d.revenue_lamports);
        assert_eq!(u64_at(v3_offsets::REFUNDED_LAMPORTS), d.refunded_lamports);
        assert_eq!(u32_at(v3_offsets::NEXT_TICKET), d.next_ticket);
        assert_eq!(u32_at(v3_offsets::ENTRY_COUNT), d.entry_count);
        assert_eq!(raw[v3_offsets::PRIZE_PAID] == 1, d.prize_paid);
    }
}

#[test]
fn closes_devnet_draws_4_5_6_with_zero_entries_and_returns_the_escrow() {
    let mut env = Env::new();
    for (id, escrow) in [(4u64, 0u64), (5, SOL), (6, 4_191_100_000)] {
        let (draw, vault, total, d) = install_devnet(&mut env, id);
        assert_eq!((d.status, d.entry_count, d.next_ticket), (0, 0, 0), "draw {id}: open, no entries");
        assert_eq!(d.prize_lamports, escrow);
        assert!(env.balance(&vault) >= escrow, "vault holds the escrow");
        let a0 = env.balance(&env.admin.pubkey());
        close(&mut env, id).unwrap();
        assert_eq!(env.balance(&env.admin.pubkey()) - a0, total, "draw {id}: every lamport (escrow + rent) to the admin");
        assert_closed(&env, draw, vault);
        expect_err(close(&mut env, id), &code("NotLegacyAccount"));
    }
}

#[test]
fn closes_devnet_draw_2_settled_and_withdrawn() {
    let mut env = Env::new();
    let (draw, vault, total, d) = install_devnet(&mut env, 2);
    assert_eq!(d.status, 2, "settled");
    assert!(d.entry_count > 0 && d.prize_paid && d.house_withdrawn == d.house_lamports);
    let a0 = env.balance(&env.admin.pubkey());
    close(&mut env, 2).unwrap();
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, total);
    assert_closed(&env, draw, vault);
}

#[test]
fn closes_devnet_draw_3_cancelled_and_fully_refunded() {
    let mut env = Env::new();
    let (draw, vault, total, d) = install_devnet(&mut env, 3);
    assert_eq!((d.status, d.kind), (3, 1), "cancelled headline");
    assert!(d.prize_paid && d.refunded_lamports == d.revenue_lamports && d.entry_count > 0);
    // admin only
    let mallory = env.user(1);
    let ix = env.ix_legacy_close_v3(&mallory.pubkey(), 3);
    expect_err(env.send(&[ix], &[&mallory]), &code("Unauthorized"));
    // id must match the PDA / the stored id
    expect_err(close(&mut env, 9), &code("NotLegacyAccount"));
    let a0 = env.balance(&env.admin.pubkey());
    close(&mut env, 3).unwrap();
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, total);
    assert_closed(&env, draw, vault);
}

#[test]
fn refuses_v3_draws_with_liabilities() {
    let mut env = Env::new();
    let (open, _, _) = cli_fixture("v3_draw_6.json");
    let base = V3Draw::parse(&open);
    let lam = env.rent(V3_DRAW_LEN);

    // an open draw with entries
    let mut d = base.clone();
    d.id = 10;
    (d.entry_count, d.next_ticket, d.paid_tickets) = (3, 10, 10);
    install(&mut env, 10, d.bytes(), lam, 5 * SOL);
    expect_err(close(&mut env, 10), &code("LegacyNotClosable"));
    // only a free ticket: still refused
    let mut d = base.clone();
    d.id = 11;
    d.next_ticket = 1;
    install(&mut env, 11, d.bytes(), lam, SOL);
    expect_err(close(&mut env, 11), &code("LegacyNotClosable"));

    // settled #2 with the house not fully withdrawn / prize unpaid; cancelled #3 under-refunded / prize kept
    let (raw2, _, _) = cli_fixture("v3_draw_2.json");
    let settled = V3Draw::parse(&raw2);
    let (raw3, _, _) = cli_fixture("v3_draw_3.json");
    let cancelled = V3Draw::parse(&raw3);
    let cases: Vec<(V3Draw, fn(&mut V3Draw))> = vec![
        (settled.clone(), |d| d.house_withdrawn -= 1),
        (settled.clone(), |d| d.prize_paid = false),
        (settled.clone(), |d| d.status = 1), // Drawing
        (cancelled.clone(), |d| d.refunded_lamports -= 1),
        (cancelled.clone(), |d| d.prize_paid = false),
        (cancelled.clone(), |d| d.status = 0), // Open with entries
    ];
    for (i, (base, f)) in cases.into_iter().enumerate() {
        let mut d = base;
        d.id = 20 + i as u64;
        f(&mut d);
        install(&mut env, d.id, d.bytes(), lam, SOL);
        expect_err(close(&mut env, d.id), &code("LegacyNotClosable"));
    }
    // a cancelled pot draw (no escrow) fully refunded is closable even with prize_paid = false
    let mut d = cancelled.clone();
    d.id = 30;
    d.kind = 0;
    d.prize_lamports = 0;
    d.prize_paid = false;
    let (_, _, total) = install(&mut env, 30, d.bytes(), lam, SOL / 2);
    let a0 = env.balance(&env.admin.pubkey());
    close(&mut env, 30).unwrap();
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, total);

    // not a v3 DrawV3: wrong discriminator / wrong length / wrong vault discriminator
    let mut bad = base.clone();
    bad.id = 40;
    let mut bytes = bad.bytes();
    bytes[0] ^= 1;
    install(&mut env, 40, bytes, lam, SOL);
    expect_err(close(&mut env, 40), &code("NotLegacyAccount"));
    let mut bad = base.clone();
    bad.id = 41;
    let mut bytes = bad.bytes();
    bytes.push(0);
    install(&mut env, 41, bytes, lam, SOL);
    expect_err(close(&mut env, 41), &code("NotLegacyAccount"));
    let mut bad = base.clone();
    bad.id = 42;
    let (d, _, _) = install(&mut env, 42, bad.bytes(), lam, SOL);
    env.set_program_account(legacy_v3_vault_pda(&d), vec![0u8; 8], SOL);
    expect_err(close(&mut env, 42), &code("NotLegacyAccount"));
}
