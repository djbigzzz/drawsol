use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, ENTRY_SEED, PROFILE_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::Refunded;
use crate::state::{DrawStatus, DrawV3, EntryV3, Profile, VaultV3};
use crate::utils::pay_from_vault;

/// Permissionless: the refund always goes to `entry.owner`; spent credits go back to the owner's profile.
#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV3>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, VaultV3>,

    #[account(
        mut,
        seeds = [ENTRY_SEED, draw.key().as_ref(), &entry.seq.to_le_bytes()],
        bump = entry.bump,
        has_one = draw,
        has_one = owner,
    )]
    pub entry: Box<Account<'info, EntryV3>>,

    #[account(mut, seeds = [PROFILE_SEED, entry.owner.as_ref()], bump = profile.bump)]
    pub profile: Box<Account<'info, Profile>>,

    /// CHECK: receives the refund; pinned to the entry owner.
    #[account(mut, address = entry.owner)]
    pub owner: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ClaimRefund>) -> Result<()> {
    require!(ctx.accounts.draw.status == DrawStatus::Cancelled, DrawError::WrongStatus);
    let e = &ctx.accounts.entry;
    require!(!e.refunded, DrawError::AlreadyRefunded);

    // Paid minus instant SOL already received, never negative. Headline entries never have instant wins.
    let amount = e.paid_lamports.saturating_sub(e.sol_paid);
    let credits = e.credit_count as u32;
    require!(amount > 0 || credits > 0, DrawError::NothingToRefund);

    // Errors with VaultShortfall (rather than paying someone else's refund) if the vault cannot cover it.
    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        amount,
    )?;

    let pr = &mut ctx.accounts.profile;
    pr.credits = pr.credits.saturating_add(credits);

    let e = &mut ctx.accounts.entry;
    e.refunded = true;
    let (entry_key, owner) = (e.key(), e.owner);
    let d = &mut ctx.accounts.draw;
    d.refunded_lamports = d.refunded_lamports.checked_add(amount).ok_or(DrawError::MathOverflow)?;

    emit!(Refunded { draw: d.key(), entry: entry_key, owner, amount, credits });
    Ok(())
}
