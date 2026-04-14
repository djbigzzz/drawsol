use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::errors::DrawError;

#[derive(Accounts)]
pub struct ClaimFreeEntry<'info> {
    #[account(
        mut,
        seeds = [DRAW_STATE_SEED, &[draw_state.draw_number]],
        bump = draw_state.bump,
        constraint = draw_state.status == DrawStatus::Open @ DrawError::DrawNotOpen,
    )]
    pub draw_state: Account<'info, DrawState>,

    /// Free entry tracker — one per wallet per draw
    #[account(
        init,
        payer = claimer,
        space = 8 + 1, // discriminator + bool
        seeds = [FREE_ENTRY_SEED, &[draw_state.draw_number], claimer.key().as_ref()],
        bump,
    )]
    /// CHECK: This is just a marker PDA; if it already exists, init will fail
    pub free_entry_marker: UncheckedAccount<'info>,

    /// The ticket issued for the free entry
    #[account(
        init,
        payer = claimer,
        space = Ticket::LEN,
        seeds = [TICKET_SEED, &[draw_state.draw_number], &draw_state.tickets_sold.to_le_bytes()],
        bump,
    )]
    pub ticket: Account<'info, Ticket>,

    #[account(mut)]
    pub claimer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimFreeEntry>) -> Result<()> {
    let draw_state = &mut ctx.accounts.draw_state;
    let ticket = &mut ctx.accounts.ticket;
    let clock = Clock::get()?;

    // Check ticket cap
    require!(
        draw_state.tickets_sold < draw_state.ticket_cap,
        DrawError::TicketsSoldOut
    );

    // Initialize ticket as free entry
    ticket.owner = ctx.accounts.claimer.key();
    ticket.slot_number = draw_state.tickets_sold;
    ticket.timestamp = clock.unix_timestamp;
    ticket.free_entry = true;
    ticket.instant_win_amount = 0;
    ticket.instant_win_resolved = true; // No VRF for free entries
    ticket.draw_number = draw_state.draw_number;
    ticket.bump = ctx.bumps.ticket;

    // Increment tickets sold
    draw_state.tickets_sold = draw_state
        .tickets_sold
        .checked_add(1)
        .ok_or(DrawError::ArithmeticOverflow)?;

    msg!(
        "DrawSol: Free entry claimed by {}. Ticket #{}",
        ctx.accounts.claimer.key(),
        ticket.slot_number,
    );

    Ok(())
}
