use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, ENTRY_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::Refunded;
use crate::state::{DrawStatus, DrawV4, EntryV4, Vault};
use crate::utils::pay_from_vault;

/// Permissionless: the refund (paid − instant prizes received) always goes to `entry.owner`.
#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV4>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [ENTRY_SEED, draw.key().as_ref(), &entry.seq.to_le_bytes()],
        bump = entry.bump,
        has_one = draw,
        has_one = owner,
    )]
    pub entry: Box<Account<'info, EntryV4>>,

    /// CHECK: receives the refund; pinned to the entry owner.
    #[account(mut, address = entry.owner)]
    pub owner: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ClaimRefund>) -> Result<()> {
    require!(ctx.accounts.draw.status == DrawStatus::Cancelled, DrawError::WrongStatus);
    let e = &ctx.accounts.entry;
    require!(!e.refunded, DrawError::AlreadyRefunded);

    // Paid minus instant prizes already received, never negative.
    let amount = e.paid_lamports.saturating_sub(e.instant_paid);
    require!(amount > 0, DrawError::NothingToRefund);

    // Errors with VaultShortfall (rather than paying someone else's refund) if the vault cannot cover it.
    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        amount,
    )?;

    let e = &mut ctx.accounts.entry;
    e.refunded = true;
    let (entry_key, owner) = (e.key(), e.owner);
    let d = &mut ctx.accounts.draw;
    d.refunded_lamports = d.refunded_lamports.checked_add(amount).ok_or(DrawError::MathOverflow)?;

    emit!(Refunded { draw: d.key(), entry: entry_key, owner, amount });
    Ok(())
}
