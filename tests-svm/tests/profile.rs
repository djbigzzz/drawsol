//! Spend limits and self-exclusion (SPEC-v3 §2.6).
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use solana_signer::Signer;

/// A headline draw that stays open for 90 days (no ORAO needed to buy).
fn long_draw() -> (Env, Pubkey) {
    let mut p = headline_params(T0 + 90 * DAY);
    p.common.max_per_wallet = 1000;
    p.common.ticket_cap = 5000;
    Env::with_headline(p)
}

#[test]
fn spend_limit_decrease_now_increase_after_72h_and_period_roll() {
    let (mut env, draw) = long_draw();
    let alice = env.user(100);

    // set from zero: immediate
    env.set_limit(&alice, 10 * CENT).unwrap();
    assert_eq!(env.profile(&alice.pubkey()).limit_lamports, 10 * CENT);
    env.buy(&draw, &alice, 10).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("SpendLimitExceeded"));
    // credit tickets are not spending
    env.grant_credits(&alice, 2);
    env.buy_credits(&draw, &alice, 2, 2).unwrap();

    // decrease: immediate
    env.set_limit(&alice, 5 * CENT).unwrap();
    assert_eq!(env.profile(&alice.pubkey()).limit_lamports, 5 * CENT);

    // increase: pending for 72 h
    env.set_limit(&alice, 30 * CENT).unwrap();
    let p = env.profile(&alice.pubkey());
    assert_eq!((p.limit_lamports, p.pending_limit, p.pending_from), (5 * CENT, 30 * CENT, T0 + 72 * HOUR));
    env.set_time(T0 + 72 * HOUR - 1);
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("SpendLimitExceeded"));
    env.set_time(T0 + 72 * HOUR);
    env.buy(&draw, &alice, 20).unwrap(); // 10 + 20 = 30 ≤ 30
    let p = env.profile(&alice.pubkey());
    assert_eq!((p.limit_lamports, p.pending_from, p.period_spent), (30 * CENT, 0, 30 * CENT));
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("SpendLimitExceeded"));

    // the 30-day period rolls
    env.set_time(T0 + 30 * DAY - 1);
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("SpendLimitExceeded"));
    env.set_time(T0 + 30 * DAY);
    env.buy(&draw, &alice, 25).unwrap();
    let p = env.profile(&alice.pubkey());
    assert_eq!((p.period_start, p.period_spent), (T0 + 30 * DAY, 25 * CENT));

    // a pending increase is cancelled by a decrease
    env.set_limit(&alice, 100 * CENT).unwrap();
    env.set_limit(&alice, 26 * CENT).unwrap();
    let p = env.profile(&alice.pubkey());
    assert_eq!((p.limit_lamports, p.pending_limit, p.pending_from), (26 * CENT, 0, 0));

    // removing the limit (0) is an increase: delayed too
    env.set_limit(&alice, 0).unwrap();
    let p = env.profile(&alice.pubkey());
    assert_eq!((p.limit_lamports, p.pending_limit, p.pending_from), (26 * CENT, 0, T0 + 30 * DAY + 72 * HOUR));
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 2, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("SpendLimitExceeded"));
    env.set_time(T0 + 30 * DAY + 72 * HOUR);
    env.buy(&draw, &alice, 25).unwrap();
    assert_eq!(env.profile(&alice.pubkey()).limit_lamports, 0);
}

#[test]
fn self_exclusion_blocks_play_and_cannot_be_shortened() {
    let (mut env, draw) = long_draw();
    let alice = env.user(10);
    env.buy(&draw, &alice, 1).unwrap();
    env.self_exclude(&alice, T0 + 30 * DAY).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("SelfExcluded"));
    let (ix, _, _) = env.ix_claim_free(&draw, &alice.pubkey());
    expect_err(env.send(&[ix], &[&alice]), &code("SelfExcluded"));
    env.grant_credits(&alice, 1);
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 1);
    expect_err(env.send(&[ix], &[&alice]), &code("SelfExcluded"));

    // can't be shortened
    env.self_exclude(&alice, T0 + DAY).unwrap();
    assert_eq!(env.profile(&alice.pubkey()).excluded_until, T0 + 30 * DAY);
    // can be extended
    env.self_exclude(&alice, T0 + 40 * DAY).unwrap();
    assert_eq!(env.profile(&alice.pubkey()).excluded_until, T0 + 40 * DAY);
    env.set_time(T0 + 40 * DAY - 1);
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1, 0);
    expect_err(env.send(&[ix], &[&alice]), &code("SelfExcluded"));
    env.set_time(T0 + 40 * DAY);
    env.buy(&draw, &alice, 1).unwrap();
    env.claim_free(&draw, &alice).unwrap();
}

#[test]
fn profile_is_per_wallet_and_only_its_owner_signs() {
    let (mut env, _) = long_draw();
    let (alice, bob) = (env.user(1), env.user(1));
    env.set_limit(&alice, CENT).unwrap();
    // bob cannot write alice's profile: the PDA is derived from the signer
    let mut ix = env.ix_profile(&bob.pubkey(), drawsol::instruction::SetLimit { lamports: 0 }.data());
    ix.accounts[0].pubkey = profile_pda(&alice.pubkey());
    expect_err(env.send(&[ix], &[&bob]), "ConstraintSeeds");
    assert_eq!(env.profile(&alice.pubkey()).limit_lamports, CENT);
}

use anchor_lang::InstructionData;
