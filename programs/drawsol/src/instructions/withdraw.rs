use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, RESERVE_UNLOCK_SECS, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::Withdrawn;
use crate::state::{Draw, DrawStatus, Vault};
use crate::utils::{now, pay_from_vault};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [DRAW_SEED, &draw.id.to_le_bytes()],
        bump = draw.bump,
        has_one = authority @ DrawError::Unauthorized,
    )]
    pub draw: Box<Account<'info, Draw>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

/// Pays out whatever the authority is entitled to right now:
/// - Settled: ticket proceeds (once).
/// - Settled/Cancelled: unspent instant-win reserve, once every paid entry is revealed or
///   `RESERVE_UNLOCK_SECS` after close.
/// - Cancelled: the prize, if it was not already returned.
/// Ticket proceeds of a cancelled draw are never withdrawable: they back the refunds.
pub fn handler(ctx: Context<Withdraw>) -> Result<()> {
    let now = now()?;
    let d = &mut ctx.accounts.draw;
    let mut amount: u64 = 0;
    let mut did_something = false;

    if d.status == DrawStatus::Settled && !d.proceeds_withdrawn {
        amount = amount.checked_add(d.proceeds_lamports).ok_or(DrawError::MathOverflow)?;
        d.proceeds_withdrawn = true;
        did_something = true;
    }

    let unlock_at = d.closes_at.checked_add(RESERVE_UNLOCK_SECS).ok_or(DrawError::MathOverflow)?;
    if !d.reserve_withdrawn
        && (d.status == DrawStatus::Settled || d.status == DrawStatus::Cancelled)
        && (d.revealed_entries == d.paid_entries || now > unlock_at)
    {
        let left = d
            .iw_reserve_lamports
            .checked_sub(d.iw_paid_lamports)
            .ok_or(DrawError::MathOverflow)?;
        amount = amount.checked_add(left).ok_or(DrawError::MathOverflow)?;
        d.reserve_withdrawn = true;
        did_something = true;
    }

    if d.status == DrawStatus::Cancelled && !d.prize_paid {
        amount = amount.checked_add(d.prize_lamports).ok_or(DrawError::MathOverflow)?;
        d.prize_paid = true;
        did_something = true;
    }

    require!(did_something, DrawError::NothingToWithdraw);
    let draw_key = d.key();

    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.authority.to_account_info(),
        amount,
    )?;

    emit!(Withdrawn { draw: draw_key, amount });
    Ok(())
}
