//! Draft phase: init_pool chunks and account growth, set_schedule rules, open_draw escrow + hash, draft cancel.
mod common;

use anchor_lang::Discriminator;
use common::*;
use drawsol::constants::*;
use drawsol::instructions::ScheduleEntry;
use drawsol::state::DrawStatus;
use solana_signer::Signer;

#[test]
fn init_pool_chunks_are_sequential_bounded_and_grow_both_accounts() {
    let mut env = Env::new();
    // cap 12 000: pool 48 KB (6 chunks), schedule 12 KB (starts at 10 KB, grown by init_pool)
    let mut p = params(CLOSE);
    p.ticket_cap = 12_000;
    p.min_tickets = 8_000;
    p.end_prize_lamports = 8_000 * CENT * 35 / 100;
    let draw = env.create(p.clone()).unwrap();
    assert_eq!(env.svm.get_account(&schedule_pda(&draw)).unwrap().data.len(), 10_240);

    expect_err(env.init_pool(&draw, 0, 2001), &code("BadPoolChunk"));
    expect_err(env.init_pool(&draw, 0, 0), &code("BadPoolChunk"));
    expect_err(env.init_pool(&draw, 5, 2000), &code("BadPoolChunk"));
    expect_err(env.init_pool(&draw, 0, 12_001), &code("BadPoolChunk"));
    let mallory = env.user(10);
    expect_err(env.init_pool_as(&mallory, &draw, 0, 2000), &code("Unauthorized"));

    let ok = env.init_pool(&draw, 0, 2000).unwrap();
    println!("init_pool(2000): {} CU", ok.cu);
    let (rem, nums) = env.pool(&draw);
    assert_eq!(rem, 2000);
    assert_eq!(nums, (0..2000).collect::<Vec<u32>>());
    assert_eq!(env.svm.get_account(&pool_pda(&draw)).unwrap().data.len(), 12 + 4 * 2000);
    expect_err(env.init_pool(&draw, 0, 2000), &code("BadPoolChunk")); // not sequential
    expect_err(env.open(&draw), &code("PoolIncomplete"));
    // a schedule number beyond the current schedule size: the pool has not reached it yet
    let far = [ScheduleEntry { ticket: 11_999, tier: 2 }];
    expect_err(env.set_schedule(&draw, &far), &code("PoolIncomplete"));
    // a number inside the already allocated schedule bytes is fine even before the pool reaches it
    env.set_schedule(&draw, &[ScheduleEntry { ticket: 10_000, tier: 2 }]).unwrap();

    // keeper may fill too; chunks of any size ≤ 2000
    let keeper = env.keeper.insecure_clone();
    env.init_pool_as(&keeper, &draw, 2000, 2500).unwrap();
    env.init_pool(&draw, 2500, 4500).unwrap();
    for from in (4500..12_000).step_by(2000) {
        env.init_pool(&draw, from, (from + 2000).min(12_000)).unwrap();
    }
    let (rem, nums) = env.pool(&draw);
    assert_eq!(rem, 12_000);
    assert_eq!(nums, (0..12_000).collect::<Vec<u32>>());
    assert_eq!(env.svm.get_account(&pool_pda(&draw)).unwrap().data.len(), 12 + 4 * 12_000);
    let sched = env.svm.get_account(&schedule_pda(&draw)).unwrap();
    assert_eq!(sched.data.len(), 8 + 12_000);
    assert!(sched.lamports >= env.rent(sched.data.len()), "schedule rent-exempt after growth");
    assert!(env.balance(&pool_pda(&draw)) >= env.rent(12 + 4 * 12_000), "pool rent-exempt after growth");
    assert_eq!(&sched.data[..8], drawsol::state::Schedule::DISCRIMINATOR);
    assert_eq!(sched.data[8 + 10_000], 3, "earlier schedule byte survived the realloc");
    expect_err(env.init_pool(&draw, 12_000, 12_001), &code("BadPoolChunk"));
    env.set_schedule(&draw, &far).unwrap();
}

#[test]
fn schedule_rules_duplicates_counts_tiers_and_batches() {
    let mut env = Env::new();
    let p = params(CLOSE);
    let draw = env.create(p.clone()).unwrap();
    env.init_pool_all(&draw).unwrap();
    let e = |ticket: u32, tier: u8| ScheduleEntry { ticket, tier };

    let mallory = env.user(1);
    expect_err(env.set_schedule_as(&mallory, &draw, &[e(1, 0)]), &code("Unauthorized"));
    expect_err(env.set_schedule(&draw, &[]), &code("BadScheduleBatch"));
    let too_many: Vec<ScheduleEntry> = (0..301).map(|t| e(t, 2)).collect();
    expect_err(env.set_schedule(&draw, &too_many), &code("BadScheduleBatch"));
    expect_err(env.set_schedule(&draw, &[e(300, 0)]), &code("InvalidParams")); // ticket ≥ cap
    expect_err(env.set_schedule(&draw, &[e(1, 8)]), &code("InvalidParams")); // tier index out of range
    expect_err(env.set_schedule(&draw, &[e(1, 3)]), &code("InvalidParams")); // unused tier
    expect_err(env.set_schedule(&draw, &[e(1, 0), e(1, 1)]), &code("DuplicateScheduleTicket"));
    expect_err(env.set_schedule(&draw, &[e(1, 0), e(2, 0)]), &code("TierFull")); // tier 0 has count 1
    // a failed batch leaves nothing behind
    assert_eq!(env.schedule(&draw), vec![0u8; 300]);
    assert_eq!(env.draw(&draw).schedule_set, 0);

    env.set_schedule(&draw, &[e(7, 0), e(10, 1), e(20, 1)]).unwrap();
    expect_err(env.set_schedule(&draw, &[e(10, 2)]), &code("DuplicateScheduleTicket"));
    expect_err(env.set_schedule(&draw, &[e(8, 0)]), &code("TierFull"));
    let d = env.draw(&draw);
    assert_eq!((d.tiers[0].set, d.tiers[1].set, d.tiers[2].set, d.schedule_set), (1, 2, 0, 3));
    let s = env.schedule(&draw);
    assert_eq!((s[7], s[10], s[20]), (1, 2, 2));
    expect_err(env.open(&draw), &code("ScheduleIncomplete"));

    env.set_schedule(&draw, &[e(30, 1), e(40, 1), e(50, 1)]).unwrap();
    let rest: Vec<ScheduleEntry> = (100..120).map(|t| e(t, 2)).collect();
    expect_err(env.set_schedule(&draw, &[rest.as_slice(), &[e(120, 2)]].concat()), &code("TierFull"));
    expect_err(env.open(&draw), &code("ScheduleIncomplete"));
    env.set_schedule(&draw, &rest).unwrap();
    let d = env.draw(&draw);
    assert_eq!(d.schedule_set, 26);
    assert!(d.tiers.iter().all(|t| t.set == t.count));
    env.open(&draw).unwrap();
    assert_eq!(env.draw(&draw).status, DrawStatus::Open);
    // frozen once open
    expect_err(env.set_schedule(&draw, &[e(121, 2)]), &code("WrongStatus"));
    expect_err(env.init_pool(&draw, 0, 1), &code("WrongStatus"));
    expect_err(env.open(&draw), &code("WrongStatus"));
}

#[test]
fn open_escrows_prizes_and_publishes_the_schedule_hash() {
    let mut env = Env::new();
    let p = params(CLOSE);
    let draw = env.create(p.clone()).unwrap();
    env.init_pool_all(&draw).unwrap();
    env.set_schedule_all(&draw, &default_schedule(&p)).unwrap();
    let keeper = env.keeper.insecure_clone();
    expect_err(env.open_as(&keeper, &draw), &code("Unauthorized"));

    let a0 = env.balance(&env.admin.pubkey());
    let ok = env.open(&draw).unwrap();
    let escrow = 70 * CENT + 30 * CENT;
    assert_eq!(env.vault_free(&draw), escrow, "end prize + schedule total");
    let spent = a0 - env.balance(&env.admin.pubkey());
    assert!(spent >= escrow && spent < escrow + CENT, "authority paid the escrow (+ fee): {spent}");

    // DrawOpened { draw, schedule_hash, escrow_lamports }
    let ev = ok
        .logs
        .iter()
        .filter_map(|l| l.strip_prefix("Program data: "))
        .map(base64_decode)
        .find(|b| b.starts_with(drawsol::events::DrawOpened::DISCRIMINATOR))
        .expect("DrawOpened emitted");
    assert_eq!(&ev[8..40], draw.as_ref());
    assert_eq!(ev[40..72], env.schedule_hash(&draw), "hash of the schedule bytes");
    assert_eq!(u64::from_le_bytes(ev[72..80].try_into().unwrap()), escrow);
    // the hash is over tier+1 bytes with 26 non-zero entries
    let s = env.schedule(&draw);
    assert_eq!(s.iter().filter(|&&b| b != 0).count(), 26);
    assert!(s.iter().all(|&b| b & SCHEDULE_WON_BIT == 0));
}

#[test]
fn open_is_refused_after_sales_closed_or_with_incomplete_pool() {
    let mut env = Env::new();
    let p = params(CLOSE);
    let draw = env.create(p.clone()).unwrap();
    env.init_pool(&draw, 0, 299).unwrap();
    env.set_schedule_all(&draw, &default_schedule(&p)).unwrap();
    expect_err(env.open(&draw), &code("PoolIncomplete"));
    env.init_pool(&draw, 299, 300).unwrap();
    env.set_time(CLOSE);
    expect_err(env.open(&draw), &code("SalesClosed"));
    env.set_time(CLOSE - 1);
    env.open(&draw).unwrap();
}

#[test]
fn draft_can_be_cancelled_by_the_authority_only() {
    let mut env = Env::new();
    let draw = env.create(params(CLOSE)).unwrap();
    let mallory = env.user(1);
    expect_err(env.cancel_as(&draw, &mallory), &code("Unauthorized"));
    let keeper = env.keeper.insecure_clone();
    expect_err(env.cancel_as(&draw, &keeper), &code("Unauthorized"));
    let admin = env.admin.insecure_clone();
    env.cancel_as(&draw, &admin).unwrap();
    let d = env.draw(&draw);
    assert_eq!(d.status, DrawStatus::Cancelled);
    assert!(d.escrow_returned && d.instant_escrow_returned);
    expect_err(env.withdraw(&draw), &code("NothingToWithdraw"));
    expect_err(env.init_pool(&draw, 0, 300), &code("WrongStatus"));
    expect_err(env.open(&draw), &code("WrongStatus"));
    expect_err(env.cancel_as(&draw, &admin), &code("WrongStatus"));
    // an Open draw cannot be cancelled this way
    let open = env.setup_draw(params(CLOSE)).unwrap();
    expect_err(env.cancel_as(&open, &admin), &code("WrongStatus"));
}
