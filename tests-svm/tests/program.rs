//! DrawSol v2 program tests (LiteSVM + real ORAO VRF program).
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use drawsol::state::{DrawStatus, IwTier};
use solana_keypair::Keypair;
use solana_signer::Signer;

const CLOSE: i64 = T0 + 2 * HOUR;

fn demo() -> (Env, Pubkey) {
    Env::with_draw(demo_params(CLOSE))
}

// ====================================================================== init_config

#[test]
fn init_config_requires_upgrade_authority() {
    let mut env = Env::new();
    let attacker = env.user(10);
    let real_pd = programdata_pda(&drawsol::ID);

    // Not the upgrade authority, real ProgramData account.
    let ix = env.ix_init_config(&attacker.pubkey(), real_pd);
    expect_err(env.send(&[ix], &[&attacker]), &code("Unauthorized"));

    // Fake ProgramData (owned by the upgradeable loader, naming the attacker as authority) at another
    // address: rejected because it is not the program's programdata_address.
    let fake_pd = Pubkey::new_unique();
    let fake = programdata_account(&env.svm, b"not-an-elf", Some(attacker.pubkey()));
    env.svm.set_account(fake_pd, fake).unwrap();
    let ix = env.ix_init_config(&attacker.pubkey(), fake_pd);
    expect_err(env.send(&[ix], &[&attacker]), &code("Unauthorized"));

    // Upgrade authority succeeds, once.
    env.init_config().unwrap();
    let c = env.config();
    assert_eq!(c.admin, env.admin.pubkey());
    assert_eq!(c.next_draw_id, 0);
    assert!(env.init_config().is_err(), "config cannot be re-initialised");
}

#[test]
fn init_config_fails_for_immutable_program() {
    // A program deployed with no upgrade authority: nobody can claim admin.
    let mut env = Env::new();
    let elf = std::fs::read(format!("{ROOT}/../target/deploy/drawsol.so")).unwrap();
    deploy_upgradeable(&mut env.svm, drawsol::ID, &elf, None);
    expect_err(env.init_config(), &code("Unauthorized"));
}

// ====================================================================== create_draw

#[test]
fn create_draw_escrows_prize_and_reserve() {
    let mut env = Env::new();
    env.init_config().unwrap();
    let admin_before = env.balance(&env.admin.pubkey());
    let p = demo_params(CLOSE);
    let draw = env.create_draw(p.clone()).unwrap();
    let vault = vault_pda(&draw);

    assert_eq!(env.balance(&vault), env.vault_rent() + SOL + 2 * SOL, "vault = rent + prize + reserve");
    assert!(admin_before - env.balance(&env.admin.pubkey()) >= 3 * SOL);
    let d = env.draw(&draw);
    assert_eq!(d.id, 0);
    assert_eq!(d.authority, env.admin.pubkey());
    assert_eq!(d.status, DrawStatus::Open);
    assert_eq!(d.prize_lamports, SOL);
    assert_eq!(d.iw_reserve_lamports, 2 * SOL);
    assert_eq!(d.ticket_price, SOL / 100);
    assert_eq!((d.ticket_cap, d.max_per_tx, d.max_per_wallet, d.free_cap), (150, 25, 50, 15));
    assert_eq!(d.created_at, T0);
    assert_eq!(d.closes_at, CLOSE);
    assert_eq!(d.iw_tiers, p.iw_tiers);
    assert_eq!(d.terms_hash, [7u8; 32]);
    assert_eq!(env.config().next_draw_id, 1);

    // Second draw gets id 1.
    let d1 = env.create_draw(demo_params(CLOSE)).unwrap();
    assert_eq!(env.draw(&d1).id, 1);
    assert_eq!(env.config().next_draw_id, 2);
}

#[test]
fn create_draw_admin_only() {
    let mut env = Env::new();
    env.init_config().unwrap();
    let mallory = env.user(100);
    let ix = env.ix_create_draw(&mallory.pubkey(), 0, demo_params(CLOSE));
    expect_err(env.send(&[ix], &[&mallory]), &code("Unauthorized"));
}

#[test]
fn create_draw_validates_params() {
    let mut env = Env::new();
    env.init_config().unwrap();
    let base = demo_params(CLOSE);
    let mut bad = Vec::new();
    let mut p = base.clone();
    p.closes_at = T0;
    bad.push(("closes_at <= now", p));
    let mut p = base.clone();
    p.ticket_cap = 0;
    bad.push(("ticket_cap 0", p));
    let mut p = base.clone();
    p.max_per_tx = 26;
    bad.push(("max_per_tx > 25", p));
    let mut p = base.clone();
    p.max_per_tx = 0;
    bad.push(("max_per_tx 0", p));
    let mut p = base.clone();
    p.max_per_wallet = 0;
    bad.push(("max_per_wallet 0", p));
    let mut p = base.clone();
    p.prize_lamports = 0;
    bad.push(("prize 0", p));
    let mut p = base.clone();
    p.iw_denominator = 0;
    bad.push(("denominator 0", p));
    let mut p = base.clone();
    p.iw_tiers[3] = IwTier { amount: 1, odds: 801 }; // sum(odds) = 1001 > 1000
    bad.push(("sum(odds) > denominator", p));
    let mut p = base.clone();
    p.iw_tiers[0] = IwTier { amount: SOL, odds: 10 }; // EV = (10 + 2 + 1.5)/1000 SOL = 0.0135 >= 0.01
    bad.push(("expected payout >= price", p));
    let mut p = base.clone();
    p.ticket_price = 5_500_000; // EV is exactly 0.0055 SOL: must be strictly less
    bad.push(("expected payout == price", p));
    let mut p = base.clone();
    p.iw_tiers[3] = IwTier { amount: 1000, odds: 0 };
    bad.push(("half-empty tier", p));

    for (what, p) in bad {
        let ix = env.ix_create_draw(&env.admin.pubkey(), 0, p);
        let admin = env.admin.insecure_clone();
        let r = env.send(&[ix], &[&admin]);
        assert!(r.as_ref().err().map_or(false, |e| e.contains(&code("InvalidParams"))), "{what}: {r:?}", r = r.err());
    }
    // the boundary just below the price is accepted
    let mut p = base.clone();
    p.ticket_price = 5_500_001;
    env.create_draw(p).unwrap();
}

// ====================================================================== buy_tickets

#[test]
fn buy_happy_path() {
    let (mut env, draw) = demo();
    let vault = vault_pda(&draw);
    let alice = env.user(10);
    let bob = env.user(10);
    let v0 = env.balance(&vault);
    let t0 = env.balance(&env.treasury);

    let (ix, e1, req1) = env.ix_buy(&draw, &alice.pubkey(), 5);
    let ok = env.send(&[ix], &[&alice]).unwrap();
    println!("buy_tickets(5): {} CU", ok.cu);
    let (e2, _req2) = env.buy(&draw, &bob, 3).unwrap();
    let (e3, _) = env.buy(&draw, &alice, 25).unwrap();

    let a = env.entry(&e1);
    assert_eq!((a.draw, a.owner, a.seq, a.first_ticket, a.count), (draw, alice.pubkey(), 0, 0, 5));
    assert!(!a.is_free && !a.revealed && !a.refunded);
    assert_eq!(a.paid_lamports, 5 * SOL / 100);
    assert_eq!(a.created_at, T0);
    assert_eq!(a.vrf_request, req1);
    let b = env.entry(&e2);
    assert_eq!((b.seq, b.first_ticket, b.count, b.owner), (1, 5, 3, bob.pubkey()));
    let c = env.entry(&e3);
    assert_eq!((c.seq, c.first_ticket, c.count), (2, 8, 25));

    let pa = env.player(&player_pda(&draw, &alice.pubkey()));
    assert_eq!((pa.draw, pa.wallet, pa.tickets, pa.spent, pa.won, pa.free_claimed), (draw, alice.pubkey(), 30, 30 * SOL / 100, 0, false));
    let pb = env.player(&player_pda(&draw, &bob.pubkey()));
    assert_eq!(pb.tickets, 3);

    let d = env.draw(&draw);
    assert_eq!((d.paid_tickets, d.next_ticket, d.entry_count, d.paid_entries), (33, 33, 3, 3));
    assert_eq!(d.proceeds_lamports, 33 * SOL / 100);
    assert_eq!(env.balance(&vault), v0 + 33 * SOL / 100);

    // ORAO request created for the program-derived seed, owned by ORAO, client = buyer, pending.
    let acc = env.svm.get_account(&req1).expect("ORAO request account created");
    assert_eq!(acc.owner, orao_solana_vrf::ID);
    assert_eq!(acc.data[8], 0, "pending");
    assert_eq!(&acc.data[9..41], alice.pubkey().as_ref());
    assert_eq!(&acc.data[41..73], &a.vrf_seed);
    assert_eq!(env.balance(&env.treasury), t0 + 3 * env.request_fee, "buyer pays the ORAO fee");
    println!("ORAO request fee: {} lamports", env.request_fee);
}

#[test]
fn buy_rejects_foreign_vrf_account() {
    let (mut env, draw) = demo();
    let alice = env.user(10);
    // A request PDA for a seed the program did not derive (different nonce than the one passed).
    let seed = drawsol::fairness::entry_vrf_seed(&draw, &alice.pubkey(), 0, &[9u8; 16]);
    let wrong = drawsol::fairness::vrf_request_address(&seed);
    let ix = env.ix_buy_raw(&draw, &alice.pubkey(), 0, 1, [1u8; 16], wrong);
    expect_err(env.send(&[ix], &[&alice]), &code("VrfWrongAccount"));
    // A seed can never be reused: the ORAO PDA is `init`ed. Pre-creating the PDA (griefing) only
    // makes that one nonce unusable; the client just picks another.
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    env.send(&[ix], &[&alice]).unwrap();
}

#[test]
fn buy_limits() {
    let mut p = demo_params(CLOSE);
    p.ticket_cap = 40;
    p.max_per_tx = 10;
    p.max_per_wallet = 15;
    let (mut env, draw) = Env::with_draw(p);
    let alice = env.user(10);

    // per-tx: above the draw's max_per_tx, above the hard cap, and zero
    for q in [11u16, 26, 0] {
        let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), q);
        expect_err(env.send(&[ix], &[&alice]), &code("ExceedsPerTx"));
    }
    // wallet cap: 10 + 6 > 15
    env.buy(&draw, &alice, 10).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 6);
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsWalletCap"));
    env.buy(&draw, &alice, 5).unwrap(); // exactly 15 is fine
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsWalletCap"));

    // ticket cap: 15 + 10 + 10 = 35; 6 more > 40
    let bob = env.user(10);
    let carol = env.user(10);
    env.buy(&draw, &bob, 10).unwrap();
    env.buy(&draw, &carol, 10).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &bob.pubkey(), 6);
    expect_err(env.send(&[ix], &[&bob]), &code("SoldOut"));
    env.buy(&draw, &bob, 5).unwrap(); // exactly sold out
    let (ix, _, _) = env.ix_buy(&draw, &carol.pubkey(), 1);
    expect_err(env.send(&[ix], &[&carol]), &code("SoldOut"));
    assert_eq!(env.draw(&draw).paid_tickets, 40);
}

#[test]
fn buy_after_close_fails() {
    let (mut env, draw) = demo();
    let alice = env.user(10);
    env.set_time(CLOSE - 1);
    env.buy(&draw, &alice, 1).unwrap();
    env.set_time(CLOSE);
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    expect_err(env.send(&[ix], &[&alice]), &code("SalesClosed"));
    let (ix, _) = env.ix_claim_free(&draw, &alice.pubkey());
    expect_err(env.send(&[ix], &[&alice]), &code("SalesClosed"));
}

// ====================================================================== reveal_entry

#[test]
fn reveal_checks_randomness_account() {
    let (mut env, draw) = demo();
    let alice = env.user(10);
    let bob = env.user(10);
    let (ea, req_a) = env.buy(&draw, &alice, 10).unwrap();
    let (_eb, req_b) = env.buy(&draw, &bob, 10).unwrap();

    // Not fulfilled yet.
    expect_err(env.reveal(&draw, &ea), &code("VrfNotFulfilled"));

    // Bob's request fulfilled; passing it for Alice's entry is rejected.
    env.fulfill(&req_b, [3u8; 64]);
    let ix = env.ix_reveal_with(&draw, &ea, req_b);
    let c = env.cranker.insecure_clone();
    expect_err(env.send(&[ix], &[&c]), &code("VrfWrongAccount"));

    // Forged account at Alice's address but not owned by ORAO.
    let a = env.entry(&ea);
    let real = env.svm.get_account(&req_a).unwrap();
    env.forge_fulfilled(req_a, alice.pubkey(), a.vrf_seed, [1u8; 64], anchor_lang::solana_program::system_program::ID);
    expect_err(env.reveal(&draw, &ea), &code("VrfWrongOwner"));

    // ORAO-owned account at Alice's address carrying a different seed.
    env.forge_fulfilled(req_a, alice.pubkey(), [0xEE; 32], [1u8; 64], orao_solana_vrf::ID);
    expect_err(env.reveal(&draw, &ea), &code("VrfSeedMismatch"));

    // Restore the genuine pending request: still not fulfilled.
    env.svm.set_account(req_a, real).unwrap();
    expect_err(env.reveal(&draw, &ea), &code("VrfNotFulfilled"));
    assert!(!env.entry(&ea).revealed);
}

#[test]
fn reveal_pays_recomputed_tiers_once() {
    let (mut env, draw) = demo();
    let vault = vault_pda(&draw);
    let alice = env.user(10);
    let (ea, req) = env.buy(&draw, &alice, 25).unwrap();
    let d = env.draw(&draw);
    let e = env.entry(&ea);
    let rnd = find_randomness(&d, &e, |total| total > 0);
    let (exp_tiers, exp_total) = expected_reveal(&rnd, &d, &e);
    env.fulfill(&req, rnd);

    let (a0, v0) = (env.balance(&alice.pubkey()), env.balance(&vault));
    let ok = env.reveal(&draw, &ea).unwrap(); // sent and paid for by a third party
    println!("reveal_entry(25): {} CU, won {} lamports, tiers {:?}", ok.cu, exp_total, &exp_tiers[..]);

    let e = env.entry(&ea);
    assert!(e.revealed);
    assert_eq!(e.tiers, exp_tiers);
    assert_eq!(e.instant_paid, exp_total);
    assert_eq!(env.balance(&alice.pubkey()) - a0, exp_total, "owner receives exactly the recomputed total");
    assert_eq!(v0 - env.balance(&vault), exp_total);
    let d = env.draw(&draw);
    assert_eq!(d.iw_paid_lamports, exp_total);
    assert_eq!(d.revealed_entries, 1);
    assert_eq!(env.player(&player_pda(&draw, &alice.pubkey())).won, exp_total);

    // Second reveal fails and pays nothing.
    expect_err(env.reveal(&draw, &ea), &code("AlreadyRevealed"));
    assert_eq!(env.balance(&alice.pubkey()) - a0, exp_total);

    // A losing entry reveals with zero payout.
    let bob = env.user(10);
    let (eb, reqb) = env.buy(&draw, &bob, 1).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&eb));
    let rnd = find_randomness(&d, &e, |t| t == 0);
    env.fulfill(&reqb, rnd);
    let b0 = env.balance(&bob.pubkey());
    env.reveal(&draw, &eb).unwrap();
    assert_eq!(env.balance(&bob.pubkey()), b0);
    assert_eq!(env.entry(&eb).tiers, [0u8; 25]);
    assert_eq!(env.draw(&draw).revealed_entries, 2);
}

#[test]
fn reveal_is_capped_by_remaining_reserve() {
    let mut p = demo_params(CLOSE);
    p.iw_reserve_lamports = SOL / 100 + 1; // tiny reserve
    let (mut env, draw) = Env::with_draw(p);
    let vault = vault_pda(&draw);
    let alice = env.user(10);
    let (ea, req) = env.buy(&draw, &alice, 25).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&ea));
    let rnd = find_randomness(&d, &e, |t| t > SOL / 100 + 1);
    let (exp_tiers, exp_total) = expected_reveal(&rnd, &d, &e);
    env.fulfill(&req, rnd);
    let a0 = env.balance(&alice.pubkey());
    env.reveal(&draw, &ea).unwrap();
    let e = env.entry(&ea);
    assert_eq!(e.tiers, exp_tiers, "tiers are recorded in full");
    assert!(exp_total > SOL / 100 + 1);
    assert_eq!(e.instant_paid, SOL / 100 + 1, "pays min(total, reserve remaining) and records exactly that");
    assert_eq!(env.balance(&alice.pubkey()) - a0, SOL / 100 + 1);
    assert_eq!(env.draw(&draw).iw_paid_lamports, SOL / 100 + 1);

    // Reserve exhausted: the next winner gets 0 but the reveal still succeeds.
    let bob = env.user(10);
    let (eb, reqb) = env.buy(&draw, &bob, 25).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&eb));
    env.fulfill(&reqb, find_randomness(&d, &e, |t| t > 0));
    let b0 = env.balance(&bob.pubkey());
    env.reveal(&draw, &eb).unwrap();
    assert_eq!(env.entry(&eb).instant_paid, 0);
    assert_eq!(env.balance(&bob.pubkey()), b0);
    // vault still holds rent + prize + proceeds
    assert_eq!(env.balance(&vault), env.vault_rent() + SOL + 50 * SOL / 100);
}

#[test]
fn reveal_rejects_entry_of_another_draw() {
    let (mut env, d0) = demo();
    let d1 = env.create_draw(demo_params(CLOSE)).unwrap();
    let alice = env.user(10);
    let (e1, req) = env.buy(&d1, &alice, 2).unwrap();
    env.fulfill(&req, [5u8; 64]);
    // entry of draw 1 presented with draw 0 (and draw 0's vault)
    let mut ix = env.ix_reveal_with(&d0, &e1, req);
    ix.accounts[3].pubkey = player_pda(&d1, &alice.pubkey()); // a real, initialised Player
    let c = env.cranker.insecure_clone();
    expect_err(env.send(&[ix], &[&c]), "ConstraintSeeds");
}

// ====================================================================== free entry

#[test]
fn free_entry_once_per_wallet_and_capped() {
    let mut p = demo_params(CLOSE);
    p.free_cap = 2;
    p.max_per_wallet = 3;
    let (mut env, draw) = Env::with_draw(p);
    let alice = env.user(10);
    let bob = env.user(10);
    let carol = env.user(10);

    env.buy(&draw, &alice, 2).unwrap();
    let ef = env.claim_free(&draw, &alice).unwrap();
    let e = env.entry(&ef);
    assert_eq!((e.seq, e.first_ticket, e.count, e.is_free, e.revealed, e.paid_lamports), (1, 2, 1, true, true, 0));
    assert_eq!(e.vrf_request, Pubkey::default());
    let pa = env.player(&player_pda(&draw, &alice.pubkey()));
    assert!(pa.free_claimed);
    assert_eq!(pa.tickets, 3);

    // once per wallet
    let (ix, _) = env.ix_claim_free(&draw, &alice.pubkey());
    expect_err(env.send(&[ix], &[&alice]), &code("FreeAlreadyClaimed"));
    // the free ticket counts toward the wallet cap
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsWalletCap"));

    env.claim_free(&draw, &bob).unwrap(); // bob: free entry without buying (creates Player)
    let (ix, _) = env.ix_claim_free(&draw, &carol.pubkey());
    expect_err(env.send(&[ix], &[&carol]), &code("FreeCapReached"));

    let d = env.draw(&draw);
    assert_eq!((d.free_tickets, d.paid_tickets, d.next_ticket, d.entry_count, d.paid_entries), (2, 2, 4, 3, 1));
    assert_eq!(d.proceeds_lamports, 2 * SOL / 100);

    // free entries have no instant reveal
    let ix = env.ix_reveal_with(&draw, &ef, Pubkey::default());
    let c = env.cranker.insecure_clone();
    expect_err(env.send(&[ix], &[&c]), &code("FreeEntryNoReveal"));
}

// ====================================================================== request_draw / settle_draw

#[test]
fn request_draw_timing() {
    let (mut env, draw) = demo();
    let alice = env.user(10);
    env.buy(&draw, &alice, 3).unwrap();

    env.set_time(CLOSE - 1);
    let (ix, _) = env.ix_request_draw(&draw);
    let c = env.cranker.insecure_clone();
    expect_err(env.send(&[ix], &[&c]), &code("SalesStillOpen"));

    env.set_time(CLOSE);
    // a request PDA the program did not derive is rejected
    let ix = env.ix_request_draw_raw(&draw, [1u8; 16], Pubkey::new_unique());
    expect_err(env.send(&[ix], &[&c]), &code("VrfWrongAccount"));

    let t0 = env.balance(&env.treasury);
    let req = env.request_draw(&draw).unwrap();
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Drawing);
    assert_eq!(d.draw_vrf_request, req);
    assert_eq!(d.draw_vrf_seed, {
        let acc = env.svm.get_account(&req).unwrap();
        <[u8; 32]>::try_from(&acc.data[41..73]).unwrap()
    });
    assert_eq!(env.balance(&env.treasury), t0 + env.request_fee, "caller pays the ORAO fee");

    // once Drawing: no second request, no more sales
    let (ix, _) = env.ix_request_draw(&draw);
    expect_err(env.send(&[ix], &[&c]), &code("WrongStatus"));
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    expect_err(env.send(&[ix], &[&alice]), &code("WrongStatus"));
}

#[test]
fn request_draw_at_sell_out_before_close() {
    let mut p = demo_params(CLOSE);
    p.ticket_cap = 30;
    let (mut env, draw) = Env::with_draw(p);
    let alice = env.user(10);
    env.buy(&draw, &alice, 25).unwrap();
    let (ix, _) = env.ix_request_draw(&draw);
    let c = env.cranker.insecure_clone();
    expect_err(env.send(&[ix], &[&c]), &code("SalesStillOpen"));
    env.buy(&draw, &alice, 5).unwrap();
    env.request_draw(&draw).unwrap();
    assert_eq!(env.draw(&draw).status, DrawStatus::Drawing);
}

#[test]
fn request_draw_with_no_tickets_cancels_and_refunds_authority() {
    let (mut env, draw) = demo();
    let vault = vault_pda(&draw);
    env.set_time(CLOSE);
    let admin_before = env.balance(&env.admin.pubkey());
    let req = env.request_draw(&draw).unwrap();
    assert_eq!(env.balance(&req), 0, "no ORAO request when nobody entered");
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Cancelled);
    assert!(d.prize_paid && d.reserve_withdrawn);
    assert_eq!(env.balance(&env.admin.pubkey()) - admin_before, 3 * SOL, "prize + reserve back to authority");
    assert_eq!(env.balance(&vault), env.vault_rent());
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
}

/// Buys for several players, closes, requests and fulfils the draw randomness.
/// Returns (env, draw, entries in order, randomness).
fn drawn(rnd: [u8; 64]) -> (Env, Pubkey, Vec<(Pubkey, Keypair)>) {
    let (mut env, draw) = demo();
    let mut entries = Vec::new();
    for q in [7u16, 1, 12, 5] {
        let k = env.user(10);
        let (e, _) = env.buy(&draw, &k, q).unwrap();
        entries.push((e, k));
    }
    let k = env.user(1);
    let e = env.claim_free(&draw, &k).unwrap();
    entries.push((e, k));
    env.set_time(CLOSE + 1);
    let req = env.request_draw(&draw).unwrap();
    env.fulfill(&req, rnd);
    (env, draw, entries)
}

#[test]
fn settle_pays_winner_of_recomputed_ticket() {
    let rnd = [0x42u8; 64];
    let (mut env, draw) = {
        let (env, draw, _) = drawn(rnd);
        (env, draw)
    };
    let d = env.draw(&draw);
    let w = drawsol::fairness::winning_ticket(&rnd, d.next_ticket);
    let entries: Vec<Pubkey> = (0..d.entry_count).map(|s| entry_pda(&draw, s)).collect();
    let win = *entries.iter().find(|e| env.entry(e).contains(w)).unwrap();
    let lose = *entries.iter().find(|e| !env.entry(e).contains(w)).unwrap();
    let winner = env.entry(&win).owner;

    // wrong entry of this draw
    expect_err(env.settle(&draw, &lose), &code("WrongWinningEntry"));
    // right entry, wrong recipient
    let ix = env.ix_settle(&draw, &win, &env.entry(&lose).owner);
    let c = env.cranker.insecure_clone();
    expect_err(env.send(&[ix], &[&c]), "ConstraintAddress");
    // entry from another draw
    let d1 = env.create_draw(demo_params(CLOSE + DAY)).unwrap();
    let other = env.user(10);
    let (e_other, _) = env.buy(&d1, &other, 25).unwrap();
    let ix = env.ix_settle(&draw, &e_other, &other.pubkey());
    expect_err(env.send(&[ix], &[&c]), "ConstraintSeeds");

    let (w0, v0) = (env.balance(&winner), env.balance(&vault_pda(&draw)));
    env.settle(&draw, &win).unwrap();
    assert_eq!(env.balance(&winner) - w0, SOL, "winner receives the prize");
    assert_eq!(v0 - env.balance(&vault_pda(&draw)), SOL);
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Settled);
    assert_eq!(d.winning_ticket, w);
    assert_eq!(d.winning_entry, win);
    assert_eq!(d.winner, winner);
    assert_eq!(d.randomness, rnd);
    assert!(d.prize_paid);
    assert_eq!(d.settled_at, CLOSE + 1);
    expect_err(env.settle(&draw, &win), &code("WrongStatus"));
}

#[test]
fn settle_before_fulfilment_and_with_wrong_request_fails() {
    let (mut env, draw) = demo();
    let alice = env.user(10);
    let (ea, req_a) = env.buy(&draw, &alice, 3).unwrap();
    env.fulfill(&req_a, [8u8; 64]);
    // not Drawing yet
    expect_err(env.settle(&draw, &ea), &code("WrongStatus"));
    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    expect_err(env.settle(&draw, &ea), &code("VrfNotFulfilled"));
    // a different (fulfilled) ORAO request
    let mut ix = env.ix_settle(&draw, &ea, &alice.pubkey());
    ix.accounts[2].pubkey = req_a;
    let c = env.cranker.insecure_clone();
    expect_err(env.send(&[ix], &[&c]), &code("VrfWrongAccount"));
}

#[test]
fn free_ticket_can_win() {
    // Only a free entry: the draw still runs, and the free ticket (#0) must win.
    let (mut env, draw) = demo();
    let k = env.user(1);
    let e = env.claim_free(&draw, &k).unwrap();
    env.set_time(CLOSE);
    let req = env.request_draw(&draw).unwrap();
    env.fulfill(&req, [1u8; 64]);
    let b0 = env.balance(&k.pubkey());
    env.settle(&draw, &e).unwrap();
    assert_eq!(env.balance(&k.pubkey()) - b0, SOL);
}

// ====================================================================== cancel / refund

#[test]
fn cancel_only_after_grace_then_refunds() {
    let (mut env, draw) = demo();
    let vault = vault_pda(&draw);
    let alice = env.user(10);
    let bob = env.user(10);
    let carol = env.user(1);
    let (ea, _) = env.buy(&draw, &alice, 3).unwrap();
    let (eb, _) = env.buy(&draw, &bob, 2).unwrap();
    let ec = env.claim_free(&draw, &carol).unwrap();

    expect_err(env.cancel(&draw), &code("WrongStatus")); // Open
    expect_err(env.refund(&draw, &ea), &code("WrongStatus"));
    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    env.set_time(CLOSE + 48 * HOUR);
    expect_err(env.cancel(&draw), &code("NotCancellable"));
    env.set_time(CLOSE + 48 * HOUR + 1);
    env.cancel(&draw).unwrap();
    assert_eq!(env.draw(&draw).status, DrawStatus::Cancelled);
    expect_err(env.cancel(&draw), &code("WrongStatus"));

    // refunds go to the owner, once
    let a0 = env.balance(&alice.pubkey());
    env.refund(&draw, &ea).unwrap();
    assert_eq!(env.balance(&alice.pubkey()) - a0, 3 * SOL / 100);
    assert!(env.entry(&ea).refunded);
    expect_err(env.refund(&draw, &ea), &code("AlreadyRefunded"));
    expect_err(env.refund(&draw, &ec), &code("FreeEntryNoReveal"));
    assert_eq!(env.draw(&draw).refunded_lamports, 3 * SOL / 100);

    // withdraw while refunds are outstanding: prize only (reserve still locked: nothing revealed,
    // < 7 days), never the refund liability.
    let got = env.withdraw(&draw).unwrap();
    assert_eq!(got, SOL);
    assert_eq!(env.balance(&vault), env.vault_rent() + 2 * SOL + 2 * SOL / 100);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));

    // after the reserve unlock: reserve leftovers, still not the refund liability
    env.set_time(CLOSE + 7 * DAY + 1);
    assert_eq!(env.withdraw(&draw).unwrap(), 2 * SOL);
    assert_eq!(env.balance(&vault), env.vault_rent() + 2 * SOL / 100);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));

    let b0 = env.balance(&bob.pubkey());
    env.refund(&draw, &eb).unwrap();
    assert_eq!(env.balance(&bob.pubkey()) - b0, 2 * SOL / 100);
    assert_eq!(env.balance(&vault), env.vault_rent(), "vault drained to exactly rent");
}

#[test]
fn reveal_still_works_after_cancel_until_reserve_withdrawn() {
    let (mut env, draw) = demo();
    let alice = env.user(10);
    let (ea, req) = env.buy(&draw, &alice, 10).unwrap();
    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    env.set_time(CLOSE + 49 * HOUR);
    env.cancel(&draw).unwrap();
    let (d, e) = (env.draw(&draw), env.entry(&ea));
    let rnd = find_randomness(&d, &e, |t| t > 0);
    let (_, total) = expected_reveal(&rnd, &d, &e);
    env.fulfill(&req, rnd);
    env.reveal(&draw, &ea).unwrap();
    // all paid entries revealed -> reserve leftovers + prize withdrawable
    assert_eq!(env.withdraw(&draw).unwrap(), SOL + 2 * SOL - total);
    // refund still available afterwards
    env.refund(&draw, &ea).unwrap();
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
}

// ====================================================================== withdraw

#[test]
fn withdraw_rules_after_settlement() {
    let (mut env, draw) = demo();
    let vault = vault_pda(&draw);
    let alice = env.user(10);
    let bob = env.user(10);
    let (ea, req_a) = env.buy(&draw, &alice, 10).unwrap();
    let (eb, req_b) = env.buy(&draw, &bob, 10).unwrap();

    expect_err(env.withdraw(&draw), &code("NothingToWithdraw")); // Open
    let mallory = env.user(1);
    let ix = env.ix_withdraw(&draw, &mallory.pubkey());
    expect_err(env.send(&[ix], &[&mallory]), &code("Unauthorized"));

    // reveal Alice only
    let (d, e) = (env.draw(&draw), env.entry(&ea));
    let rnd_a = find_randomness(&d, &e, |t| t > 0);
    let (_, won_a) = expected_reveal(&rnd_a, &d, &e);
    env.fulfill(&req_a, rnd_a);
    env.reveal(&draw, &ea).unwrap();

    env.set_time(CLOSE);
    let req = env.request_draw(&draw).unwrap();
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw")); // Drawing
    let rnd = [0x11u8; 64];
    env.fulfill(&req, rnd);
    let w = drawsol::fairness::winning_ticket(&rnd, 20);
    let win = if env.entry(&ea).contains(w) { ea } else { eb };
    env.settle(&draw, &win).unwrap();

    // Settled with one unrevealed entry: proceeds only.
    assert_eq!(env.withdraw(&draw).unwrap(), 20 * SOL / 100);
    let d = env.draw(&draw);
    assert!(d.proceeds_withdrawn && !d.reserve_withdrawn);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));

    // Bob reveals -> all revealed -> reserve leftovers.
    let (d, e) = (env.draw(&draw), env.entry(&eb));
    let rnd_b = find_randomness(&d, &e, |_| true);
    let (_, won_b) = expected_reveal(&rnd_b, &d, &e);
    env.fulfill(&req_b, rnd_b);
    env.reveal(&draw, &eb).unwrap();
    assert_eq!(env.withdraw(&draw).unwrap(), 2 * SOL - won_a - won_b);
    assert!(env.draw(&draw).reserve_withdrawn);
    assert_eq!(env.balance(&vault), env.vault_rent(), "everything accounted for");
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
}

#[test]
fn reserve_unlocks_after_seven_days_even_if_unrevealed() {
    let (mut env, draw) = demo();
    let alice = env.user(10);
    let (ea, req_a) = env.buy(&draw, &alice, 4).unwrap();
    env.set_time(CLOSE);
    let req = env.request_draw(&draw).unwrap();
    env.fulfill(&req, [9u8; 64]);
    env.settle(&draw, &ea).unwrap();
    assert_eq!(env.withdraw(&draw).unwrap(), 4 * SOL / 100); // proceeds only
    env.set_time(CLOSE + 7 * DAY);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
    env.set_time(CLOSE + 7 * DAY + 1);
    assert_eq!(env.withdraw(&draw).unwrap(), 2 * SOL);
    // the reserve is gone, so late reveals are refused
    env.fulfill(&req_a, [2u8; 64]);
    expect_err(env.reveal(&draw, &ea), &code("WrongStatus"));
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
}
