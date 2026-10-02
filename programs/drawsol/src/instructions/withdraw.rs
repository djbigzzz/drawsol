use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::Withdrawn;
use crate::state::{DrawKind, DrawStatus, DrawV3, VaultV3};
use crate::utils::pay_from_vault;

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [DRAW_SEED, &draw.id.to_le_bytes()],
        bump = draw.bump,
        has_one = authority @ DrawError::Unauthorized,
    )]
    pub draw: Box<Account<'info, DrawV3>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, VaultV3>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

/// Pays out whatever the authority is entitled to right now:
/// - Settled: `house_lamports − house_withdrawn` (pot: the house share; headline: all ticket revenue).
/// - Cancelled headline: the escrowed prize, once (if `request_draw` did not already return it).
/// A pot draw's house share is never withdrawable before Settled (refunds could still be owed), and a
/// cancelled draw's ticket money only ever backs refunds.
pub fn handler(ctx: Context<Withdraw>) -> Result<()> {
    let d = &mut ctx.accounts.draw;
    let mut amount: u64 = 0;

    if d.status == DrawStatus::Settled {
        let left = d.house_lamports.checked_sub(d.house_withdrawn).ok_or(DrawError::MathOverflow)?;
        d.house_withdrawn = d.house_lamports;
        amount = amount.checked_add(left).ok_or(DrawError::MathOverflow)?;
    }
    if d.status == DrawStatus::Cancelled && d.kind == DrawKind::Headline && !d.prize_paid {
        d.prize_paid = true;
        amount = amount.checked_add(d.prize_lamports).ok_or(DrawError::MathOverflow)?;
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
