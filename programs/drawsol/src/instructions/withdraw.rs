use anchor_lang::prelude::*;

use crate::constants::{CANCEL_GRACE_SECS, DRAW_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::Withdrawn;
use crate::state::{DrawStatus, DrawV4, Vault};
use crate::utils::{now, pay_from_vault};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [DRAW_SEED, &draw.id.to_le_bytes()],
        bump = draw.bump,
        has_one = authority @ DrawError::Unauthorized,
    )]
    pub draw: Box<Account<'info, DrawV4>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

/// Pays out whatever the authority is entitled to right now:
/// - Settled: `house_lamports − house_withdrawn`, plus the unwon schedule escrow once every entry is
///   revealed (or 48 h after draw_at) if settle did not already return it.
/// - Cancelled: the end-prize escrow once and the whole schedule escrow once (never the refund liability;
///   refunds are net of instant prizes received, see `claim_refund`).
/// The house share is never withdrawable before Settled (refunds could still be owed).
pub fn handler(ctx: Context<Withdraw>) -> Result<()> {
    let now = now()?;
    let d = &mut ctx.accounts.draw;
    let mut amount: u64 = 0;

    match d.status {
        DrawStatus::Settled => {
            let left = d.house_lamports.checked_sub(d.house_withdrawn).ok_or(DrawError::MathOverflow)?;
            d.house_withdrawn = d.house_lamports;
            amount = amount.checked_add(left).ok_or(DrawError::MathOverflow)?;
            let deadline = d.draw_at.checked_add(CANCEL_GRACE_SECS).ok_or(DrawError::MathOverflow)?;
            if !d.instant_escrow_returned && (d.all_revealed() || now > deadline) {
                d.instant_escrow_returned = true;
                amount = amount.checked_add(d.instant_escrow_left()?).ok_or(DrawError::MathOverflow)?;
            }
        }
        DrawStatus::Cancelled => {
            // Refunds are net of the instant prizes an entry already received, so those prizes are borne
            // by the refunds and the authority gets the whole schedule escrow back, not just the unwon part.
            if !d.escrow_returned {
                d.escrow_returned = true;
                amount = amount.checked_add(d.end_prize_lamports).ok_or(DrawError::MathOverflow)?;
            }
            if !d.instant_escrow_returned {
                d.instant_escrow_returned = true;
                amount = amount.checked_add(d.schedule_total_lamports).ok_or(DrawError::MathOverflow)?;
            }
        }
        _ => {}
    }
    require!(amount > 0, DrawError::NothingToWithdraw);
    let draw_key = d.key();

    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.authority.to_account_info(),
        amount,
    )?;

    emit!(Withdrawn { draw: draw_key, amount });
    Ok(())
}
