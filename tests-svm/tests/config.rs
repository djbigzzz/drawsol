//! Config: init (fresh deployments) and keeper management.
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use solana_signer::Signer;

#[test]
fn init_config_requires_upgrade_authority() {
    let mut env = Env::bare();
    let attacker = env.user(10);
    let real_pd = programdata_pda(&drawsol::ID);
    let k = env.keeper.pubkey();

    // Not the upgrade authority, real ProgramData account.
    let ix = env.ix_init_config(&attacker.pubkey(), real_pd, k);
    expect_err(env.send(&[ix], &[&attacker]), &code("Unauthorized"));

    // Fake ProgramData naming the attacker, at another address: not the program's programdata_address.
    let fake_pd = Pubkey::new_unique();
    let fake = programdata_account(&env.svm, b"not-an-elf", Some(attacker.pubkey()));
    env.svm.set_account(fake_pd, fake).unwrap();
    let ix = env.ix_init_config(&attacker.pubkey(), fake_pd, k);
    expect_err(env.send(&[ix], &[&attacker]), &code("Unauthorized"));

    // Upgrade authority succeeds, once.
    env.init_config().unwrap();
    let c = env.config();
    assert_eq!((c.admin, c.keeper, c.next_draw_id), (env.admin.pubkey(), k, 0));
    assert!(env.init_config().is_err(), "config cannot be re-initialised");
}

#[test]
fn init_config_fails_for_immutable_program() {
    let mut env = Env::bare();
    let elf = std::fs::read(format!("{ROOT}/../target/deploy/drawsol.so")).unwrap();
    deploy_upgradeable(&mut env.svm, drawsol::ID, &elf, None);
    expect_err(env.init_config(), &code("Unauthorized"));
}

#[test]
fn set_keeper_admin_only_and_keeper_rights() {
    let mut env = Env::new();
    let admin = env.admin.insecure_clone();
    let old_keeper = env.keeper.insecure_clone();
    let new_keeper = env.user(5);

    let ix = env.ix_set_keeper(&old_keeper.pubkey(), old_keeper.pubkey());
    expect_err(env.send(&[ix], &[&old_keeper]), &code("Unauthorized"));

    let ix = env.ix_set_keeper(&admin.pubkey(), new_keeper.pubkey());
    env.send(&[ix], &[&admin]).unwrap();
    assert_eq!(env.config().keeper, new_keeper.pubkey());

    // The replaced keeper lost its rights; the new one has them (create / init_pool / set_schedule).
    expect_err(env.create_as(&old_keeper, params(CLOSE)), &code("Unauthorized"));
    let draw = env.create_as(&new_keeper, params(CLOSE)).unwrap();
    assert_eq!(env.draw(&draw).authority, admin.pubkey(), "the authority is always the admin");
    expect_err(env.init_pool_as(&old_keeper, &draw, 0, 300), &code("Unauthorized"));
    env.init_pool_as(&new_keeper, &draw, 0, 300).unwrap();
    let sched = default_schedule(&params(CLOSE));
    expect_err(env.set_schedule_as(&old_keeper, &draw, &sched), &code("Unauthorized"));
    env.set_schedule_as(&new_keeper, &draw, &sched).unwrap();
    // ...but only the authority can open (it escrows the prizes)
    expect_err(env.open_as(&new_keeper, &draw), &code("Unauthorized"));
    env.open(&draw).unwrap();
}
