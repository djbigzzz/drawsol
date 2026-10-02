//! Config: init (fresh deployments), v2 → v3 migration, keeper management.
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use drawsol::state::Config;
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

/// The real devnet v2 Config (admin, next_draw_id = 2, bump), with the admin swapped for the test admin.
fn install_v2_config(env: &mut Env) -> Vec<u8> {
    let mut data = rpc_fixture_data("v2_config.json");
    assert_eq!(data.len(), 8 + 32 + 8 + 1, "v2 Config layout");
    data[8..40].copy_from_slice(env.admin.pubkey().as_ref());
    let lamports = rpc_fixture_lamports("v2_config.json");
    env.set_program_account(config_pda(), data.clone(), lamports);
    data
}

#[test]
fn migrate_config_from_v2_layout() {
    let mut env = Env::bare();
    let v2 = install_v2_config(&mut env);
    let next_id = u64::from_le_bytes(v2[40..48].try_into().unwrap());
    assert_eq!(next_id, 2, "devnet has draws #0 and #1");
    let admin = env.admin.insecure_clone();
    let keeper = env.keeper.pubkey();

    // v3 instructions cannot read the old layout.
    let ix = env.ix_create_pot(&admin.pubkey(), next_id, pot_params(CLOSE));
    expect_err(env.send(&[ix], &[&admin]), &code("AccountDidNotDeserialize"));

    // Only the admin stored in the v2 Config may migrate.
    let mallory = env.user(1);
    let ix = env.ix_migrate_config(&mallory.pubkey(), mallory.pubkey());
    expect_err(env.send(&[ix], &[&mallory]), &code("Unauthorized"));

    let ix = env.ix_migrate_config(&admin.pubkey(), keeper);
    env.send(&[ix], &[&admin]).unwrap();
    let acc = env.svm.get_account(&config_pda()).unwrap();
    assert_eq!(acc.data.len(), 8 + <Config as anchor_lang::Space>::INIT_SPACE);
    assert!(acc.lamports >= env.rent(acc.data.len()), "rent-exempt after realloc");
    let c = env.config();
    assert_eq!((c.admin, c.keeper, c.next_draw_id, c.bump), (admin.pubkey(), keeper, 2, v2[48]));

    // Once only.
    let ix = env.ix_migrate_config(&admin.pubkey(), keeper);
    expect_err(env.send(&[ix], &[&admin]), &code("AlreadyMigrated"));

    // New draws continue the id sequence under the v3 seeds.
    let d = env.create_pot(pot_params(CLOSE)).unwrap();
    assert_eq!(d, draw_pda(2));
    assert_eq!(env.draw(&d).id, 2);
    assert_eq!(env.config().next_draw_id, 3);
}

#[test]
fn migrate_config_refuses_v3_config() {
    let mut env = Env::new();
    let admin = env.admin.insecure_clone();
    let ix = env.ix_migrate_config(&admin.pubkey(), admin.pubkey());
    expect_err(env.send(&[ix], &[&admin]), &code("AlreadyMigrated"));
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

    // The replaced keeper lost its rights; the new one has them.
    expect_err(env.create_pot_as(&old_keeper, pot_params(CLOSE)), &code("Unauthorized"));
    env.create_pot_as(&new_keeper, pot_params(CLOSE)).unwrap();
}
