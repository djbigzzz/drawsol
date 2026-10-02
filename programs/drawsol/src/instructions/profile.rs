use anchor_lang::prelude::*;

use crate::constants::{LIMIT_INCREASE_DELAY, PROFILE_SEED};
use crate::errors::DrawError;
use crate::events::{LimitSet, SelfExcluded};
use crate::state::Profile;
use crate::utils::now;

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(
        init_if_needed,
        payer = wallet,
        space = 8 + Profile::INIT_SPACE,
        seeds = [PROFILE_SEED, wallet.key().as_ref()],
        bump
    )]
    pub profile: Box<Account<'info, Profile>>,

    #[account(mut)]
    pub wallet: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// Spend limit per 30-day period (`0` = no limit).
/// - Lowering it, or setting one where there was none → immediate (and cancels a pending increase).
/// - Raising it, or removing it (`0`) → pending, effective `LIMIT_INCREASE_DELAY` (72 h) later.
pub fn set_limit_handler(ctx: Context<UpdateProfile>, lamports: u64) -> Result<()> {
    let now = now()?;
    let bump = ctx.bumps.profile;
    let wallet = ctx.accounts.wallet.key();
    let p = &mut ctx.accounts.profile;
    p.ensure_init(wallet, bump);
    p.apply_pending(now);

    let current = p.limit_lamports;
    let tighter = lamports != 0 && (current == 0 || lamports <= current);
    if tighter {
        p.limit_lamports = lamports;
        p.pending_limit = 0;
        p.pending_from = 0;
    } else if lamports == current {
        // no-op (0 → 0); also drops a pending change back to the current limit
        p.pending_limit = 0;
        p.pending_from = 0;
    } else {
        p.pending_limit = lamports;
        p.pending_from = now.checked_add(LIMIT_INCREASE_DELAY).ok_or(DrawError::MathOverflow)?;
    }

    emit!(LimitSet {
        wallet,
        limit_lamports: p.limit_lamports,
        pending_limit: p.pending_limit,
        pending_from: p.pending_from,
    });
    Ok(())
}

/// Self-exclusion until `until` (unix). Can only be extended, never shortened.
pub fn self_exclude_handler(ctx: Context<UpdateProfile>, until: i64) -> Result<()> {
    let bump = ctx.bumps.profile;
    let wallet = ctx.accounts.wallet.key();
    let p = &mut ctx.accounts.profile;
    p.ensure_init(wallet, bump);
    p.excluded_until = p.excluded_until.max(until);
    emit!(SelfExcluded { wallet, excluded_until: p.excluded_until });
    Ok(())
}
