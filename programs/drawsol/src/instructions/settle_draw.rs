use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, ENTRY_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::DrawSettled;
use crate::fairness::{read_fulfilled_randomness, winning_ticket};
use crate::state::{Draw, DrawStatus, Entry, Vault};
use crate::utils::{now, pay_from_vault};

/// Permissionless: anyone can settle; the prize always goes to the owner of the winning entry.
#[derive(Accounts)]
pub struct SettleDraw<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, Draw>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    /// CHECK: owner / seed / fulfilment checked in `read_fulfilled_randomness`.
    #[account(address = draw.draw_vrf_request @ DrawError::VrfWrongAccount)]
    pub vrf_request: UncheckedAccount<'info>,

    #[account(
        seeds = [ENTRY_SEED, draw.key().as_ref(), &winning_entry.seq.to_le_bytes()],
        bump = winning_entry.bump,
        constraint = winning_entry.draw == draw.key() @ DrawError::WrongWinningEntry,
    )]
    pub winning_entry: Box<Account<'info, Entry>>,

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

    let prize = ctx.accounts.draw.prize_lamports;
    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.winner.to_account_info(),
        prize,
    )?;

    let entry_key = ctx.accounts.winning_entry.key();
    let winner = ctx.accounts.winning_entry.owner;
    let d = &mut ctx.accounts.draw;
    d.randomness = rnd;
    d.winning_ticket = w;
    d.winning_entry = entry_key;
    d.winner = winner;
    d.settled_at = now;
    d.prize_paid = true;
    d.status = DrawStatus::Settled;

    emit!(DrawSettled {
        draw: draw_key,
        winning_ticket: w,
        winning_entry: entry_key,
        winner,
        prize_lamports: prize,
    });
    Ok(())
}
