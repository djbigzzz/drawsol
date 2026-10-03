//! reveal_entry: random assignment (each number once), recomputation with the published functions,
//! instant payouts exactly as scheduled, won bits / counters, the 1000-ticket compute budget, free entries.
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use drawsol::constants::*;
use solana_keypair::Keypair;
use solana_signer::Signer;
use std::collections::HashSet;

/// Alice 30, Bob 25, Carol 7 paid tickets and a free one for Dave.
fn played() -> (Env, Pubkey, Vec<(Bought, Keypair)>) {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let mut out = Vec::new();
    for q in [30u16, 25, 7] {
        let k = env.user(10);
        let b = env.buy(&draw, &k, q).unwrap();
        out.push((b, k));
    }
    let dave = env.user(1);
    let f = env.claim_free(&draw, &dave).unwrap();
    out.push((f, dave));
    (env, draw, out)
}

/// Reveals `b` under `rnd`, checking every effect against the off-chain recomputation. Returns owed.
#[track_caller]
fn reveal_and_check(env: &mut Env, draw: &Pubkey, b: &Bought, owner: &Pubkey, rnd: [u8; 64]) -> u64 {
    let (tickets, prizes, owed) = env.expected(draw, &b.entry, &rnd);
    let d0 = env.draw(draw);
    let (rem0, pool0) = env.pool(draw);
    let s0 = env.schedule(draw);
    let (o0, v0, p0) = (env.balance(owner), env.vault_free(draw), env.player(draw, owner).won_lamports);
    let ok = env.fulfill_and_reveal(draw, b, rnd);
    println!("reveal_entry({}): {} CU, owed {owed}", tickets.len(), ok.cu);

    let e = env.entry(&b.entry);
    assert!(e.revealed);
    assert_eq!(e.tickets, tickets, "tickets == off-chain Fisher–Yates over the pool");
    assert_eq!(e.prizes, prizes);
    assert_eq!(e.instant_paid, owed);
    assert_eq!(env.balance(owner) - o0, owed, "owner received exactly the scheduled prizes");
    assert_eq!(v0 - env.vault_free(draw), owed);
    assert_eq!(env.player(draw, owner).won_lamports - p0, owed);

    // pool: swap-removed exactly as recomputed
    let (rem, pool) = env.pool(draw);
    assert_eq!(rem, rem0 - e.count as u32);
    let mut expect_pool = pool0.clone();
    let mut r = rem0;
    drawsol::fairness::assign_tickets(&rnd, e.count, &mut expect_pool, &mut r);
    assert_eq!(pool, expect_pool);
    assert!(tickets.iter().all(|t| !pool[..rem as usize].contains(t)), "assigned numbers left the pool");
    assert!(tickets.iter().all(|&t| t < d0.ticket_cap));

    // schedule: won bits set exactly on the won numbers; tier counters
    let s = env.schedule(draw);
    for t in 0..s.len() {
        let won_now = tickets.contains(&(t as u32)) && (s0[t] & SCHEDULE_TIER_MASK) != 0;
        assert_eq!(s[t] & SCHEDULE_TIER_MASK, s0[t] & SCHEDULE_TIER_MASK, "tier byte never changes");
        assert_eq!((s[t] & SCHEDULE_WON_BIT != 0), (s0[t] & SCHEDULE_WON_BIT != 0) || won_now, "won bit of {t}");
    }
    let d = env.draw(draw);
    for t in 0..8 {
        let won_here = prizes.iter().filter(|&&p| p as usize == t + 1).count() as u16;
        assert_eq!(d.tiers[t].won, d0.tiers[t].won + won_here, "tier {t} won counter");
    }
    assert_eq!(d.assigned, d0.assigned + e.count as u32);
    assert_eq!(d.revealed_entries, d0.revealed_entries + 1);
    assert_eq!(d.instants_paid, d0.instants_paid + owed);
    owed
}

#[test]
fn random_assignment_uses_each_number_once_and_matches_recomputation() {
    let (mut env, draw, buyers) = played();
    let rnds = [[0x11u8; 64], [0x22; 64], [0x33; 64], [0x44; 64]];
    let mut all: Vec<u32> = Vec::new();
    let mut total_owed = 0;
    for (i, (b, k)) in buyers.iter().enumerate() {
        total_owed += reveal_and_check(&mut env, &draw, b, &k.pubkey(), rnds[i]);
        all.extend(env.entry(&b.entry).tickets.iter());
        expect_err(env.reveal(&draw, &b.entry), &code("AlreadyRevealed"));
    }
    assert_eq!(all.len(), 63);
    assert_eq!(all.iter().collect::<HashSet<_>>().len(), 63, "every ticket number distinct across entries");
    assert!(all.iter().all(|&t| t < 300));
    let d = env.draw(&draw);
    assert_eq!((d.assigned, d.revealed_entries, d.instants_paid), (63, 4, total_owed));
    assert_eq!(env.pool(&draw).0, 300 - 63);
    // the vault still covers everything: revenue + end prize + schedule − instants paid
    assert_eq!(env.vault_free(&draw), 62 * CENT + 70 * CENT + 30 * CENT - total_owed);
    // the won bits agree with the per-tier counters
    let s = env.schedule(&draw);
    let won_bits = s.iter().filter(|&&b| b & SCHEDULE_WON_BIT != 0).count() as u16;
    assert_eq!(won_bits, d.tiers.iter().map(|t| t.won).sum::<u16>());
}

#[test]
fn instant_payouts_match_the_schedule_amounts() {
    let (mut env, draw, buyers) = played();
    // Alice (30 tickets) is forced onto the 0.1 SOL number and at least one 0.02 SOL number.
    let (a, alice) = &buyers[0];
    let rnd = env.find_rnd(&draw, &a.entry, |_, p, _| p.contains(&1) && p.contains(&2));
    let (tickets, prizes, owed) = env.expected(&draw, &a.entry, &rnd);
    let n1 = prizes.iter().filter(|&&p| p == 1).count() as u64;
    let n2 = prizes.iter().filter(|&&p| p == 2).count() as u64;
    let n3 = prizes.iter().filter(|&&p| p == 3).count() as u64;
    assert_eq!(owed, n1 * 10 * CENT + n2 * 2 * CENT + n3 * CENT / 2);
    assert_eq!(n1, 1);
    // the winning numbers are exactly the scheduled ones
    let sched = env.schedule(&draw);
    for (t, p) in tickets.iter().zip(prizes.iter()) {
        assert_eq!(sched[*t as usize] & SCHEDULE_TIER_MASK, *p);
    }
    let paid = reveal_and_check(&mut env, &draw, a, &alice.pubkey(), rnd);
    assert_eq!(paid, owed);
    let d = env.draw(&draw);
    assert_eq!((d.tiers[0].won, d.tiers[1].won, d.tiers[2].won), (1, n2 as u16, n3 as u16));

    // Bob can no longer win the 0.1 SOL number: it left the pool. Whatever he gets, tier 0 stays at 1.
    let (b, bob) = &buyers[1];
    reveal_and_check(&mut env, &draw, b, &bob.pubkey(), [0x99; 64]);
    assert_eq!(env.draw(&draw).tiers[0].won, 1);
    assert!(env.draw(&draw).instants_paid <= 30 * CENT, "never more than the escrowed schedule");
}

#[test]
fn free_entry_gets_a_number_and_can_win() {
    let (mut env, draw, buyers) = played();
    let (f, dave) = &buyers[3];
    assert!(env.entry(&f.entry).is_free);
    let rnd = env.find_rnd(&draw, &f.entry, |_, p, o| p[0] != 0 && o > 0);
    let (tickets, prizes, owed) = env.expected(&draw, &f.entry, &rnd);
    assert_eq!(tickets.len(), 1);
    let paid = reveal_and_check(&mut env, &draw, f, &dave.pubkey(), rnd);
    assert_eq!(paid, owed);
    assert_eq!(env.draw(&draw).tiers[prizes[0] as usize - 1].amount, owed);
    assert_eq!(env.entry(&f.entry).tickets, tickets);
}

#[test]
fn reveal_1000_tickets_fits_the_compute_budget() {
    let (mut env, draw) = Env::with_draw(big_params(CLOSE, 2000));
    let (alice, bob) = (env.user(30), env.user(30));
    let a = env.buy(&draw, &alice, 1000).unwrap();
    let b = env.buy(&draw, &bob, 1000).unwrap();
    assert!(env.draw(&draw).sold_out());

    let (tickets, prizes, owed) = env.expected(&draw, &a.entry, &[0xC3; 64]);
    env.fulfill(&a.req, [0xC3; 64]);
    // without the compute-budget instruction the 200k default is not enough
    let ix = env.ix_reveal_with(&draw, &a.entry, a.req);
    expect_err(env.crank(ix.clone()), "ComputationalBudgetExceeded");
    let ok = env.crank_reveal(ix).unwrap();
    println!("reveal_entry(1000): {} CU (limit {CU_LIMIT}), owed {owed}", ok.cu);
    assert!(ok.cu < CU_LIMIT as u64, "1000-ticket reveal must fit the 1.4M budget: {} CU", ok.cu);
    let e = env.entry(&a.entry);
    assert_eq!(e.tickets, tickets);
    assert_eq!(e.prizes, prizes);
    assert_eq!(e.tickets.len(), 1000);
    assert_eq!(e.tickets.iter().collect::<HashSet<_>>().len(), 1000);
    assert_eq!(e.instant_paid, owed);

    let ok = reveal_and_check(&mut env, &draw, &b, &bob.pubkey(), [0x3C; 64]);
    println!("second 1000-ticket reveal: owed {ok}");
    let mut all: Vec<u32> = env.entry(&a.entry).tickets.clone();
    all.extend(env.entry(&b.entry).tickets.iter());
    all.sort_unstable();
    assert_eq!(all, (0..2000).collect::<Vec<u32>>(), "the two entries hold every number exactly once");
    let d = env.draw(&draw);
    assert_eq!((env.pool(&draw).0, d.assigned), (0, 2000));
    // with every number assigned, every scheduled prize was won and paid
    assert_eq!(d.instants_paid, d.schedule_total_lamports);
    assert!(d.tiers.iter().all(|t| t.won == t.count));
}

#[test]
fn reveal_checks_randomness_account() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let alice = env.user(10);
    let bob = env.user(10);
    let a = env.buy(&draw, &alice, 10).unwrap();
    let b = env.buy(&draw, &bob, 10).unwrap();

    expect_err(env.reveal(&draw, &a.entry), &code("VrfNotFulfilled"));
    env.fulfill(&b.req, [3u8; 64]);
    let ix = env.ix_reveal_with(&draw, &a.entry, b.req);
    expect_err(env.crank_reveal(ix), &code("VrfWrongAccount"));

    let seed = env.entry(&a.entry).vrf_seed;
    let real = env.svm.get_account(&a.req).unwrap();
    env.forge_fulfilled(a.req, alice.pubkey(), seed, [1u8; 64], anchor_lang::solana_program::system_program::ID);
    expect_err(env.reveal(&draw, &a.entry), &code("VrfWrongOwner"));
    env.forge_fulfilled(a.req, alice.pubkey(), [0xEE; 32], [1u8; 64], orao_solana_vrf::ID);
    expect_err(env.reveal(&draw, &a.entry), &code("VrfSeedMismatch"));
    env.svm.set_account(a.req, real).unwrap();
    expect_err(env.reveal(&draw, &a.entry), &code("VrfNotFulfilled"));
    assert!(!env.entry(&a.entry).revealed);
    assert_eq!(env.pool(&draw).0, 300, "nothing left the pool");
}

#[test]
fn reveal_rejects_accounts_of_another_draw() {
    let (mut env, d0) = Env::with_draw(params(CLOSE));
    let d1 = env.setup_draw(params(CLOSE)).unwrap();
    let alice = env.user(10);
    let b = env.buy(&d1, &alice, 2).unwrap();
    env.fulfill(&b.req, [5u8; 64]);
    // entry of d1 with d0: seeds of the entry fail
    let mut ix = env.ix_reveal_with(&d0, &b.entry, b.req);
    ix.accounts[5].pubkey = player_pda(&d1, &alice.pubkey());
    expect_err(env.crank_reveal(ix), "ConstraintSeeds");
    // right draw, but d0's pool / schedule
    let mut ix = env.ix_reveal_with(&d1, &b.entry, b.req);
    ix.accounts[2].pubkey = pool_pda(&d0);
    expect_err(env.crank_reveal(ix), "ConstraintSeeds");
    let mut ix = env.ix_reveal_with(&d1, &b.entry, b.req);
    ix.accounts[3].pubkey = schedule_pda(&d0);
    expect_err(env.crank_reveal(ix), "ConstraintSeeds");
    // winnings go to the owner only
    let mut ix = env.ix_reveal_with(&d1, &b.entry, b.req);
    ix.accounts[6].pubkey = env.cranker.pubkey();
    expect_err(env.crank_reveal(ix), "ConstraintHasOne");
    env.reveal(&d1, &b.entry).unwrap();
}
