//! Creation-time profitability checks (SPEC-v3 §2.7).
mod common;

use common::*;
use drawsol::instructions::{HeadlineDrawParams, PotDrawParams};
use drawsol::state::{DrawKind, DrawStatus, IwTierV3};
use solana_signer::Signer;

fn try_pot(env: &mut Env, p: PotDrawParams) -> Result<(), String> {
    env.create_pot(p).map(|_| ())
}
fn try_headline(env: &mut Env, p: HeadlineDrawParams) -> Result<(), String> {
    env.create_headline(p).map(|_| ())
}

#[track_caller]
fn assert_invalid(r: Result<(), String>, what: &str) {
    match r {
        Ok(()) => panic!("{what}: accepted"),
        Err(e) => assert!(e.contains(&code("InvalidParams")), "{what}: {e}"),
    }
}

#[test]
fn pot_draw_by_admin_or_keeper_only() {
    let mut env = Env::new();
    let keeper = env.keeper.insecure_clone();
    let mallory = env.user(10);

    let a = env.create_pot(pot_params(CLOSE)).unwrap();
    let k0 = env.balance(&keeper.pubkey());
    let k = env.create_pot_as(&keeper, pot_params(CLOSE)).unwrap();
    expect_err(env.create_pot_as(&mallory, pot_params(CLOSE)), &code("Unauthorized"));

    for draw in [a, k] {
        let d = env.draw(&draw);
        assert_eq!(d.authority, env.admin.pubkey(), "house always belongs to the admin");
        assert_eq!((d.kind, d.status), (DrawKind::Pot, DrawStatus::Open));
        assert_eq!((d.house_bps, d.pot_bps, d.instant_bps), (5500, 3500, 1000));
        assert_eq!((d.ticket_price, d.ticket_cap, d.max_per_tx, d.max_per_wallet, d.free_cap), (CENT, 300, 25, 50, 15));
        assert_eq!((d.closes_at, d.draw_at, d.public_grace_secs), (CLOSE, CLOSE, 1800));
        assert_eq!(d.prize_lamports, 0);
        assert_eq!(d.iw_tiers, pot_params(CLOSE).iw_tiers);
        assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent(), "no escrow");
    }
    // the keeper paid rent + fee only
    let spent = k0 - env.balance(&keeper.pubkey());
    assert!(spent < SOL / 50, "keeper spent {spent}");
    assert_eq!((env.draw(&a).id, env.draw(&k).id), (0, 1));
}

#[test]
fn pot_creation_checks() {
    let mut env = Env::new();
    let base = pot_params(CLOSE);
    type M = fn(&mut PotDrawParams);
    let bad: Vec<(&str, M)> = vec![
        ("house 4999", |p| (p.common.house_bps, p.pot_bps) = (4999, 4001)),
        ("house 6001", |p| (p.common.house_bps, p.pot_bps) = (6001, 2999)),
        ("split sums to 9999", |p| p.instant_bps = 999),
        ("split sums to 10001", |p| p.instant_bps = 1001),
        ("pot 1999", |p| (p.common.house_bps, p.pot_bps, p.instant_bps) = (6000, 1999, 2001)),
        ("odds sum > denominator", |p| p.iw_tiers[3] = credits_tier(776, 1)),
        ("sol_share 5001 bps", |p| p.iw_tiers[0] = sol_share(15, 5001)),
        ("sol_share value 0", |p| p.iw_tiers[0] = sol_share(15, 0)),
        ("sol_share odds 0", |p| p.iw_tiers[0] = sol_share(0, 2000)),
        ("credits value 0", |p| p.iw_tiers[2] = credits_tier(150, 0)),
        ("credits value 101", |p| p.iw_tiers[2] = credits_tier(150, 101)),
        ("expected credits per ticket >= 1", |p| p.iw_tiers[2] = credits_tier(100, 10)),
        ("unknown kind", |p| p.iw_tiers[3] = IwTierV3 { odds: 1, kind: 3, value: 1 }),
        ("none tier with odds", |p| p.iw_tiers[3] = IwTierV3 { odds: 1, kind: 0, value: 0 }),
        ("none tier with value", |p| p.iw_tiers[3] = IwTierV3 { odds: 0, kind: 0, value: 1 }),
        ("denominator 0 with tiers", |p| p.iw_denominator = 0),
        ("denominator without tiers", |p| p.iw_tiers = [NO_TIER; 4]),
        ("closes_at == now", |p| (p.common.closes_at, p.common.draw_at) = (T0, T0)),
        ("draw_at < closes_at", |p| p.common.draw_at = CLOSE - 1),
        ("public grace > 48h", |p| p.common.public_grace_secs = 48 * 3600 + 1),
        ("max_per_tx 26", |p| p.common.max_per_tx = 26),
        ("max_per_tx 0", |p| p.common.max_per_tx = 0),
        ("max_per_wallet 0", |p| p.common.max_per_wallet = 0),
        ("ticket_cap 0", |p| p.common.ticket_cap = 0),
        ("price 0", |p| p.common.ticket_price = 0),
        ("sell-out overflows u64", |p| p.common.ticket_price = u64::MAX / 2),
    ];
    for (what, m) in bad {
        let mut p = base.clone();
        m(&mut p);
        assert_invalid(try_pot(&mut env, p), what);
    }
    assert_eq!(env.config().next_draw_id, 0);

    let good: Vec<(&str, M)> = vec![
        ("devnet preset", |_| {}),
        ("house 5000 / pot 4000 / instant 1000", |p| (p.common.house_bps, p.pot_bps) = (5000, 4000)),
        ("house 6000 / pot 2000 / instant 2000", |p| (p.common.house_bps, p.pot_bps, p.instant_bps) = (6000, 2000, 2000)),
        ("no instant wins at all", |p| {
            (p.common.house_bps, p.pot_bps, p.instant_bps, p.iw_denominator) = (6000, 4000, 0, 0);
            p.iw_tiers = [NO_TIER; 4];
        }),
        ("sol_share exactly 5000, odds == denominator", |p| {
            p.iw_tiers = [sol_share(500, 5000), credits_tier(500, 1), NO_TIER, NO_TIER];
        }),
        ("expected credits just below 1 ticket", |p| p.iw_tiers[2] = credits_tier(9, 100)),
        ("grace exactly 48h, draw_at later", |p| {
            p.common.public_grace_secs = 48 * 3600;
            p.common.draw_at = CLOSE + DAY;
        }),
    ];
    for (what, m) in good {
        let mut p = base.clone();
        m(&mut p);
        try_pot(&mut env, p).unwrap_or_else(|e| panic!("{what}: {e}"));
    }
}

#[test]
fn headline_creation_checks() {
    let mut env = Env::new();
    let admin = env.admin.pubkey();

    // keeper cannot create headline draws (they escrow admin money)
    let keeper = env.keeper.insecure_clone();
    let ix = env.ix_create_headline(&keeper.pubkey(), 0, headline_params(CLOSE));
    expect_err(env.send(&[ix], &[&keeper]), &code("Unauthorized"));

    type M = fn(&mut HeadlineDrawParams);
    let bad: Vec<(&str, M)> = vec![
        ("house 4999", |p| p.common.house_bps = 4999),
        ("house 6001", |p| p.common.house_bps = 6001),
        // prize 1 SOL, 0.01 SOL, house 55%: needs cap × 0.0045 ≥ 1 → cap ≥ 223
        ("sell-out house < house_bps (cap 222)", |p| p.common.ticket_cap = 222),
        // house 50%: cap 199 × 0.005 = 0.995 < 1
        ("sell-out house < 50% (cap 199)", |p| (p.common.house_bps, p.common.ticket_cap) = (5000, 199)),
        // 119 × 0.01 = 1.19 < 1 × 1.2
        ("floor margin at min_tickets (119)", |p| p.min_tickets = 119),
        ("floor_margin 999", |p| (p.floor_margin_bps, p.min_tickets) = (999, 200)),
        ("min_tickets 0", |p| p.min_tickets = 0),
        ("min_tickets > cap", |p| (p.min_tickets, p.common.ticket_cap) = (231, 230)),
        ("prize 0", |p| p.prize_lamports = 0),
        ("prize 2 SOL", |p| p.prize_lamports = 2 * SOL),
        ("draw_at < closes_at", |p| p.common.draw_at = CLOSE - 1),
        ("closes_at in the past", |p| (p.common.closes_at, p.common.draw_at) = (T0 - 1, T0)),
    ];
    for (what, m) in bad {
        let mut p = headline_params(CLOSE);
        m(&mut p);
        assert_invalid(try_headline(&mut env, p), what);
    }
    assert_eq!(env.config().next_draw_id, 0);

    let good: Vec<(&str, M)> = vec![
        ("cap 223 (house just ≥ 55%)", |p| p.common.ticket_cap = 223),
        ("house 50%, cap 200: exactly prize at sell-out", |p| (p.common.house_bps, p.common.ticket_cap) = (5000, 200)),
        ("house 60%, cap 250: exactly prize at sell-out", |p| (p.common.house_bps, p.common.ticket_cap) = (6000, 250)),
        ("margin 10% at min 110 exactly", |p| (p.floor_margin_bps, p.min_tickets) = (1000, 110)),
        ("min == cap", |p| p.min_tickets = 230),
    ];
    for (what, m) in good {
        let mut p = headline_params(CLOSE);
        m(&mut p);
        try_headline(&mut env, p).unwrap_or_else(|e| panic!("{what}: {e}"));
    }

    // devnet preset (SPEC-v3 §3): escrows exactly the prize
    let a0 = env.balance(&admin);
    let draw = env.create_headline(headline_params(CLOSE)).unwrap();
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent() + SOL);
    assert!(a0 - env.balance(&admin) >= SOL);
    let d = env.draw(&draw);
    assert_eq!((d.kind, d.prize_lamports, d.min_tickets, d.floor_margin_bps), (DrawKind::Headline, SOL, 120, 2000));
    assert_eq!((d.pot_bps, d.instant_bps, d.iw_denominator), (0, 0, 0));
    assert_eq!(d.iw_tiers, [NO_TIER; 4]);
    // and sells out with the house at >= 55%
    let revenue = d.ticket_cap as u64 * d.ticket_price;
    assert!((revenue - SOL) * 10_000 >= revenue * 5500);
}
