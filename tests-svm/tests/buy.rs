//! buy_tickets / claim_free_entry: bookkeeping, caps (1000 per tx, wallet cap, sell-out), free entries, ORAO checks.
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use drawsol::state::EntryV4;
use solana_signer::Signer;

#[test]
fn buy_happy_path() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let alice = env.user(10);
    let bob = env.user(10);
    let t0 = env.balance(&env.treasury);
    let v0 = env.vault_free(&draw);

    let (ix, ea, req) = env.ix_buy(&draw, &alice.pubkey(), 5);
    let ok = env.send(&[ix], &[&alice]).unwrap();
    println!("buy_tickets(5): {} CU", ok.cu);
    let eb = env.buy(&draw, &bob, 3).unwrap().entry;

    let a = env.entry(&ea);
    assert_eq!((a.draw, a.owner, a.seq, a.first_pos, a.count, a.is_free), (draw, alice.pubkey(), 0, 0, 5, false));
    assert_eq!((a.paid_lamports, a.created_at), (5 * CENT, T0));
    assert!(!a.revealed && !a.refunded);
    assert!(a.tickets.is_empty() && a.prizes.is_empty(), "no numbers before the reveal");
    assert_eq!((a.instant_paid, a.vrf_request), (0, req));
    assert_eq!(env.svm.get_account(&ea).unwrap().data.len(), EntryV4::space(5));
    let b = env.entry(&eb);
    assert_eq!((b.seq, b.first_pos, b.count), (1, 5, 3));

    let d = env.draw(&draw);
    assert_eq!((d.paid_tickets, d.free_tickets, d.next_pos, d.assigned, d.entry_count, d.revealed_entries), (8, 0, 8, 0, 2, 0));
    assert_eq!(d.revenue, 8 * CENT);
    assert_eq!(env.vault_free(&draw) - v0, 8 * CENT, "every lamport paid is in the vault");

    let p = env.player(&draw, &alice.pubkey());
    assert_eq!((p.draw, p.wallet, p.tickets, p.paid, p.won_lamports, p.free_claimed), (draw, alice.pubkey(), 5, 5 * CENT, 0, false));
    let pr = env.profile(&alice.pubkey());
    assert_eq!((pr.wallet, pr.period_spent, pr.period_start), (alice.pubkey(), 5 * CENT, T0));

    // ORAO request for the program-derived seed, client = buyer, pending; buyer paid the fee.
    let acc = env.svm.get_account(&req).unwrap();
    assert_eq!(acc.owner, orao_solana_vrf::ID);
    assert_eq!(acc.data[8], 0, "pending");
    assert_eq!(&acc.data[9..41], alice.pubkey().as_ref());
    assert_eq!(&acc.data[41..73], &a.vrf_seed);
    assert_eq!(env.balance(&env.treasury), t0 + 2 * env.request_fee);
}

#[test]
fn per_tx_cap_1000_ok_1001_fails() {
    let (mut env, draw) = Env::with_draw(big_params(CLOSE, 2000));
    let alice = env.user(30);
    for q in [1001u16, 5000, 0] {
        let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), q);
        expect_err(env.send(&[ix], &[&alice]), &code("ExceedsPerTx"));
    }
    let (ix, entry, _) = env.ix_buy(&draw, &alice.pubkey(), 1000);
    let ok = env.send(&[ix], &[&alice]).unwrap();
    println!("buy_tickets(1000): {} CU", ok.cu);
    let e = env.entry(&entry);
    assert_eq!((e.count, e.first_pos, e.paid_lamports), (1000, 0, 1000 * CENT));
    assert_eq!(env.svm.get_account(&entry).unwrap().data.len(), EntryV4::space(1000));
    assert!(EntryV4::space(1000) < 10_240, "a 1000-ticket entry fits one allocation");
}

#[test]
fn wallet_cap_and_sell_out() {
    // cap 300, 100 per tx, 200 per wallet
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let (alice, bob, carol) = (env.user(10), env.user(10), env.user(10));
    env.buy(&draw, &alice, 100).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 101);
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsPerTx"));
    env.buy(&draw, &alice, 100).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsWalletCap"));
    let (ix, _, _) = env.ix_claim_free(&draw, &alice.pubkey());
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsWalletCap"));

    env.buy(&draw, &bob, 99).unwrap();
    let (ix, _, _) = env.ix_buy(&draw, &bob.pubkey(), 2);
    expect_err(env.send(&[ix], &[&bob]), &code("SoldOut"));
    env.claim_free(&draw, &carol).unwrap(); // the free ticket takes the last number
    let d = env.draw(&draw);
    assert_eq!((d.paid_tickets, d.free_tickets, d.next_pos), (299, 1, 300));
    assert!(d.sold_out());
    let (ix, _, _) = env.ix_buy(&draw, &bob.pubkey(), 1);
    expect_err(env.send(&[ix], &[&bob]), &code("SoldOut"));
    let (ix, _, _) = env.ix_claim_free(&draw, &bob.pubkey());
    expect_err(env.send(&[ix], &[&bob]), &code("SoldOut"));
    // sold out, but the draw still waits for draw_at
    expect_err(env.request_draw(&draw), &code("DrawNotDue"));
}

#[test]
fn free_entries_are_real_tickets() {
    let mut p = params(CLOSE);
    p.free_cap = 2;
    p.max_per_wallet = 3;
    let (mut env, draw) = Env::with_draw(p);
    let (alice, bob, carol) = (env.user(10), env.user(10), env.user(10));
    env.buy(&draw, &alice, 2).unwrap();
    let v0 = env.vault_free(&draw);
    let f = env.claim_free(&draw, &alice).unwrap();
    let e = env.entry(&f.entry);
    assert_eq!((e.seq, e.first_pos, e.count, e.is_free, e.paid_lamports), (1, 2, 1, true, 0));
    assert_eq!(e.vrf_request, f.req, "a free ticket rolls like any other");
    assert_eq!(env.vault_free(&draw), v0, "nothing paid");
    assert!(env.player(&draw, &alice.pubkey()).free_claimed);
    assert_eq!(env.player(&draw, &alice.pubkey()).tickets, 3);
    assert_eq!(env.profile(&alice.pubkey()).period_spent, 2 * CENT, "free entries never count as spending");

    let (ix, _, _) = env.ix_claim_free(&draw, &alice.pubkey());
    expect_err(env.send(&[ix], &[&alice]), &code("FreeAlreadyClaimed"));
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    expect_err(env.send(&[ix], &[&alice]), &code("ExceedsWalletCap"));
    env.claim_free(&draw, &bob).unwrap();
    let (ix, _, _) = env.ix_claim_free(&draw, &carol.pubkey());
    expect_err(env.send(&[ix], &[&carol]), &code("FreeCapReached"));
    let d = env.draw(&draw);
    assert_eq!((d.paid_tickets, d.free_tickets, d.next_pos, d.entry_count, d.revenue), (2, 2, 4, 3, 2 * CENT));
}

#[test]
fn buy_rejects_bad_orao_accounts() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let alice = env.user(10);
    // a request PDA for a seed the program did not derive
    let seed = drawsol::fairness::entry_vrf_seed(&draw, &alice.pubkey(), 0, &[9u8; 16]);
    let wrong = drawsol::fairness::vrf_request_address(&seed);
    let ix = env.ix_buy_raw(&draw, &alice.pubkey(), 0, 1, [1u8; 16], wrong);
    expect_err(env.send(&[ix], &[&alice]), &code("VrfWrongAccount"));
    // the v3 seed domain is not accepted any more
    let v3 = drawsol::fairness::entry_vrf_seed_v3(&draw, &alice.pubkey(), 0, &[1u8; 16]);
    let ix = env.ix_buy_raw(&draw, &alice.pubkey(), 0, 1, [1u8; 16], drawsol::fairness::vrf_request_address(&v3));
    expect_err(env.send(&[ix], &[&alice]), &code("VrfWrongAccount"));
    // right request, wrong treasury
    let (mut ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    ix.accounts[8].pubkey = Pubkey::new_unique();
    expect_err(env.send(&[ix], &[&alice]), &code("VrfWrongAccount"));
    env.buy(&draw, &alice, 1).unwrap();
}

#[test]
fn sales_close_at_closes_at() {
    let mut p = params(CLOSE);
    p.draw_at = CLOSE + HOUR;
    let (mut env, draw) = Env::with_draw(p);
    let alice = env.user(10);
    env.set_time(CLOSE - 1);
    env.buy(&draw, &alice, 1).unwrap();
    env.set_time(CLOSE);
    let (ix, _, _) = env.ix_buy(&draw, &alice.pubkey(), 1);
    expect_err(env.send(&[ix], &[&alice]), &code("SalesClosed"));
    let (ix, _, _) = env.ix_claim_free(&draw, &alice.pubkey());
    expect_err(env.send(&[ix], &[&alice]), &code("SalesClosed"));
    expect_err(env.request_draw(&draw), &code("DrawNotDue"));
    env.set_time(CLOSE + HOUR);
    env.request_draw(&draw).unwrap();
}
