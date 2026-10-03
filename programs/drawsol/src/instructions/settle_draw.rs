use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, ENTRY_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::DrawSettled;
use crate::fairness::{read_fulfilled_randomness, winning_position};
use crate::state::{DrawStatus, DrawV4, EntryV4, Vault};
use crate::utils::{mul_bps, now, pay_from_vault};

/// Permissionless. `winning_pos = uniform(rand, next_pos)`; the (revealed) entry holding that position
/// wins with `winning_ticket = tickets[pos − first_pos]`. Pays the end prize in full when
/// `paid_tickets ≥ min_tickets`, else the fallback pot (`pot_bps` of revenue); returns the unused escrow.
#[derive(Accounts)]
pub struct SettleDraw<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV4>>,

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
    pub winning_entry: Box<Account<'info, EntryV4>>,

    /// CHECK: receives the prize; pinned to the winning entry's owner.
    #[account(mut, address = winning_entry.owner)]
    pub winner: UncheckedAccount<'info>,

    /// CHECK: receives the unused escrow; pinned to the draw authority.
    #[account(mut, address = draw.authority @ DrawError::Unauthorized)]
    pub authority: UncheckedAccount<'info>,
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
    let pos = winning_position(&rnd, ctx.accounts.draw.next_pos);
    let e = &ctx.accounts.winning_entry;
    require!(e.holds_pos(pos), DrawError::WrongWinningEntry);
    require!(e.revealed && e.tickets.len() == e.count as usize, DrawError::WinnerNotRevealed);
    let winning_ticket = e.tickets[(pos - e.first_pos) as usize];

    let d = &ctx.accounts.draw;
    let fallback = d.paid_tickets < d.min_tickets;
    let prize = if fallback { mul_bps(d.revenue, d.pot_bps as u64)? } else { d.end_prize_lamports };
    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.winner.to_account_info(),
        prize,
    )?;

    // Unused escrow back to the authority: the whole end prize if the fallback pot was paid instead,
    // plus the unwon part of the schedule once every entry has been revealed (otherwise `withdraw`
    // releases it when they are, or 48 h after draw_at).
    let mut back: u64 = if fallback { d.end_prize_lamports } else { 0 };
    let release_instants = d.all_revealed();
    if release_instants {
        back = back.checked_add(d.instant_escrow_left()?).ok_or(DrawError::MathOverflow)?;
    }
    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.authority.to_account_info(),
        back,
    )?;

    let entry_key = ctx.accounts.winning_entry.key();
    let winner = ctx.accounts.winning_entry.owner;
    let d = &mut ctx.accounts.draw;
    d.house_lamports = if fallback { d.revenue.checked_sub(prize).ok_or(DrawError::MathOverflow)? } else { d.revenue };
    d.randomness = rnd;
    d.winning_pos = pos;
    d.winning_ticket = winning_ticket;
    d.winning_entry = entry_key;
    d.winner = winner;
    d.end_prize_paid = prize;
    d.settled_at = now;
    d.prize_paid = true;
    d.escrow_returned = true;
    d.instant_escrow_returned = release_instants;
    d.status = DrawStatus::Settled;

    emit!(DrawSettled {
        draw: draw_key,
        winning_pos: pos,
        winning_ticket,
        winning_entry: entry_key,
        winner,
        end_prize_paid: prize,
        fallback,
    });
    Ok(())
}
