use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::*;
use crate::constants::*;
use crate::errors::DrawError;

#[derive(Accounts)]
pub struct ProcessPayout<'info> {
    #[account(
        seeds = [DRAW_STATE_SEED, &[draw_state.draw_number]],
        bump = draw_state.bump,
    )]
    pub draw_state: Account<'info, DrawState>,

    #[account(
        mut,
        seeds = [PENDING_PAYOUT_SEED, &[pending_payout.draw_number], &pending_payout.slot_number.to_le_bytes()],
        bump = pending_payout.bump,
        constraint = !pending_payout.paid @ DrawError::PayoutAlreadyPaid,
    )]
    pub pending_payout: Account<'info, PendingPayout>,

    #[account(
        mut,
        seeds = [VAULT_SEED, &[draw_state.draw_number]],
        bump = draw_state.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Winner's USDC token account
    #[account(
        mut,
        constraint = winner_token_account.owner == pending_payout.winner,
        constraint = winner_token_account.mint == draw_state.usdc_mint,
    )]
    pub winner_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ProcessPayout>) -> Result<()> {
    let pending_payout = &mut ctx.accounts.pending_payout;
    let draw_state = &ctx.accounts.draw_state;

    // Check that payout is due
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= pending_payout.due_timestamp,
        DrawError::PayoutNotDue
    );

    // Transfer USDC from vault to winner
    let draw_number = draw_state.draw_number;
    let state_bump = draw_state.bump;
    let seeds = &[
        DRAW_STATE_SEED,
        &[draw_number],
        &[state_bump],
    ];
    let signer = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.winner_token_account.to_account_info(),
            authority: ctx.accounts.draw_state.to_account_info(),
        },
        signer,
    );
    token::transfer(transfer_ctx, pending_payout.amount)?;

    // Mark as paid
    pending_payout.paid = true;

    msg!(
        "DrawSol: Payout processed. {} USDC sent to {}",
        pending_payout.amount,
        pending_payout.winner
    );

    Ok(())
}
