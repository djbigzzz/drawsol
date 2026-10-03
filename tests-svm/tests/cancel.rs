//! VRF-timeout cancellation: refunds net of instant prizes, escrow back through withdraw, shortfall handling.
mod common;

use common::*;
use drawsol::state::DrawStatus;
use solana_signer::Signer;

#[test]
fn timeout_cancel_refunds_net_of_instants_and_returns_the_escrow_once() {
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let (alice, bob, carol) = (env.user(10), env.user(10), env.user(10));
    let a = env.buy(&draw, &alice, 40).unwrap();
    let b = env.buy(&draw, &bob, 7).unwrap();
    let f = env.claim_free(&draw, &carol).unwrap();
    // Alice won instant prizes; Bob and Carol never revealed.
    let rnd = env.find_rnd(&draw, &a.entry, |_, _, o| o > 0 && o < 40 * CENT);
    let (_, _, won_a) = env.expected(&draw, &a.entry, &rnd);
    env.fulfill_and_reveal(&draw, &a, rnd);

    expect_err(env.cancel(&draw), &code("WrongStatus")); // Open
    expect_err(env.refund(&draw, &a.entry), &code("WrongStatus"));
    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    env.set_time(CLOSE + 48 * HOUR);
    expect_err(env.cancel(&draw), &code("NotCancellable"));
    env.set_time(CLOSE + 48 * HOUR + 1);
    env.cancel(&draw).unwrap(); // anyone
    assert_eq!(env.draw(&draw).status, DrawStatus::Cancelled);
    expect_err(env.cancel(&draw), &code("WrongStatus"));

    // no new instant payouts once refunds are open
    env.fulfill(&b.req, [0x31; 64]);
    expect_err(env.reveal(&draw, &b.entry), &code("WrongStatus"));

    // escrow back: end prize + the whole schedule total, once (refunds are net of the instants paid)
    let vault0 = env.vault_free(&draw);
    assert_eq!(vault0, 47 * CENT + 100 * CENT - won_a);
    assert_eq!(env.withdraw(&draw).unwrap(), 100 * CENT);
    let d = env.draw(&draw);
    assert!(d.escrow_returned && d.instant_escrow_returned);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));

    assert_eq!(env.refund(&draw, &a.entry).unwrap(), 40 * CENT - won_a, "paid minus instant prizes");
    expect_err(env.refund(&draw, &a.entry), &code("AlreadyRefunded"));
    assert_eq!(env.refund(&draw, &b.entry).unwrap(), 7 * CENT);
    expect_err(env.refund(&draw, &f.entry), &code("NothingToRefund"));
    assert_eq!(env.draw(&draw).refunded_lamports, 47 * CENT - won_a);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent(), "vault drained to exactly rent");
    // the refund always goes to the owner
    let mut ix = env.ix_refund(&draw, &f.entry);
    ix.accounts[3].pubkey = env.cranker.pubkey();
    expect_err(env.crank(ix), "ConstraintHasOne");
}

#[test]
fn refund_shortfall_from_free_entry_wins_is_reported_not_taken_from_others() {
    // A free entry wins an instant prize, then the draw is cancelled: the refunds owed exceed the
    // vault (after the escrow left) by exactly that win. The last refund fails until topped up.
    let (mut env, draw) = Env::with_draw(params(CLOSE));
    let (alice, dave) = (env.user(10), env.user(10));
    let a = env.buy(&draw, &alice, 25).unwrap();
    let f = env.claim_free(&draw, &dave).unwrap();
    let rnd = env.find_rnd(&draw, &f.entry, |_, _, o| o > 0);
    let (_, _, won) = env.expected(&draw, &f.entry, &rnd);
    env.fulfill_and_reveal(&draw, &f, rnd);

    env.set_time(CLOSE);
    env.request_draw(&draw).unwrap();
    env.set_time(CLOSE + 49 * HOUR);
    env.cancel(&draw).unwrap();
    assert_eq!(env.withdraw(&draw).unwrap(), 100 * CENT);
    expect_err(env.refund(&draw, &f.entry), &code("NothingToRefund"));
    expect_err(env.refund(&draw, &a.entry), &code("VaultShortfall"));
    let admin = env.admin.insecure_clone();
    env.transfer(&admin, &vault_pda(&draw), won); // operator tops up
    assert_eq!(env.refund(&draw, &a.entry).unwrap(), 25 * CENT);
    assert_eq!(env.balance(&vault_pda(&draw)), env.vault_rent());
}
