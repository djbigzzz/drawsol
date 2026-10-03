//! create_draw: the SPEC-v4 §1 inequalities and parameter bounds, each violated in turn.
mod common;

use common::*;
use drawsol::instructions::CreateDrawParams;
use drawsol::state::DrawStatus;
use solana_signer::Signer;

#[track_caller]
fn assert_invalid(r: Result<(), String>, what: &str) {
    match r {
        Ok(()) => panic!("{what}: accepted"),
        Err(e) => assert!(e.contains(&code("InvalidParams")), "{what}: {e}"),
    }
}

#[test]
fn create_by_admin_or_keeper_only_and_draft_state() {
    let mut env = Env::new();
    let keeper = env.keeper.insecure_clone();
    let mallory = env.user(10);

    let a = env.create(params(CLOSE)).unwrap();
    let k0 = env.balance(&keeper.pubkey());
    let k = env.create_as(&keeper, params(CLOSE)).unwrap();
    expect_err(env.create_as(&mallory, params(CLOSE)), &code("Unauthorized"));

    for draw in [a, k] {
        let d = env.draw(&draw);
        assert_eq!(d.authority, env.admin.pubkey(), "escrow and house always belong to the admin");
        assert_eq!(d.status, DrawStatus::Draft);
        assert_eq!((d.house_bps, d.pot_bps, d.instant_bps), (5500, 3500, 1000));
        assert_eq!((d.ticket_price, d.ticket_cap, d.max_per_tx, d.max_per_wallet, d.free_cap), (CENT, 300, 100, 200, 15));
        assert_eq!((d.closes_at, d.draw_at, d.public_grace_secs), (CLOSE, CLOSE, 1800));
        assert_eq!((d.end_prize_lamports, d.min_tickets), (70 * CENT, 200));
        assert_eq!(d.schedule_total_lamports, 30 * CENT);
        assert_eq!(d.schedule_set, 0);
        assert_eq!(d.tiers[0].amount, 10 * CENT);
        assert_eq!((d.tiers[0].count, d.tiers[1].count, d.tiers[2].count, d.tiers[3].count), (1, 5, 20, 0));
        assert!(d.tiers.iter().all(|t| t.set == 0 && t.won == 0));
        assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent(), "nothing escrowed at creation");
        assert_eq!(env.pool(&draw), (0, vec![]), "pool is a header only");
        assert_eq!(env.schedule(&draw), vec![0u8; 300], "schedule zeroed, full size (≤ 10 KB)");
        assert_eq!(d.terms_hash, [7u8; 32]);
    }
    let spent = k0 - env.balance(&keeper.pubkey());
    assert!(spent < SOL / 50, "keeper paid rent only: {spent}");
    assert_eq!((env.draw(&a).id, env.draw(&k).id), (0, 1));
    assert_eq!(env.config().next_draw_id, 2);
    // nothing can be played in a Draft
    let alice = env.user(10);
    let (ix, _, _) = env.ix_buy(&a, &alice.pubkey(), 1);
    expect_err(env.send(&[ix], &[&alice]), &code("WrongStatus"));
}

#[test]
fn creation_checks_each_inequality() {
    let mut env = Env::new();
    let base = params(CLOSE);
    type M = fn(&mut CreateDrawParams);
    let bad: Vec<(&str, M)> = vec![
        ("house 4999", |p| (p.house_bps, p.pot_bps) = (4999, 4001)),
        ("house 6001", |p| (p.house_bps, p.pot_bps) = (6001, 2999)),
        ("split sums to 9999", |p| p.instant_bps = 999),
        ("split sums to 10001", |p| p.instant_bps = 1001),
        ("end prize 0", |p| p.end_prize_lamports = 0),
        // min × price × pot_bps/1e4 ≥ end_prize: 200 × 0.01 × 0.35 = 0.7 exactly in the preset
        ("end prize 1 lamport over the min-tickets pot", |p| p.end_prize_lamports = 70 * CENT + 1),
        ("min_tickets 199 (0.6965 < 0.7)", |p| p.min_tickets = 199),
        ("pot 3499 (shifts house, 0.6998 < 0.7)", |p| (p.house_bps, p.pot_bps) = (5501, 3499)),
        ("min_tickets 0", |p| p.min_tickets = 0),
        ("min_tickets > cap", |p| (p.min_tickets, p.ticket_cap) = (301, 300)),
        // Σ schedule ≤ instant_bps × cap × price / 1e4: 0.3 SOL exactly in the preset
        ("schedule 1 lamport per number over the budget", |p| p.tiers[2] = tier(CENT / 2 + 1, 20)),
        ("one more winning number", |p| p.tiers[1] = tier(2 * CENT, 6)),
        ("instant 999 bps leaves the schedule over budget", |p| (p.pot_bps, p.instant_bps) = (3501, 999)),
        ("tier amount without count", |p| p.tiers[3] = tier(1, 0)),
        ("tier count without amount", |p| p.tiers[3] = tier(0, 1)),
        ("Σ count > cap", |p| p.tiers = tiers(&[tier(1, 301)])),
        ("cap 0", |p| p.ticket_cap = 0),
        ("cap 65536", |p| p.ticket_cap = 65_536),
        ("max_per_tx 0", |p| p.max_per_tx = 0),
        ("max_per_tx 1001", |p| p.max_per_tx = 1001),
        ("max_per_wallet 0", |p| p.max_per_wallet = 0),
        ("closes_at == now", |p| (p.closes_at, p.draw_at) = (T0, T0)),
        ("closes_at in the past", |p| (p.closes_at, p.draw_at) = (T0 - 1, T0)),
        ("draw_at < closes_at", |p| p.draw_at = CLOSE - 1),
        ("public grace > 48h", |p| p.public_grace_secs = 48 * 3600 + 1),
        ("price 0", |p| p.ticket_price = 0),
        ("sell-out overflows u64", |p| p.ticket_price = u64::MAX / 2),
        ("escrow overflows u64", |p| p.end_prize_lamports = u64::MAX),
    ];
    for (what, m) in bad {
        let mut p = base.clone();
        m(&mut p);
        assert_invalid(env.create(p).map(|_| ()), what);
    }
    assert_eq!(env.config().next_draw_id, 0);

    let good: Vec<(&str, M)> = vec![
        ("preset (both inequalities exactly tight)", |_| {}),
        ("house 5000 / pot 4000 / instant 1000", |p| (p.house_bps, p.pot_bps) = (5000, 4000)),
        ("house 6000 / pot 2000 / instant 2000, prize 0.4", |p| {
            (p.house_bps, p.pot_bps, p.instant_bps) = (6000, 2000, 2000);
            p.end_prize_lamports = 40 * CENT;
        }),
        ("no instant prizes at all (instant 0, no tiers)", |p| {
            (p.house_bps, p.pot_bps, p.instant_bps) = (6000, 4000, 0);
            p.tiers = tiers(&[]);
        }),
        ("all 8 tiers used", |p| p.tiers = [tier(CENT, 3); 8]),
        ("cap 65535 (schedule starts at 10 KB)", |p| {
            p.ticket_cap = 65_535;
            p.min_tickets = 40_000;
            p.end_prize_lamports = 40_000 * CENT * 35 / 100;
        }),
        ("grace exactly 48h, draw_at later", |p| {
            p.public_grace_secs = 48 * 3600;
            p.draw_at = CLOSE + DAY;
        }),
        ("max_per_tx 1000", |p| p.max_per_tx = 1000),
    ];
    for (what, m) in good {
        let mut p = base.clone();
        m(&mut p);
        env.create(p).unwrap_or_else(|e| panic!("{what}: {e}"));
    }
    // the 65535-cap draw: header-only pool, 10 KB schedule
    let big = draw_pda(5);
    let acc = env.svm.get_account(&schedule_pda(&big)).unwrap();
    assert_eq!(acc.data.len(), 10_240);
    assert_eq!(env.svm.get_account(&pool_pda(&big)).unwrap().data.len(), 12);
}
