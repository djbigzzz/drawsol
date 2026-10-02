use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, ENTRY_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::DrawSettled;
use crate::fairness::{read_fulfilled_randomness, winning_ticket};
use crate::state::{DrawKind, DrawStatus, DrawV3, EntryV3, VaultV3};
use crate::utils::{now, pay_from_vault};

/// Permissionless: anyone can settle; the prize always goes to the owner of the winning entry.
#[derive(Accounts)]
pub struct SettleDraw<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV3>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, VaultV3>,

    /// CHECK: owner / seed / fulfilment checked in `read_fulfilled_randomness`.
    #[account(address = draw.draw_vrf_request @ DrawError::VrfWrongAccount)]
    pub vrf_request: UncheckedAccount<'info>,

    #[account(
        seeds = [ENTRY_SEED, draw.key().as_ref(), &winning_entry.seq.to_le_bytes()],
        bump = winning_entry.bump,
        constraint = winning_entry.draw == draw.key() @ DrawError::WrongWinningEntry,
    )]
    pub winning_entry: Box<Account<'info, EntryV3>>,

    /// CHECK: receives the prize; pinned to the winning entry's owner.
    #[account(mut, address = winning_entry.owner)]
    pub winner: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<SettleDraw>) -> Result<()> {
    let now = now()?;
    let draw_key = ctx.accounts.draw.key();
    require!(ctx.accounts.draw.status == DrawStatus::Drawing, DrawError::WrongStatus);

    let rnd = read_fulfilled_randomness(
        &ctx.accounts.vrf_request.to_account_info(),
        &ctx.accounts.draw.draw_vrf_request,
        &ctx.accounts.draw.draw_vrf_seed,
    )?;
    let w = winning_ticket(&rnd, ctx.accounts.draw.next_ticket);
    require!(ctx.accounts.winning_entry.contains(w), DrawError::WrongWinningEntry);

    let d = &ctx.accounts.draw;
    // Pot: the pot plus whatever the instant pool still holds (never the house share).
    let prize = match d.kind {
        DrawKind::Headline => d.prize_lamports,
        DrawKind::Pot => d.pot_lamports.checked_add(d.instant_pool_lamports).ok_or(DrawError::MathOverflow)?,
    };
    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.winner.to_account_info(),
        prize,
    )?;

    let entry_key = ctx.accounts.winning_entry.key();
    let winner = ctx.accounts.winning_entry.owner;
    let d = &mut ctx.accounts.draw;
    match d.kind {
        DrawKind::Headline => d.house_lamports = d.revenue_lamports,
        // the unwon instant pool rolled into the prize
        DrawKind::Pot => d.instant_pool_lamports = 0,
    }
    d.randomness = rnd;
    d.winning_ticket = w;
    d.winning_entry = entry_key;
    d.winner = winner;
    d.prize_paid_lamports = prize;
    d.settled_at = now;
    d.prize_paid = true;
    d.status = DrawStatus::Settled;

    emit!(DrawSettled { draw: draw_key, winning_ticket: w, winning_entry: entry_key, winner, prize });
    Ok(())
}
