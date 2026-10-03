use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::constants::*;
use crate::errors::DrawError;
use crate::events::DrawOpened;
use crate::side::{check_pool, check_schedule, pool_remaining};
use crate::state::{DrawStatus, DrawV4, Vault};
use crate::utils::{deposit_to_vault, now};

/// Draft → Open. Requires the pool fully initialised and every tier's winning numbers registered;
/// the authority escrows `end_prize + schedule_total`. Emits the schedule hash so the numbers are fixed.
#[derive(Accounts)]
pub struct OpenDraw<'info> {
    #[account(
        mut,
        seeds = [DRAW_SEED, &draw.id.to_le_bytes()],
        bump = draw.bump,
        has_one = authority @ DrawError::Unauthorized,
    )]
    pub draw: Box<Account<'info, DrawV4>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    /// CHECK: owner / discriminator / completeness checked in the handler.
    #[account(seeds = [POOL_SEED, draw.key().as_ref()], bump = draw.pool_bump)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: owner / discriminator / size checked in the handler; hashed.
    #[account(seeds = [SCHEDULE_SEED, draw.key().as_ref()], bump = draw.schedule_bump)]
    pub schedule: UncheckedAccount<'info>,

    /// Escrows the prizes.
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<OpenDraw>) -> Result<()> {
    let now = now()?;
    let d = &ctx.accounts.draw;
    require!(d.status == DrawStatus::Draft, DrawError::WrongStatus);
    require!(now < d.closes_at, DrawError::SalesClosed);
    d.check_profitability()?;

    let pool = ctx.accounts.pool.to_account_info();
    let schedule = ctx.accounts.schedule.to_account_info();
    check_pool(&pool)?;
    check_schedule(&schedule)?;
    require!(pool.data_len() >= d.pool_len(), DrawError::PoolIncomplete);
    require!(pool_remaining(&pool.try_borrow_data()?) == d.ticket_cap, DrawError::PoolIncomplete);
    require!(schedule.data_len() >= d.schedule_len(), DrawError::PoolIncomplete);
    require!(d.tiers.iter().all(|t| t.set == t.count), DrawError::ScheduleIncomplete);
    require!(d.schedule_set == d.tiers_total_count(), DrawError::ScheduleIncomplete);

    let schedule_hash = {
        let data = schedule.try_borrow_data()?;
        hashv(&[&data[SCHEDULE_BYTES_OFFSET..d.schedule_len()]]).to_bytes()
    };

    let escrow = d
        .end_prize_lamports
        .checked_add(d.schedule_total_lamports)
        .ok_or(DrawError::MathOverflow)?;
    deposit_to_vault(
        &ctx.accounts.authority.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        escrow,
    )?;

    let d = &mut ctx.accounts.draw;
    d.status = DrawStatus::Open;
    emit!(DrawOpened { draw: d.key(), schedule_hash, escrow_lamports: escrow });
    Ok(())
}
