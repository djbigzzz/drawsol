use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, ENTRY_SEED, PLAYER_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::EntryRevealed;
use crate::fairness::{read_fulfilled_randomness, ticket_tier};
use crate::state::{Draw, Entry, Player, Vault};
use crate::utils::pay_from_vault;

/// Permissionless: whoever sends the transaction pays its fee; winnings always go to `entry.owner`.
#[derive(Accounts)]
pub struct RevealEntry<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, Draw>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [ENTRY_SEED, draw.key().as_ref(), &entry.seq.to_le_bytes()],
        bump = entry.bump,
        has_one = draw,
        has_one = owner,
    )]
    pub entry: Box<Account<'info, Entry>>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, draw.key().as_ref(), entry.owner.as_ref()],
        bump = player.bump,
    )]
    pub player: Box<Account<'info, Player>>,

    /// CHECK: receives the instant win; pinned to the entry owner.
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
        require!(!e.is_free, DrawError::FreeEntryNoReveal);
        require!(!e.revealed, DrawError::AlreadyRevealed);
        require!(!ctx.accounts.draw.reserve_withdrawn, DrawError::WrongStatus);
    }

    let rnd = read_fulfilled_randomness(
        &ctx.accounts.vrf_request.to_account_info(),
        &ctx.accounts.entry.vrf_request,
        &ctx.accounts.entry.vrf_seed,
    )?;

    let d = &ctx.accounts.draw;
    let e = &ctx.accounts.entry;
    let mut tiers = [0u8; 25];
    let mut total: u64 = 0;
    for i in 0..e.count {
        let ticket = e.first_ticket.checked_add(i as u32).ok_or(DrawError::MathOverflow)?;
        let tier = ticket_tier(&rnd, ticket, d.iw_denominator, &d.iw_tiers);
        tiers[i as usize] = tier;
        if tier > 0 {
            total = total
                .checked_add(d.iw_tiers[(tier - 1) as usize].amount)
                .ok_or(DrawError::MathOverflow)?;
        }
    }
    let remaining = d
        .iw_reserve_lamports
        .checked_sub(d.iw_paid_lamports)
        .ok_or(DrawError::MathOverflow)?;
    let paid = total.min(remaining);

    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        paid,
    )?;

    let e = &mut ctx.accounts.entry;
    e.revealed = true;
    e.tiers = tiers;
    e.instant_paid = paid;
    let (owner, first_ticket, count) = (e.owner, e.first_ticket, e.count);

    let p = &mut ctx.accounts.player;
    p.won = p.won.checked_add(paid).ok_or(DrawError::MathOverflow)?;

    let d = &mut ctx.accounts.draw;
    d.revealed_entries = d.revealed_entries.checked_add(1).ok_or(DrawError::MathOverflow)?;
    d.iw_paid_lamports = d.iw_paid_lamports.checked_add(paid).ok_or(DrawError::MathOverflow)?;

    emit!(EntryRevealed { draw: draw_key, entry: entry_key, owner, first_ticket, count, tiers, paid });
    Ok(())
}
