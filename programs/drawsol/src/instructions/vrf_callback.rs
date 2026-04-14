use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::errors::DrawError;

#[derive(Accounts)]
#[instruction(slot_number: u32)]
pub struct VrfCallback<'info> {
    #[account(
        mut,
        seeds = [DRAW_STATE_SEED, &[draw_state.draw_number]],
        bump = draw_state.bump,
    )]
    pub draw_state: Account<'info, DrawState>,

    #[account(
        mut,
        seeds = [TICKET_SEED, &[draw_state.draw_number], &slot_number.to_le_bytes()],
        bump = ticket.bump,
    )]
    pub ticket: Account<'info, Ticket>,

    #[account(
        init,
        payer = payer,
        space = PendingPayout::LEN,
        seeds = [PENDING_PAYOUT_SEED, &[draw_state.draw_number], &slot_number.to_le_bytes()],
        bump,
    )]
    pub pending_payout: Account<'info, PendingPayout>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<VrfCallback>,
    slot_number: u32,
    randomness: [u8; 32],
) -> Result<()> {
    let ticket = &mut ctx.accounts.ticket;
    let draw_state = &ctx.accounts.draw_state;

    // Ensure ticket hasn't already been resolved
    require!(!ticket.instant_win_resolved, DrawError::InvalidVrfResult);

    // Convert randomness to a number for prize table lookup
    let random_value = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
    let prize_index = random_value % PRIZE_TABLE_TOTAL;

    // Determine prize amount from prize table
    let prize_amount = if prize_index < PRIZE_TIER_50_END {
        PRIZE_50_USDC
    } else if prize_index < PRIZE_TIER_25_END {
        PRIZE_25_USDC
    } else if prize_index < PRIZE_TIER_10_END {
        PRIZE_10_USDC
    } else if prize_index < PRIZE_TIER_5_END {
        PRIZE_5_USDC
    } else {
        0
    };

    ticket.instant_win_amount = prize_amount;
    ticket.instant_win_resolved = true;

    // If winner, create pending payout
    if prize_amount > 0 {
        let pending_payout = &mut ctx.accounts.pending_payout;
        let clock = Clock::get()?;

        pending_payout.winner = ticket.owner;
        pending_payout.amount = prize_amount;
        pending_payout.due_timestamp = clock.unix_timestamp + PAYOUT_DELAY_SECONDS;
        pending_payout.paid = false;
        pending_payout.draw_number = draw_state.draw_number;
        pending_payout.slot_number = slot_number;
        pending_payout.bump = ctx.bumps.pending_payout;

        msg!(
            "DrawSol: Instant win! Ticket #{} wins {} USDC",
            slot_number,
            prize_amount
        );
    } else {
        msg!("DrawSol: Ticket #{} - no instant win", slot_number);
    }

    Ok(())
}
