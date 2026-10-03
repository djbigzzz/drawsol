use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::DrawError;
use crate::events::ScheduleSet;
use crate::side::check_schedule;
use crate::state::{Config, DrawStatus, DrawV4};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct ScheduleEntry {
    /// winning ticket number, < ticket_cap
    pub ticket: u32,
    /// tier index 0..8 (stored in the schedule as tier + 1)
    pub tier: u8,
}

/// Registers winning numbers (≤ 300 per call). Each number at most once; each tier at most `count` times.
/// Draft only; admin or keeper.
#[derive(Accounts)]
pub struct SetSchedule<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = signer.key() == config.admin || signer.key() == config.keeper @ DrawError::Unauthorized,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV4>>,

    /// CHECK: owner / discriminator checked in the handler; raw bytes.
    #[account(mut, seeds = [SCHEDULE_SEED, draw.key().as_ref()], bump = draw.schedule_bump)]
    pub schedule: UncheckedAccount<'info>,

    pub signer: Signer<'info>,
}

pub fn handler(ctx: Context<SetSchedule>, entries: Vec<ScheduleEntry>) -> Result<()> {
    require!(ctx.accounts.draw.status == DrawStatus::Draft, DrawError::WrongStatus);
    require!(!entries.is_empty() && entries.len() <= SCHEDULE_BATCH_MAX, DrawError::BadScheduleBatch);
    let schedule = ctx.accounts.schedule.to_account_info();
    check_schedule(&schedule)?;

    let d = &mut ctx.accounts.draw;
    let mut data = schedule.try_borrow_mut_data()?;
    for e in entries.iter() {
        require!(e.ticket < d.ticket_cap, DrawError::InvalidParams);
        require!((e.tier as usize) < MAX_TIERS, DrawError::InvalidParams);
        let t = &mut d.tiers[e.tier as usize];
        require!(t.count > 0, DrawError::InvalidParams);
        require!(t.set < t.count, DrawError::TierFull);
        let o = SCHEDULE_BYTES_OFFSET + e.ticket as usize;
        // the schedule is grown by init_pool; a number beyond the current size means the pool is not there yet
        require!(o < data.len(), DrawError::PoolIncomplete);
        require!(data[o] == 0, DrawError::DuplicateScheduleTicket);
        data[o] = e.tier + 1;
        t.set += 1;
        d.schedule_set = d.schedule_set.checked_add(1).ok_or(DrawError::MathOverflow)?;
    }

    emit!(ScheduleSet { draw: d.key(), schedule_set: d.schedule_set });
    Ok(())
}
