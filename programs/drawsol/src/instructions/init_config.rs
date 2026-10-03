use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::DrawError;
use crate::events::KeeperSet;
use crate::program::Drawsol;
use crate::state::Config;

/// Fresh deployments only (devnet already has the Config from v3).
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
