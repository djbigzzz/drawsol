//! Headline draws: fixed escrowed prize, no instant wins, min_tickets cancellation with full refunds.
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use drawsol::state::DrawStatus;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn weekly() -> (Env, Pubkey) {
    Env::with_headline(headline_params(CLOSE))
}

/// Buys `paid` paid tickets spread over fresh wallets (≤ 25 each). Returns (entry, buyer, tickets).
fn sell(env: &mut Env, draw: &Pubkey, mut paid: u32) -> Vec<(Pubkey, Keypair, u64)> {
    let mut out = Vec::new();
    while paid > 0 {
        let q = paid.min(25);
        let k = env.user(5);
        let b = env.buy(draw, &k, q as u16).unwrap();
        out.push((b.entry, k, q as u64));
        paid -= q;
    }
    out
}

#[test]
fn headline_entries_have_no_roll() {
    let (mut env, draw) = weekly();
    let alice = env.user(10);
    let t0 = env.balance(&env.treasury);
    let (ix, entry, req) = env.ix_buy(&draw, &alice.pubkey(), 25, 0);
    assert!(req.is_none());
    let ok = env.send(&[ix], &[&alice]).unwrap();
    println!("buy_tickets(25) headline: {} CU", ok.cu);
    let f = env.claim_free(&draw, &alice).unwrap();
    assert!(f.req.is_none());
    assert_eq!(env.balance(&env.treasury), t0, "no ORAO request, no ORAO fee");

    for e in [entry, f.entry] {
        let e = env.entry(&e);
        assert!(!e.needs_reveal && !e.revealed);
        assert_eq!((e.vrf_request, e.pool_snapshot), (Pubkey::default(), 0));
    }
    let d = env.draw(&draw);
    assert_eq!(d.revenue_lamports, 25 * CENT);
    assert_eq!((d.house_lamports, d.pot_lamports, d.instant_pool_lamports, d.rolled_entries), (0, 0, 0, 0));
    assert_eq!((d.paid_tickets, d.free_tickets, d.next_ticket), (25, 1, 26));
    assert_eq!(env.vault_free(&draw), SOL + 25 * CENT);
    expect_err(env.reveal(&draw, &entry), &code("NoInstantRoll"));
    expect_err(env.reveal(&draw, &f.entry), &code("NoInstantRoll"));
}

#[test]
fn headline_undersold_cancels_with_full_refunds_and_prize_back() {
    let (mut env, draw) = weekly();
    let buyers = sell(&mut env, &draw, 119); // min is 120
    let freebie = env.user(1);
    let f = env.claim_free(&draw, &freebie).unwrap();
    let cred = env.user(1);
    env.grant_credits(&cred, 3);
    let c = env.buy_credits(&draw, &cred, 3, 3).unwrap(); // credit tickets never count towards min_tickets
    let d = env.draw(&draw);
    assert_eq!((d.paid_tickets, d.next_ticket), (119, 123));

    env.set_time(CLOSE);
    let admin = env.admin.pubkey();
    let a0 = env.balance(&admin);
    // no ORAO accounts needed to cancel
    let k = env.keeper.insecure_clone();
    let ix = env.ix_request_draw_raw(&draw, &k.pubkey(), [0u8; 16], None);
    let ok = env.send(&[ix], &[&k]).unwrap();
    assert!(ok.logs.iter().any(|l| l.contains("Program data:")), "DrawCancelled emitted");
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Cancelled);
    assert!(d.prize_paid);
    assert_eq!(env.balance(&admin) - a0, SOL, "prize straight back to the authority");
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));

    for (entry, k, q) in &buyers {
        let b0 = env.balance(&k.pubkey());
        assert_eq!(env.refund(&draw, entry).unwrap(), q * CENT, "full refund");
        assert_eq!(env.balance(&k.pubkey()) - b0, q * CENT);
        expect_err(env.refund(&draw, entry), &code("AlreadyRefunded"));
    }
    expect_err(env.refund(&draw, &f.entry), &code("NothingToRefund"));
    assert_eq!(env.profile(&cred.pubkey()).credits, 0);
    assert_eq!(env.refund(&draw, &c.entry).unwrap(), 0);
    assert_eq!(env.profile(&cred.pubkey()).credits, 3, "spent credits come back");
    assert_eq!(env.draw(&draw).refunded_lamports, 119 * CENT);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
}

#[test]
fn headline_at_min_tickets_draws_and_house_takes_the_revenue() {
    let (mut env, draw) = weekly();
    sell(&mut env, &draw, 120);
    env.set_time(CLOSE);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
    env.request_draw(&draw).unwrap();
    assert_eq!(env.draw(&draw).status, DrawStatus::Drawing);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));

    let rnd = [0x24u8; 64];
    let w = drawsol::fairness::winning_ticket(&rnd, 120);
    let winner = env.entry(&env.entry_holding(&draw, w)).owner;
    let w0 = env.balance(&winner);
    env.fulfill_and_settle(&draw, rnd);
    assert_eq!(env.balance(&winner) - w0, SOL);
    let d = env.draw(&draw);
    assert_eq!((d.status, d.prize_paid_lamports, d.house_lamports), (DrawStatus::Settled, SOL, 120 * CENT));
    // ≥ floor margin at the minimum: revenue ≥ prize × 1.2
    assert!(d.revenue_lamports * 10_000 >= SOL * 12_000);
    assert_eq!(env.withdraw(&draw).unwrap(), 120 * CENT);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
}

#[test]
fn headline_randomness_timeout_returns_prize_once_and_refunds_in_full() {
    let (mut env, draw) = weekly();
    let buyers = sell(&mut env, &draw, 130);
    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    env.set_time(CLOSE + 48 * HOUR + 1);
    env.cancel(&draw).unwrap();
    assert_eq!(env.withdraw(&draw).unwrap(), SOL, "escrow back once");
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
    for (entry, _, q) in &buyers {
        assert_eq!(env.refund(&draw, entry).unwrap(), q * CENT);
    }
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
}

#[test]
fn headline_with_no_tickets_returns_the_prize() {
    let (mut env, draw) = weekly();
    env.set_time(CLOSE);
    let a0 = env.balance(&env.admin.pubkey());
    let k = env.keeper.insecure_clone();
    let ix = env.ix_request_draw_raw(&draw, &k.pubkey(), [0u8; 16], None);
    env.send(&[ix], &[&k]).unwrap();
    assert_eq!(env.draw(&draw).status, DrawStatus::Cancelled);
    assert_eq!(env.balance(&env.admin.pubkey()) - a0, SOL);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
}
