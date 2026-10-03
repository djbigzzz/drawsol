//! request_draw / settle_draw / withdraw: position → ticket mapping, full prize vs fallback pot, escrow
//! leftovers, the house share only after settlement, deferred schedule escrow, keeper window, no-ticket cancel.
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use drawsol::state::DrawStatus;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Sells `n` paid tickets over fresh wallets (≤ 100 each, the preset's per-tx cap). Returns (entry, buyer, qty).
fn sell(env: &mut Env, draw: &Pubkey, mut n: u32) -> Vec<(Bought, Keypair, u16)> {
    let mut out = Vec::new();
    while n > 0 {
        let q = n.min(100) as u16;
        let k = env.user(5);
        let b = env.buy(draw, &k, q).unwrap();
        out.push((b, k, q));
        n -= q as u32;
    }
    out
}

fn reveal_all(env: &mut Env, bought: &[(Bought, Keypair, u16)]) -> u64 {
    let mut total = 0;
    for (i, (b, _, _)) in bought.iter().enumerate() {
        let mut rnd = [0x61u8; 64];
        rnd[0] = i as u8;
        let draw = env.entry(&b.entry).draw;
        env.fulfill_and_reveal(&draw, b, rnd);
        total += env.entry(&b.entry).instant_paid;
    }
    total
}

#[test]
fn settle_pays_the_full_end_prize_at_min_tickets_and_maps_position_to_ticket() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let bought = sell(&mut env, &draw, 200); // min is 200
    let freebie = env.user(1);
    let f = env.claim_free(&draw, &freebie).unwrap();
    let instants = reveal_all(&mut env, &bought);
    env.fulfill_and_reveal(&draw, &f, [0x71; 64]);
    let instants = instants + env.entry(&f.entry).instant_paid;
    let d = env.draw(&draw);
    assert_eq!((d.paid_tickets, d.next_pos, d.instants_paid), (200, 201, instants));
    assert!(d.all_revealed());

    expect_err(env.withdraw(&draw), &code("NothingToWithdraw")); // Open: nothing for the house yet
    expect_err(env.request_draw(&draw), &code("DrawNotDue"));
    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    assert_eq!(env.draw(&draw).status, DrawStatus::Drawing);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw")); // Drawing: still nothing

    let rnd = [0x42u8; 64];
    let pos = drawsol::fairness::winning_position(&rnd, 201);
    let win = env.entry_holding(&draw, pos);
    let we = env.entry(&win);
    let winner = we.owner;
    let expected_ticket = we.tickets[(pos - we.first_pos) as usize];
    let (w0, a0) = (env.balance(&winner), env.balance(&env.admin.pubkey()));
    let (e, p) = env.fulfill_and_settle(&draw, rnd);
    assert_eq!((e, p), (win, pos));

    assert_eq!(env.balance(&winner) - w0, 70 * CENT, "full end prize");
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, 30 * CENT - instants, "unwon schedule back at settle (all revealed)");
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Settled);
    assert_eq!((d.winning_pos, d.winning_ticket, d.winning_entry, d.winner), (pos, expected_ticket, win, winner));
    assert_eq!((d.end_prize_paid, d.house_lamports, d.house_withdrawn), (70 * CENT, 200 * CENT, 0));
    assert!(d.prize_paid && d.escrow_returned && d.instant_escrow_returned);
    assert_eq!(d.randomness, rnd);
    assert_eq!(d.settled_at, CLOSE);
    assert_eq!(env.vault_free(&draw), 200 * CENT, "only the house share is left");

    assert_eq!(env.withdraw(&draw).unwrap(), 200 * CENT);
    assert_eq!(env.draw(&draw).house_withdrawn, 200 * CENT);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
    expect_err(env.settle(&draw, &win), &code("WrongStatus"));
    let mallory = env.user(1);
    let ix = env.ix_withdraw(&draw, &mallory.pubkey());
    expect_err(env.send(&[ix], &[&mallory]), &code("Unauthorized"));
}

#[test]
fn settle_below_min_pays_the_fallback_pot_and_returns_the_end_prize() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let bought = sell(&mut env, &draw, 199); // one below min
    let freebie = env.user(1);
    let f = env.claim_free(&draw, &freebie).unwrap();
    let instants = reveal_all(&mut env, &bought) + {
        env.fulfill_and_reveal(&draw, &f, [0x72; 64]);
        env.entry(&f.entry).instant_paid
    };
    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();

    let revenue = 199 * CENT;
    let pot = revenue * 3500 / 10_000;
    // make the free ticket the winner: position 199 is the free entry's
    let rnd = find_draw_randomness(200, |p| p == 199);
    let (w0, a0) = (env.balance(&freebie.pubkey()), env.balance(&env.admin.pubkey()));
    let (e, _) = env.fulfill_and_settle(&draw, rnd);
    assert_eq!(e, f.entry, "a free ticket can win the end prize");
    assert_eq!(env.balance(&freebie.pubkey()) - w0, pot, "fallback pot = 35% of revenue");
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, 70 * CENT + 30 * CENT - instants, "end prize + unwon schedule back");
    let d = env.draw(&draw);
    assert_eq!((d.end_prize_paid, d.house_lamports), (pot, revenue - pot));
    assert_eq!(d.winning_ticket, env.entry(&f.entry).tickets[0]);
    assert_eq!(env.vault_free(&draw), revenue - pot);
    assert_eq!(env.withdraw(&draw).unwrap(), revenue - pot);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
    // house ≥ 55% of revenue even on the fallback path
    assert!((revenue - pot) * 10_000 >= revenue * 5500);
}

#[test]
fn settle_checks_entry_winner_authority_and_reveal() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let (alice, bob) = (env.user(10), env.user(10));
    let a = env.buy(&draw, &alice, 10).unwrap();
    let b = env.buy(&draw, &bob, 10).unwrap();
    expect_err(env.settle(&draw, &a.entry), &code("WrongStatus")); // Open
    env.set_time(CLOSE);
    let req = env.request_draw(&draw).unwrap();
    expect_err(env.settle(&draw, &a.entry), &code("VrfNotFulfilled"));
    // a different, fulfilled ORAO request
    env.fulfill(&a.req, [8u8; 64]);
    let mut ix = env.ix_settle(&draw, &a.entry, &alice.pubkey());
    ix.accounts[2].pubkey = a.req;
    expect_err(env.crank(ix), &code("VrfWrongAccount"));

    let rnd = find_draw_randomness(20, |p| p < 10); // Alice's positions
    env.fulfill(&req, rnd);
    expect_err(env.settle(&draw, &b.entry), &code("WrongWinningEntry"));
    expect_err(env.settle(&draw, &a.entry), &code("WinnerNotRevealed"));
    env.reveal(&draw, &a.entry).unwrap();
    let ix = env.ix_settle(&draw, &a.entry, &bob.pubkey());
    expect_err(env.crank(ix), "ConstraintAddress");
    let mut ix = env.ix_settle(&draw, &a.entry, &alice.pubkey());
    ix.accounts[5].pubkey = bob.pubkey();
    expect_err(env.crank(ix), &code("Unauthorized"));
    // entry of another draw
    let d1 = env.setup_draw(params(CLOSE + DAY)).unwrap();
    let other = env.user(10);
    let ob = env.buy(&d1, &other, 5).unwrap();
    let ix = env.ix_settle(&draw, &ob.entry, &other.pubkey());
    expect_err(env.crank(ix), "ConstraintSeeds");
    env.settle(&draw, &a.entry).unwrap();
    let d = env.draw(&draw);
    assert_eq!(d.winning_ticket, env.entry(&a.entry).tickets[d.winning_pos as usize]);
    assert!(!d.instant_escrow_returned, "Bob is unrevealed: the schedule escrow stays");
    expect_err(env.settle(&draw, &a.entry), &code("WrongStatus"));
}

#[test]
fn schedule_escrow_is_released_once_everyone_revealed_or_after_48h() {
    // Two identical draws; in both Alice reveals and Bob does not before settlement.
    let mut env = Env::new();
    let mut draws = Vec::new();
    for _ in 0..2 {
        let draw = env.setup_draw(params(CLOSE)).unwrap();
        let (alice, bob) = (env.user(10), env.user(10));
        let a = env.buy(&draw, &alice, 50).unwrap();
        let b = env.buy(&draw, &bob, 50).unwrap();
        env.fulfill_and_reveal(&draw, &a, [0x55; 64]);
        draws.push((draw, a, alice, b, bob));
    }
    env.set_time(CLOSE);
    for (draw, a, alice, _, _) in &draws {
        env.request_draw(draw).unwrap();
        let rnd = find_draw_randomness(100, |p| p < 50);
        let a0 = env.balance(&env.admin.pubkey());
        let (e, _) = env.fulfill_and_settle(draw, rnd);
        assert_eq!(e, a.entry);
        assert_eq!(env.entry(&a.entry).owner, alice.pubkey());
        // fallback (100 < 200 paid): the end prize came back, the schedule escrow did not
        let d = env.draw(draw);
        assert_eq!(env.balance(&env.admin.pubkey()) - a0, 70 * CENT);
        assert!(!d.instant_escrow_returned);
        let left = 30 * CENT - d.instants_paid;
        assert_eq!(env.vault_free(draw), d.house_lamports + left);
        // withdraw pays the house share only, for now
        assert_eq!(env.withdraw(draw).unwrap(), d.house_lamports);
        assert_eq!(env.vault_free(draw), left);
        expect_err(env.withdraw(draw), &code("NothingToWithdraw"));
    }

    // Draw 0: Bob reveals late — still paid from the held escrow; then the leftover is released.
    let (draw, _, _, b, bob) = &draws[0];
    let rnd = env.find_rnd(draw, &b.entry, |_, _, o| o > 0);
    let (_, _, owed) = env.expected(draw, &b.entry, &rnd);
    let b0 = env.balance(&bob.pubkey());
    env.fulfill_and_reveal(draw, b, rnd);
    assert_eq!(env.balance(&bob.pubkey()) - b0, owed, "late reveal before release is paid in full");
    let d = env.draw(draw);
    assert!(d.all_revealed());
    assert_eq!(env.withdraw(draw).unwrap(), 30 * CENT - d.instants_paid);
    assert!(env.draw(draw).instant_escrow_returned);
    assert_eq!(env.balance(&vault_pda(draw)), env.vault_rent());

    // Draw 1: nobody reveals Bob; 48 h after draw_at the authority may take the leftover anyway.
    let (draw, _, _, b, bob) = &draws[1];
    env.set_time(CLOSE + 48 * HOUR);
    expect_err(env.withdraw(draw), &code("NothingToWithdraw"));
    env.set_time(CLOSE + 48 * HOUR + 1);
    let d = env.draw(draw);
    assert_eq!(env.withdraw(draw).unwrap(), 30 * CENT - d.instants_paid);
    assert_eq!(env.balance(&vault_pda(draw)), env.vault_rent());
    // Bob's reveal after that still assigns numbers and records prizes, but pays nothing.
    let rnd = env.find_rnd(draw, &b.entry, |_, _, o| o > 0);
    let (tickets, prizes, _) = env.expected(draw, &b.entry, &rnd);
    let b0 = env.balance(&bob.pubkey());
    env.fulfill_and_reveal(draw, b, rnd);
    let e = env.entry(&b.entry);
    assert_eq!((e.tickets, e.prizes, e.instant_paid), (tickets, prizes, 0));
    assert_eq!(env.balance(&bob.pubkey()), b0);
    assert_eq!(env.balance(&vault_pda(draw)), env.vault_rent());
}

#[test]
fn no_tickets_cancels_at_request_and_returns_the_whole_escrow() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    env.set_time(CLOSE);
    let a0 = env.balance(&env.admin.pubkey());
    env.request_draw_cancel(&draw).unwrap();
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Cancelled);
    assert!(d.escrow_returned && d.instant_escrow_returned);
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, 100 * CENT);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
    expect_err(env.request_draw(&draw), &code("WrongStatus"));
}

#[test]
fn request_draw_needs_orao_accounts_when_drawing() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let alice = env.user(10);
    env.buy(&draw, &alice, 1).unwrap();
    env.set_time(CLOSE);
    let k = env.keeper.insecure_clone();
    let ix = env.ix_request_draw_raw(&draw, &k.pubkey(), [0u8; 16], None);
    expect_err(env.send(&[ix], &[&k]), &code("VrfWrongAccount"));
    let ix = env.ix_request_draw_raw(&draw, &k.pubkey(), [1u8; 16], Some(Pubkey::new_unique()));
    expect_err(env.send(&[ix], &[&k]), &code("VrfWrongAccount"));
    let t0 = env.balance(&env.treasury);
    let req = env.request_draw(&draw).unwrap();
    assert_eq!(env.balance(&env.treasury), t0 + env.request_fee, "caller pays the ORAO fee");
    let d = env.draw(&draw);
    assert_eq!((d.status, d.draw_vrf_request), (DrawStatus::Drawing, req));
    assert_eq!(&d.draw_vrf_seed[..], &env.svm.get_account(&req).unwrap().data[41..73], "ORAO stored the program's seed");
    expect_err(env.request_draw(&draw), &code("WrongStatus"));
}

#[test]
fn keeper_only_window_then_public() {
    let mut env = Env::new();
    let draws: Vec<Pubkey> = (0..3).map(|_| env.setup_draw(params(CLOSE)).unwrap()).collect();
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
