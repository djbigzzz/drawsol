use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

use crate::constants::CONFIG_SEED;
use crate::errors::DrawError;
use crate::events::KeeperSet;
use crate::program::Drawsol;
use crate::state::{Config, CONFIG_V2_LEN};
use crate::utils::deposit_to_vault;

/// Fresh deployments only (devnet already has a v2 Config: use `migrate_config`).
#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ DrawError::Unauthorized)]
    pub program: Program<'info, Drawsol>,

    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ DrawError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

pub fn init_config_handler(ctx: Context<InitConfig>, keeper: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.keeper = keeper;
    config.next_draw_id = 0;
    config.bump = ctx.bumps.config;
    emit!(KeeperSet { keeper });
    Ok(())
}

/// Reallocs the v2 Config (`admin, next_draw_id, bump`) into the v3 layout and sets the keeper.
#[derive(Accounts)]
pub struct MigrateConfig<'info> {
    /// CHECK: v2 layout, parsed by hand (an `Account<Config>` cannot deserialize it). Address pinned by seeds;
    /// owner, discriminator and length checked in the handler.
    #[account(mut, seeds = [CONFIG_SEED], bump)]
    pub config: UncheckedAccount<'info>,

    /// Must be the admin stored in the v2 Config. Pays the extra rent.
    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn migrate_config_handler(ctx: Context<MigrateConfig>, keeper: Pubkey) -> Result<()> {
    let acc = ctx.accounts.config.to_account_info();
    require_keys_eq!(*acc.owner, crate::ID, DrawError::NotLegacyAccount);
    let (admin, next_draw_id, bump) = {
        let data = acc.try_borrow_data()?;
        require!(data.len() >= 8 && &data[..8] == Config::DISCRIMINATOR, DrawError::NotLegacyAccount);
        require!(data.len() != 8 + Config::INIT_SPACE, DrawError::AlreadyMigrated);
        require!(data.len() == CONFIG_V2_LEN, DrawError::NotLegacyAccount);
        let admin = Pubkey::new_from_array(data[8..40].try_into().unwrap());
        let next = u64::from_le_bytes(data[40..48].try_into().unwrap());
        (admin, next, data[48])
    };
    require_keys_eq!(ctx.accounts.admin.key(), admin, DrawError::Unauthorized);
    require!(bump == ctx.bumps.config, DrawError::NotLegacyAccount);

    let new_len = 8 + Config::INIT_SPACE;
    let need = Rent::get()?.minimum_balance(new_len).saturating_sub(acc.lamports());
    deposit_to_vault(
        &ctx.accounts.admin.to_account_info(),
        &acc,
        &ctx.accounts.system_program.to_account_info(),
        need,
    )?;
    #[allow(deprecated)] // `resize` is not available in every solana-account-info 2.x this builds against
    acc.realloc(new_len, true)?;

    let cfg = Config { admin, keeper, next_draw_id, bump };
    let mut data = acc.try_borrow_mut_data()?;
    let mut w: &mut [u8] = &mut data[..];
    cfg.try_serialize(&mut w)?;
    emit!(KeeperSet { keeper });
    Ok(())
}

#[derive(Accounts)]
pub struct SetKeeper<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ DrawError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

pub fn set_keeper_handler(ctx: Context<SetKeeper>, keeper: Pubkey) -> Result<()> {
    ctx.accounts.config.keeper = keeper;
    emit!(KeeperSet { keeper });
    Ok(())
}
