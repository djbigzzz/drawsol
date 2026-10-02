use anchor_lang::prelude::*;

use crate::constants::{BPS, DRAW_SEED, ENTRY_SEED, PLAYER_SEED, PROFILE_SEED, TIER_CREDITS, TIER_SOL_SHARE, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::EntryRevealed;
use crate::fairness::{read_fulfilled_randomness, ticket_tier};
use crate::state::{DrawStatus, DrawV3, EntryV3, PlayerV3, Profile, VaultV3};
use crate::utils::pay_from_vault;

/// Permissionless: whoever sends the transaction pays its fee; winnings always go to `entry.owner`.
#[derive(Accounts)]
pub struct RevealEntry<'info> {
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

    #[account(
        mut,
        seeds = [PLAYER_SEED, draw.key().as_ref(), entry.owner.as_ref()],
        bump = player.bump,
    )]
    pub player: Box<Account<'info, PlayerV3>>,

    /// Receives credit prizes.
    #[account(mut, seeds = [PROFILE_SEED, entry.owner.as_ref()], bump = profile.bump)]
    pub profile: Box<Account<'info, Profile>>,

    /// CHECK: receives the instant SOL; pinned to the entry owner.
    #[account(mut, address = entry.owner)]
    pub owner: UncheckedAccount<'info>,

    /// CHECK: owner / seed / fulfilment checked in `read_fulfilled_randomness`.
    #[account(address = entry.vrf_request @ DrawError::VrfWrongAccount)]
    pub vrf_request: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RevealEntry>) -> Result<()> {
    let draw_key = ctx.accounts.draw.key();
    let entry_key = ctx.accounts.entry.key();

    {
        let e = &ctx.accounts.entry;
        require!(e.needs_reveal, DrawError::NoInstantRoll);
        require!(!e.revealed, DrawError::AlreadyRevealed);
        // A cancelled draw refunds `paid − sol_paid`: no new instant payouts once refunds are open.
        require!(ctx.accounts.draw.status != DrawStatus::Cancelled, DrawError::WrongStatus);
    }

    let rnd = read_fulfilled_randomness(
        &ctx.accounts.vrf_request.to_account_info(),
        &ctx.accounts.entry.vrf_request,
        &ctx.accounts.entry.vrf_seed,
    )?;

    let d = &ctx.accounts.draw;
    let e = &ctx.accounts.entry;
    let odds = d.tier_odds();
    let mut tiers = [0u8; 25];
    let mut owed: u64 = 0;
    let mut credits: u32 = 0;
    for i in 0..e.count {
        let ticket = e.first_ticket.checked_add(i as u32).ok_or(DrawError::MathOverflow)?;
        let tier = ticket_tier(&rnd, ticket, d.iw_denominator, &odds);
        tiers[i as usize] = tier;
        if tier == 0 {
            continue;
        }
        let t = d.iw_tiers[(tier - 1) as usize];
        match t.kind {
            TIER_SOL_SHARE => {
                let share = (e.pool_snapshot as u128)
                    .checked_mul(t.value as u128)
                    .ok_or(DrawError::MathOverflow)?
                    / BPS as u128;
                owed = owed
                    .checked_add(u64::try_from(share).map_err(|_| DrawError::MathOverflow)?)
                    .ok_or(DrawError::MathOverflow)?;
            }
            TIER_CREDITS => credits = credits.checked_add(t.value).ok_or(DrawError::MathOverflow)?,
            _ => {}
        }
    }
    // The snapshot was taken at purchase, so a delayed reveal cannot inflate the payout; the pool caps it.
    let sol_paid = owed.min(d.instant_pool_lamports);

    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        sol_paid,
    )?;

    let e = &mut ctx.accounts.entry;
    e.revealed = true;
    e.tiers = tiers;
    e.sol_paid = sol_paid;
    e.credits_won = credits;
    let (owner, first_ticket, count) = (e.owner, e.first_ticket, e.count);

    // Saturating: a reveal must never be blocked by a (practically unreachable) credit overflow.
    let pr = &mut ctx.accounts.profile;
    pr.credits = pr.credits.saturating_add(credits);

    let p = &mut ctx.accounts.player;
    p.won_sol = p.won_sol.checked_add(sol_paid).ok_or(DrawError::MathOverflow)?;
    p.won_credits = p.won_credits.saturating_add(credits);

    let d = &mut ctx.accounts.draw;
    d.revealed_entries = d.revealed_entries.checked_add(1).ok_or(DrawError::MathOverflow)?;
    d.instant_pool_lamports = d.instant_pool_lamports.checked_sub(sol_paid).ok_or(DrawError::MathOverflow)?;

    emit!(EntryRevealed { draw: draw_key, entry: entry_key, owner, first_ticket, count, tiers, sol_paid, credits_won: credits });
    Ok(())
}
