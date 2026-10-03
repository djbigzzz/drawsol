use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::DrawError;
use crate::events::PoolInitialised;
use crate::side::{check_pool, check_schedule, pool_remaining, pool_set, set_pool_remaining};
use crate::state::{Config, DrawStatus, DrawV4};
use crate::utils::grow_account;

/// Fills `pool[from..to] = from..to`, growing the Pool (and, past 10 KB, the Schedule) as needed.
/// Chunks are sequential: `from` must be the next unfilled number. Draft only; admin or keeper pays the rent.
#[derive(Accounts)]
pub struct InitPool<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = payer.key() == config.admin || payer.key() == config.keeper @ DrawError::Unauthorized,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV4>>,

    /// CHECK: owner / discriminator checked in the handler; raw bytes.
    #[account(mut, seeds = [POOL_SEED, draw.key().as_ref()], bump = draw.pool_bump)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: owner / discriminator checked in the handler; grown here when the cap exceeds 10 KB.
    #[account(mut, seeds = [SCHEDULE_SEED, draw.key().as_ref()], bump = draw.schedule_bump)]
    pub schedule: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitPool>, from: u32, to: u32) -> Result<()> {
    let d = &ctx.accounts.draw;
    require!(d.status == DrawStatus::Draft, DrawError::WrongStatus);
    let pool = ctx.accounts.pool.to_account_info();
    let schedule = ctx.accounts.schedule.to_account_info();
    check_pool(&pool)?;
    check_schedule(&schedule)?;

    require!(from < to && to <= d.ticket_cap && to - from <= POOL_CHUNK_MAX, DrawError::BadPoolChunk);
    require!(pool_remaining(&pool.try_borrow_data()?) == from, DrawError::BadPoolChunk);

    let payer = ctx.accounts.payer.to_account_info();
    let sys = ctx.accounts.system_program.to_account_info();
    grow_account(&pool, POOL_NUMBERS_OFFSET + 4 * to as usize, &payer, &sys)?;
    grow_account(&schedule, SCHEDULE_BYTES_OFFSET + to as usize, &payer, &sys)?;

    let mut data = pool.try_borrow_mut_data()?;
    for n in from..to {
        pool_set(&mut data, n as usize, n);
    }
    set_pool_remaining(&mut data, to);

    emit!(PoolInitialised { draw: d.key(), from, to });
    Ok(())
}
