//! Pot draws: per-ticket split, instant wins (pool snapshot, cap), credits, free entries, lifecycle.
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use drawsol::state::{DrawStatus, PlayerV3};
use drawsol::utils::split_payment;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn nightly() -> (Env, Pubkey) {
    Env::with_pot(pot_params(CLOSE))
}

/// Money invariant of an Open/Drawing pot draw: every lamport above rent is house, pot or pool.
#[track_caller]
fn assert_books(env: &Env, draw: &Pubkey) {
    let d = env.draw(draw);
    assert_eq!(
        env.vault_free(draw),
        d.house_lamports + d.pot_lamports + d.instant_pool_lamports,
        "vault = house + pot + pool"
    );
}

// ====================================================================== split

#[test]
fn split_sums_exactly_to_the_payment() {
    let prices = [1u64, 2, 3, 7, 99, 101, 9_999, CENT, 10_000_001, 12_345_678_901, 333_333_333_333];
    let splits = [(5500u16, 1000u16), (5000, 0), (6000, 2000), (5001, 1333), (5999, 3999), (5000, 3000)];
    for price in prices {
        for qty in 1..=25u64 {
            for (h, i) in splits {
                let pay = price * qty;
                let (house, inst, pot) = split_payment(pay, h, i).unwrap();
                assert_eq!(house + inst + pot, pay, "price {price} qty {qty} split {h}/{i}");
                assert_eq!(house as u128, pay as u128 * h as u128 / 10_000);
                assert_eq!(inst as u128, pay as u128 * i as u128 / 10_000);
                let pot_floor = (pay as u128 * (10_000 - h - i) as u128 / 10_000) as u64;
                assert!(pot >= pot_floor && pot - pot_floor <= 2, "pot only absorbs rounding");
            }
        }
    }
    // u128 intermediate: no overflow at the top of the range
    let (h, i, p) = split_payment(u64::MAX, 6000, 2000).unwrap();
    assert_eq!(h as u128 + i as u128 + p as u128, u64::MAX as u128);
}

#[test]
fn buy_splits_every_payment_on_chain() {
    // Odd price and odd bps; no instant tiers, so no ORAO accounts are needed at all.
    let mut p = pot_params(CLOSE);
    p.common.ticket_price = 3_333_337;
    p.common.ticket_cap = 1000;
    (p.common.house_bps, p.pot_bps, p.instant_bps) = (5001, 3333, 1666);
    p.iw_denominator = 0;
    p.iw_tiers = [NO_TIER; 4];
    let (mut env, draw) = Env::with_pot(p);
    let mut want = (0u64, 0u64, 0u64);
    for qty in 1..=25u16 {
        let buyer = env.user(10);
        let b = env.buy(&draw, &buyer, qty).unwrap();
        assert!(b.req.is_none());
        let e = env.entry(&b.entry);
        assert!(!e.needs_reveal && e.vrf_request == Pubkey::default());
        let pay = 3_333_337 * qty as u64;
        assert_eq!(e.paid_lamports, pay);
        let (h, i, pt) = split_payment(pay, 5001, 1666).unwrap();
        want = (want.0 + h, want.1 + i, want.2 + pt);
        let d = env.draw(&draw);
        assert_eq!((d.house_lamports, d.instant_pool_lamports, d.pot_lamports), want);
        assert_eq!(d.revenue_lamports, want.0 + want.1 + want.2);
        assert_books(&env, &draw);
    }
    assert_eq!(env.draw(&draw).rolled_entries, 0);
}

// ====================================================================== buy

#[test]
fn pot_buy_happy_path() {
    let (mut env, draw) = nightly();
    let alice = env.user(10);
    let bob = env.user(10);
    let t0 = env.balance(&env.treasury);

    let (ix, ea, req) = env.ix_buy(&draw, &alice.pubkey(), 5, 0);
    let ok = env.send(&[ix], &[&alice]).unwrap();
    println!("buy_tickets(5) pot: {} CU", ok.cu);
    let req = req.unwrap();
    let eb = env.buy(&draw, &bob, 3).unwrap().entry;

    let a = env.entry(&ea);
    assert_eq!((a.draw, a.owner, a.seq, a.first_ticket, a.count), (draw, alice.pubkey(), 0, 0, 5));
    assert_eq!((a.paid_count, a.credit_count, a.is_free), (5, 0, false));
    assert_eq!(a.paid_lamports, 5 * CENT);
    assert_eq!(a.pool_snapshot, 5 * CENT / 10, "pool right after this purchase");
    assert!(a.needs_reveal && !a.revealed && !a.refunded);
    assert_eq!(a.vrf_request, req);
    let b = env.entry(&eb);
    assert_eq!((b.seq, b.first_ticket, b.count), (1, 5, 3));
    assert_eq!(b.pool_snapshot, 8 * CENT / 10);

    let d = env.draw(&draw);
    assert_eq!((d.paid_tickets, d.next_ticket, d.entry_count, d.rolled_entries), (8, 8, 2, 2));
    assert_eq!(d.house_lamports, 8 * CENT * 55 / 100);
    assert_eq!(d.pot_lamports, 8 * CENT * 35 / 100);
    assert_eq!(d.instant_pool_lamports, 8 * CENT / 10);
    assert_eq!(d.revenue_lamports, 8 * CENT);
    assert_books(&env, &draw);

    let pa: PlayerV3 = env.player(&draw, &alice.pubkey());
    assert_eq!((pa.draw, pa.wallet, pa.tickets, pa.paid, pa.won_sol), (draw, alice.pubkey(), 5, 5 * CENT, 0));
    let pr = env.profile(&alice.pubkey());
    assert_eq!((pr.wallet, pr.credits, pr.period_spent, pr.period_start), (alice.pubkey(), 0, 5 * CENT, T0));

    // ORAO request for the program-derived seed, client = buyer, pending; buyer paid the fee.
    let acc = env.svm.get_account(&req).unwrap();
    assert_eq!(acc.owner, orao_solana_vrf::ID);
    assert_eq!(acc.data[8], 0, "pending");
    assert_eq!(&acc.data[9..41], alice.pubkey().as_ref());
    assert_eq!(&acc.data[41..73], &a.vrf_seed);
    assert_eq!(env.balance(&env.treasury), t0 + 2 * env.request_fee);
}

#[test]
fn buy_rejects_bad_orao_accounts() {
    let (mut env, draw) = nightly();
    let alice = env.user(10);
    // no ORAO accounts on a rolling draw
    let ix = env.ix_buy_raw(&draw, &alice.pubkey(), 0, 1, 0, [1u8; 16], None, false);
    expect_err(env.send(&[ix], &[&alice]), &code("VrfWrongAccount"));
    // a request PDA for a seed the program did not derive
    let seed = drawsol::fairness::entry_vrf_seed(&draw, &alice.pubkey(), 0, &[9u8; 16]);
    let wrong = drawsol::fairness::vrf_request_address(&seed);
    let ix = env.ix_buy_raw(&draw, &alice.pubkey(), 0, 1, 0, [1u8; 16], Some(wrong), true);
    expect_err(env.send(&[ix], &[&alice]), &code("VrfWrongAccount"));
    // the v2 seed domain is not accepted any more
    let v2 = drawsol::fairness::entry_vrf_seed_v2(&draw, &alice.pubkey(), 0, &[1u8; 16]);
    let ix = env.ix_buy_raw(&draw, &alice.pubkey(), 0, 1, 0, [1u8; 16], Some(drawsol::fairness::vrf_request_address(&v2)), true);
    expect_err(env.send(&[ix], &[&alice]), &code("VrfWrongAccount"));
    // right request, wrong treasury
    let (mut ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 0);
    ix.accounts[8].pubkey = Pubkey::new_unique();
    expect_err(env.send(&[ix], &[&alice]), &code("VrfWrongAccount"));
    env.buy(&draw, &alice, 1).unwrap();
}

#[test]
fn buy_limits() {
    let mut p = pot_params(CLOSE);
    p.common.ticket_cap = 40;
    p.common.max_per_tx = 10;
    p.common.max_per_wallet = 15;
    let (mut env, draw) = Env::with_pot(p);
    let alice = env.user(10);
    for q in [11u16, 26, 0] {
        let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), q, 0);
        expect_err(env.send(&[ix], &[&alice]), &code("ExceedsPerTx"));
    }
    env.buy(&draw, &alice, 10).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 6, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsWalletCap"));
    env.buy(&draw, &alice, 5).unwrap();

    let bob = env.user(10);
    let carol = env.user(10);
    env.buy(&draw, &bob, 10).unwrap();
    env.buy(&draw, &carol, 10).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &bob.pubkey(), 6, 0);
    expect_err(env.send(&[ix], &[&bob]), &code("SoldOut"));
    env.buy(&draw, &bob, 5).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &carol.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&carol]), &code("SoldOut"));
    assert_eq!(env.draw(&draw).paid_tickets, 40);
}

// ====================================================================== credits

#[test]
fn credits_earned_by_tier_spent_in_buy_never_negative() {
    let (mut env, draw) = nightly();
    let alice = env.user(10);
    let b = env.buy(&draw, &alice, 25).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&b.entry));
    let rnd = find_randomness(&d, &e, |_, c| (2..=10).contains(&c));
    let (_, _, won) = expected_reveal(&rnd, &d, &e);
    env.fulfill_and_reveal(&draw, &b, rnd);
    assert_eq!(env.entry(&b.entry).credits_won, won);
    assert_eq!(env.profile(&alice.pubkey()).credits, won);
    assert_eq!(env.player(&draw, &alice.pubkey()).won_credits, won);

    // can't go negative, can't exceed the quantity
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), (won + 1) as u16, (won + 1) as u16);
    expect_err(env.send(&[ix], &[&alice]), &code("InsufficientCredits"));
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 2);
    expect_err(env.send(&[ix], &[&alice]), &code("InvalidParams"));

    // credit-only purchase: no payment, no split, still a rolled entry
    let before = env.draw(&draw);
    let vault0 = env.vault_free(&draw);
    let spent0 = env.profile(&alice.pubkey()).period_spent;
    let c = env.buy_credits(&draw, &alice, 2, 2).unwrap();
    let e = env.entry(&c.entry);
    assert_eq!((e.count, e.paid_count, e.credit_count, e.paid_lamports), (2, 0, 2, 0));
    assert!(e.needs_reveal && c.req.is_some(), "credit tickets roll like any ticket");
    assert_eq!(env.vault_free(&draw), vault0, "no payment taken for credit tickets");
    let d = env.draw(&draw);
    assert_eq!((d.revenue_lamports, d.house_lamports, d.pot_lamports), (before.revenue_lamports, before.house_lamports, before.pot_lamports));
    assert_eq!((d.paid_tickets, d.credit_tickets, d.next_ticket), (25, 2, 27));
    assert_eq!(env.profile(&alice.pubkey()).credits, won - 2);
    assert_eq!(env.profile(&alice.pubkey()).period_spent, spent0, "credits never count against the spend limit");

    // mixed: 3 tickets, 1 credit → pays exactly 2 tickets
    if won - 2 >= 1 {
        let v0 = env.vault_free(&draw);
        let m = env.buy_credits(&draw, &alice, 3, 1).unwrap();
        assert_eq!(env.entry(&m.entry).paid_lamports, 2 * CENT);
        assert_eq!(env.vault_free(&draw) - v0, 2 * CENT);
        assert_eq!(env.profile(&alice.pubkey()).credits, won - 3);
    }
}

#[test]
fn credit_and_free_tickets_do_not_count_toward_the_cap() {
    let mut p = pot_params(CLOSE);
    p.common.ticket_cap = 30;
    let (mut env, draw) = Env::with_pot(p);
    let (alice, bob, carol, dave) = (env.user(10), env.user(10), env.user(10), env.user(10));
    env.grant_credits(&carol, 10);
    env.buy(&draw, &alice, 25).unwrap();
    env.claim_free(&draw, &bob).unwrap();
    env.buy_credits(&draw, &carol, 5, 5).unwrap();
    assert_eq!(env.draw(&draw).paid_tickets, 25);
    env.buy(&draw, &dave, 5).unwrap(); // paid tickets reach the cap
    let d = env.draw(&draw);
    assert_eq!((d.paid_tickets, d.free_tickets, d.credit_tickets, d.next_ticket), (30, 1, 5, 36));
    // sold out: sales are closed for every kind of ticket
    let (ix, _, _) = env.ix_buy(&draw, &carol.pubkey(), 1, 1);
    expect_err(env.send(&[ix], &[&carol]), &code("SoldOut"));
    let (ix, _, _) = env.ix_claim_free(&draw, &dave.pubkey());
    expect_err(env.send(&[ix], &[&dave]), &code("SoldOut"));
}

// ====================================================================== free entries

#[test]
fn free_entry_rolls_in_pot_draw_and_is_paid_from_the_pool() {
    let mut p = pot_params(CLOSE);
    p.common.free_cap = 2;
    p.common.max_per_wallet = 3;
    let (mut env, draw) = Env::with_pot(p);
    let (alice, bob, carol) = (env.user(10), env.user(10), env.user(10));
    env.buy(&draw, &alice, 2).unwrap();
    let f = env.claim_free(&draw, &alice).unwrap();
    let e = env.entry(&f.entry);
    assert_eq!((e.seq, e.first_ticket, e.count, e.is_free, e.paid_lamports), (1, 2, 1, true, 0));
    assert!(e.needs_reveal && f.req == Some(e.vrf_request));
    assert_eq!(e.pool_snapshot, 2 * CENT / 10);
    assert!(env.player(&draw, &alice.pubkey()).free_claimed);

    let (ix, _, _) = env.ix_claim_free(&draw, &alice.pubkey());
    expect_err(env.send(&[ix], &[&alice]), &code("FreeAlreadyClaimed"));
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsWalletCap"));
    env.claim_free(&draw, &bob).unwrap();
    let (ix, _, _) = env.ix_claim_free(&draw, &carol.pubkey());
    expect_err(env.send(&[ix], &[&carol]), &code("FreeCapReached"));

    // the free ticket wins SOL from the pool; the house share is untouched
    let (d, e) = (env.draw(&draw), env.entry(&f.entry));
    let rnd = find_randomness(&d, &e, |o, _| o > 0);
    let (_, owed, _) = expected_reveal(&rnd, &d, &e);
    let a0 = env.balance(&alice.pubkey());
    env.fulfill_and_reveal(&draw, &f, rnd);
    assert_eq!(env.balance(&alice.pubkey()) - a0, owed);
    let d2 = env.draw(&draw);
    assert_eq!(d2.house_lamports, d.house_lamports);
    assert_eq!(d2.instant_pool_lamports, d.instant_pool_lamports - owed);
    assert_eq!((d2.free_tickets, d2.rolled_entries, d2.revealed_entries), (2, 3, 1));
    assert_books(&env, &draw);
}

// ====================================================================== reveal

#[test]
fn reveal_checks_randomness_account() {
    let (mut env, draw) = nightly();
    let alice = env.user(10);
    let bob = env.user(10);
    let a = env.buy(&draw, &alice, 10).unwrap();
    let b = env.buy(&draw, &bob, 10).unwrap();
    let (req_a, req_b) = (a.req.unwrap(), b.req.unwrap());

    expect_err(env.reveal(&draw, &a.entry), &code("VrfNotFulfilled"));
    env.fulfill(&req_b, [3u8; 64]);
    let ix = env.ix_reveal_with(&draw, &a.entry, req_b);
    expect_err(env.crank(ix), &code("VrfWrongAccount"));

    let seed = env.entry(&a.entry).vrf_seed;
    let real = env.svm.get_account(&req_a).unwrap();
    env.forge_fulfilled(req_a, alice.pubkey(), seed, [1u8; 64], anchor_lang::solana_program::system_program::ID);
    expect_err(env.reveal(&draw, &a.entry), &code("VrfWrongOwner"));
    env.forge_fulfilled(req_a, alice.pubkey(), [0xEE; 32], [1u8; 64], orao_solana_vrf::ID);
    expect_err(env.reveal(&draw, &a.entry), &code("VrfSeedMismatch"));
    env.svm.set_account(req_a, real).unwrap();
    expect_err(env.reveal(&draw, &a.entry), &code("VrfNotFulfilled"));
    assert!(!env.entry(&a.entry).revealed);
}

#[test]
fn reveal_pays_recomputed_result_once() {
    let (mut env, draw) = nightly();
    let alice = env.user(10);
    let b = env.buy(&draw, &alice, 25).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&b.entry));
    let rnd = find_randomness(&d, &e, |o, c| o > 0 && c > 0);
    let (tiers, owed, credits) = expected_reveal(&rnd, &d, &e);
    let (a0, v0) = (env.balance(&alice.pubkey()), env.vault_free(&draw));
    let ok = env.fulfill_and_reveal(&draw, &b, rnd); // sent and paid for by a third party
    println!("reveal_entry(25): {} CU, owed {owed}, credits {credits}, tiers {:?}", ok.cu, &tiers[..]);

    let e = env.entry(&b.entry);
    assert!(e.revealed);
    assert_eq!((e.tiers, e.sol_paid, e.credits_won), (tiers, owed, credits));
    assert_eq!(env.balance(&alice.pubkey()) - a0, owed);
    assert_eq!(v0 - env.vault_free(&draw), owed);
    let p = env.player(&draw, &alice.pubkey());
    assert_eq!((p.won_sol, p.won_credits), (owed, credits));
    assert_eq!(env.draw(&draw).revealed_entries, 1);
    assert_books(&env, &draw);
    expect_err(env.reveal(&draw, &b.entry), &code("AlreadyRevealed"));
    assert_eq!(env.balance(&alice.pubkey()) - a0, owed);
}

#[test]
fn pool_snapshot_prevents_payout_inflation_by_delaying_reveal() {
    let (mut env, draw) = nightly();
    let alice = env.user(10);
    // Alice buys first: her snapshot is the tiny pool of her own purchase.
    let a = env.buy(&draw, &alice, 1).unwrap();
    assert_eq!(env.entry(&a.entry).pool_snapshot, CENT / 10);
    // She waits while 200 more tickets grow the pool 200×.
    for _ in 0..8 {
        let k = env.user(10);
        env.buy(&draw, &k, 25).unwrap();
    }
    let pool = env.draw(&draw).instant_pool_lamports;
    assert_eq!(pool, 201 * CENT / 10);

    // Her ticket hits the 20% tier.
    let (d, e) = (env.draw(&draw), env.entry(&a.entry));
    let rnd = find_randomness(&d, &e, |o, _| o == CENT / 10 * 2000 / 10_000);
    let a0 = env.balance(&alice.pubkey());
    env.fulfill_and_reveal(&draw, &a, rnd);
    let got = env.balance(&alice.pubkey()) - a0;
    assert_eq!(got, CENT / 50, "20% of her snapshot (0.0002 SOL)");
    assert_eq!(pool * 2000 / 10_000, 201 * got, "20% of the current pool would have been 201x more");
}

#[test]
fn payouts_are_capped_by_the_pool() {
    let mut p = pot_params(CLOSE);
    p.iw_tiers = [sol_share(500, 5000), NO_TIER, NO_TIER, NO_TIER]; // 50% chance of 50% of the snapshot
    let (mut env, draw) = Env::with_pot(p);
    let alice = env.user(10);
    let b = env.buy(&draw, &alice, 25).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&b.entry));
    assert_eq!(e.pool_snapshot, 25 * CENT / 10);
    let rnd = find_randomness(&d, &e, |o, _| o > e.pool_snapshot); // ≥ 3 wins: owed 1.5× the pool
    let (_, owed, _) = expected_reveal(&rnd, &d, &e);
    let a0 = env.balance(&alice.pubkey());
    env.fulfill_and_reveal(&draw, &b, rnd);
    let e = env.entry(&b.entry);
    assert!(owed > d.instant_pool_lamports);
    assert_eq!(e.sol_paid, d.instant_pool_lamports, "pays min(owed, pool) and records exactly that");
    assert_eq!(env.balance(&alice.pubkey()) - a0, d.instant_pool_lamports);
    let d2 = env.draw(&draw);
    assert_eq!(d2.instant_pool_lamports, 0);
    assert_eq!((d2.house_lamports, d2.pot_lamports), (d.house_lamports, d.pot_lamports), "house and pot untouched");
    assert_books(&env, &draw);

    // Pool empty: the next winner records tiers but receives only what the pool has (its own 10%).
    let bob = env.user(10);
    let b2 = env.buy(&draw, &bob, 25).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&b2.entry));
    let rnd = find_randomness(&d, &e, |o, _| o > d.instant_pool_lamports);
    env.fulfill_and_reveal(&draw, &b2, rnd);
    assert_eq!(env.entry(&b2.entry).sol_paid, 25 * CENT / 10);
    assert_eq!(env.draw(&draw).instant_pool_lamports, 0);
    assert_books(&env, &draw);
}

// ====================================================================== lifecycle

/// Several buyers, mixed reveals. Returns (env, draw, buyers' entries).
fn played() -> (Env, Pubkey, Vec<(Bought, Keypair)>) {
    let (mut env, draw) = nightly();
    let mut out = Vec::new();
    for q in [10u16, 7, 4] {
        let k = env.user(10);
        let b = env.buy(&draw, &k, q).unwrap();
        out.push((b, k));
    }
    (env, draw, out)
}

#[test]
fn settle_pays_pot_plus_unwon_pool_and_house_only_after() {
    let (mut env, draw, buyers) = played();
    // Alice wins some SOL, Bob reveals, Carol stays unrevealed.
    let (d, e) = (env.draw(&draw), env.entry(&buyers[0].0.entry));
    let rnd = find_randomness(&d, &e, |o, _| o > 0);
    env.fulfill_and_reveal(&draw, &buyers[0].0, rnd);
    env.fulfill_and_reveal(&draw, &buyers[1].0, [0x77; 64]);
    assert!(env.draw(&draw).instant_pool_lamports > 0);

    expect_err(env.withdraw(&draw), &code("NothingToWithdraw")); // Open: house not withdrawable
    let mallory = env.user(1);
    let ix = env.ix_withdraw(&draw, &mallory.pubkey());
    expect_err(env.send(&[ix], &[&mallory]), &code("Unauthorized"));

    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw")); // Drawing: still not

    let d = env.draw(&draw);
    let prize = d.pot_lamports + d.instant_pool_lamports;
    let rnd = [0x42u8; 64];
    let w = drawsol::fairness::winning_ticket(&rnd, d.next_ticket);
    let win = env.entry_holding(&draw, w);
    let winner = env.entry(&win).owner;
    let w0 = env.balance(&winner);
    env.fulfill_and_settle(&draw, rnd);
    assert_eq!(env.balance(&winner) - w0, prize, "winner gets the pot + the unwon instant pool");
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Settled);
    assert_eq!((d.winning_ticket, d.winning_entry, d.winner), (w, win, winner));
    assert_eq!((d.prize_paid_lamports, d.instant_pool_lamports, d.prize_lamports), (prize, 0, 0));
    assert!(d.prize_paid);
    assert_eq!(d.randomness, rnd);
    assert_eq!(env.vault_free(&draw), d.house_lamports, "only the house share is left");

    assert_eq!(env.withdraw(&draw).unwrap(), d.house_lamports);
    assert_eq!(env.draw(&draw).house_withdrawn, d.house_lamports);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));

    // Late reveal after settlement: the pool is 0, so only tiers and credits are recorded.
    let carol = &buyers[2];
    let (d, e) = (env.draw(&draw), env.entry(&carol.0.entry));
    let rnd = find_randomness(&d, &e, |o, c| o > 0 && c > 0);
    let (_, _, credits) = expected_reveal(&rnd, &d, &e);
    let c0 = env.balance(&carol.1.pubkey());
    env.fulfill_and_reveal(&draw, &carol.0, rnd);
    let e = env.entry(&carol.0.entry);
    assert!(e.revealed);
    assert_eq!((e.sol_paid, e.credits_won), (0, credits));
    assert_eq!(env.balance(&carol.1.pubkey()), c0);
    assert_eq!(env.profile(&carol.1.pubkey()).credits, credits);
}

#[test]
fn settle_entry_checks() {
    let (mut env, draw, buyers) = played();
    let e0 = buyers[0].0.entry;
    expect_err(env.settle(&draw, &e0), &code("WrongStatus")); // Open
    env.set_time(CLOSE);
    let req = env.request_draw(&draw).unwrap();
    expect_err(env.settle(&draw, &e0), &code("VrfNotFulfilled"));
    // a different, fulfilled ORAO request
    env.fulfill(&buyers[0].0.req.unwrap(), [8u8; 64]);
    let mut ix = env.ix_settle(&draw, &e0, &buyers[0].1.pubkey());
    ix.accounts[2].pubkey = buyers[0].0.req.unwrap();
    expect_err(env.crank(ix), &code("VrfWrongAccount"));

    let rnd = [0x42u8; 64];
    env.fulfill(&req, rnd);
    let w = drawsol::fairness::winning_ticket(&rnd, 21);
    let win = env.entry_holding(&draw, w);
    let lose = buyers.iter().map(|b| b.0.entry).find(|e| *e != win).unwrap();
    expect_err(env.settle(&draw, &lose), &code("WrongWinningEntry"));
    let ix = env.ix_settle(&draw, &win, &env.entry(&lose).owner);
    expect_err(env.crank(ix), "ConstraintAddress");
    // entry of another draw
    let d1 = env.create_pot(pot_params(CLOSE + DAY)).unwrap();
    let other = env.user(10);
    let ob = env.buy(&d1, &other, 25).unwrap();
    let ix = env.ix_settle(&draw, &ob.entry, &other.pubkey());
    expect_err(env.crank(ix), "ConstraintSeeds");
    env.settle(&draw, &win).unwrap();
    expect_err(env.settle(&draw, &win), &code("WrongStatus"));
}

#[test]
fn reveal_rejects_entry_of_another_draw() {
    let (mut env, d0) = nightly();
    let d1 = env.create_pot(pot_params(CLOSE)).unwrap();
    let alice = env.user(10);
    let b = env.buy(&d1, &alice, 2).unwrap();
    env.fulfill(&b.req.unwrap(), [5u8; 64]);
    let mut ix = env.ix_reveal_with(&d0, &b.entry, b.req.unwrap());
    ix.accounts[3].pubkey = player_pda(&d1, &alice.pubkey());
    expect_err(env.crank(ix), "ConstraintSeeds");
}

#[test]
fn keeper_only_window_then_public() {
    let mut env = Env::new();
    let draws: Vec<Pubkey> = (0..3).map(|_| env.create_pot(pot_params(CLOSE)).unwrap()).collect();
    let buyer = env.user(10);
    for d in &draws {
        env.buy(d, &buyer, 1).unwrap();
    }
    let mallory = env.user(10);
    let admin = env.admin.insecure_clone();

    env.set_time(CLOSE);
    expect_err(env.request_draw_as(&draws[0], &mallory), &code("Unauthorized"));
    env.set_time(CLOSE + 30 * MIN - 1);
    expect_err(env.request_draw_as(&draws[0], &mallory), &code("Unauthorized"));
    env.request_draw(&draws[0]).unwrap(); // keeper
    env.request_draw_as(&draws[1], &admin).unwrap(); // authority
    env.set_time(CLOSE + 30 * MIN);
    env.request_draw_as(&draws[2], &mallory).unwrap(); // public after the grace window
    for d in &draws {
        assert_eq!(env.draw(d).status, DrawStatus::Drawing);
    }
}

#[test]
fn draw_at_is_enforced_and_sell_out_waits_for_it() {
    let mut p = pot_params(CLOSE);
    p.common.ticket_cap = 30;
    p.common.draw_at = CLOSE + HOUR;
    let (mut env, draw) = Env::with_pot(p);
    let (alice, bob) = (env.user(10), env.user(10));
    env.buy(&draw, &alice, 25).unwrap();
    env.buy(&draw, &bob, 5).unwrap();
    // sold out: sales closed early...
    let (ix, _, _) = env.ix_buy(&draw, &bob.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&bob]), &code("SoldOut"));
    // ...but the draw still waits for draw_at
    expect_err(env.request_draw(&draw), &code("DrawNotDue"));
    env.set_time(CLOSE);
    let (ix, _, _) = env.ix_buy(&draw, &bob.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&bob]), &code("SalesClosed"));
    expect_err(env.request_draw(&draw), &code("DrawNotDue"));
    env.set_time(CLOSE + HOUR - 1);
    expect_err(env.request_draw(&draw), &code("DrawNotDue"));
    env.set_time(CLOSE + HOUR);
    let req = env.request_draw(&draw).unwrap();
    let d = env.draw(&draw);
    assert_eq!((d.status, d.draw_vrf_request), (DrawStatus::Drawing, req));
    // no second request, no more sales
    expect_err(env.request_draw(&draw), &code("WrongStatus"));
}

#[test]
fn pot_with_no_tickets_cancels_at_request() {
    let (mut env, draw) = nightly();
    env.set_time(CLOSE);
    let ix = env.ix_request_draw_raw(&draw, &env.keeper.pubkey(), [0u8; 16], None);
    let k = env.keeper.insecure_clone();
    env.send(&[ix], &[&k]).unwrap();
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Cancelled);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
}

#[test]
fn request_draw_needs_orao_accounts_when_drawing() {
    let (mut env, draw, _) = played();
    env.set_time(CLOSE);
    let k = env.keeper.insecure_clone();
    let ix = env.ix_request_draw_raw(&draw, &k.pubkey(), [0u8; 16], None);
    expect_err(env.send(&[ix], &[&k]), &code("VrfWrongAccount"));
    let ix = env.ix_request_draw_raw(&draw, &k.pubkey(), [1u8; 16], Some(Pubkey::new_unique()));
    expect_err(env.send(&[ix], &[&k]), &code("VrfWrongAccount"));
    let t0 = env.balance(&env.treasury);
    env.request_draw(&draw).unwrap();
    assert_eq!(env.balance(&env.treasury), t0 + env.request_fee, "caller pays the ORAO fee");
}

#[test]
fn pot_cancel_after_grace_refunds_net_of_instant_sol() {
    let (mut env, draw, buyers) = played();
    let (alice, bob, carol) = (&buyers[0], &buyers[1], &buyers[2]);
    // Alice won instant SOL; Bob and Carol never revealed.
    let (d, e) = (env.draw(&draw), env.entry(&alice.0.entry));
    let rnd = find_randomness(&d, &e, |o, _| o > 0 && o < 10 * CENT);
    let (_, sol_a, _) = expected_reveal(&rnd, &d, &e);
    env.fulfill_and_reveal(&draw, &alice.0, rnd);

    expect_err(env.cancel(&draw), &code("WrongStatus")); // Open
    expect_err(env.refund(&draw, &alice.0.entry), &code("WrongStatus"));
    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    env.set_time(CLOSE + 48 * HOUR);
    expect_err(env.cancel(&draw), &code("NotCancellable"));
    env.set_time(CLOSE + 48 * HOUR + 1);
    env.cancel(&draw).unwrap();
    assert_eq!(env.draw(&draw).status, DrawStatus::Cancelled);
    expect_err(env.cancel(&draw), &code("WrongStatus"));

    // the pot house share is never paid while refunds are owed
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
    // no new instant payouts once refunds are open
    env.fulfill(&bob.0.req.unwrap(), [0x31; 64]);
    expect_err(env.reveal(&draw, &bob.0.entry), &code("WrongStatus"));

    assert_eq!(env.refund(&draw, &alice.0.entry).unwrap(), 10 * CENT - sol_a, "paid minus instant SOL");
    expect_err(env.refund(&draw, &alice.0.entry), &code("AlreadyRefunded"));
    assert_eq!(env.refund(&draw, &bob.0.entry).unwrap(), 7 * CENT);
    assert_eq!(env.refund(&draw, &carol.0.entry).unwrap(), 4 * CENT);
    assert_eq!(env.draw(&draw).refunded_lamports, 21 * CENT - sol_a);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent(), "vault drained to exactly rent");
}

#[test]
fn pot_cancel_refund_shortfall_is_reported_not_taken_from_others() {
    // A free entry (paid 0) wins SOL from the pool, then the draw is cancelled: the refunds owed exceed
    // the vault by exactly that win. The last refund fails with VaultShortfall until topped up.
    let (mut env, draw) = nightly();
    let (alice, dave) = (env.user(10), env.user(10));
    let a = env.buy(&draw, &alice, 25).unwrap();
    let f = env.claim_free(&draw, &dave).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&f.entry));
    let rnd = find_randomness(&d, &e, |o, _| o > 0);
    let (_, won, _) = expected_reveal(&rnd, &d, &e);
    env.fulfill_and_reveal(&draw, &f, rnd);

    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    env.set_time(CLOSE + 49 * HOUR);
    env.cancel(&draw).unwrap();
    expect_err(env.refund(&draw, &f.entry), &code("NothingToRefund"));
    expect_err(env.refund(&draw, &a.entry), &code("VaultShortfall"));
    let admin = env.admin.insecure_clone();
    env.transfer(&admin, &vault_pda(&draw), won); // operator tops up
    assert_eq!(env.refund(&draw, &a.entry).unwrap(), 25 * CENT);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
}
