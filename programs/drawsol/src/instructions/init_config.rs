use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::errors::DrawError;
use crate::program::Drawsol;
use crate::state::Config;

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

pub fn handler(ctx: Context<InitConfig>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.next_draw_id = 0;
    config.bump = ctx.bumps.config;
    Ok(())
}
