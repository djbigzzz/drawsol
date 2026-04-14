use anchor_lang::prelude::*;

use crate::state::*;
use crate::constants::*;
use crate::errors::DrawError;

#[derive(Accounts)]
pub struct TriggerGrandDraw<'info> {
    #[account(
        mut,
        seeds = [DRAW_STATE_SEED, &[draw_state.draw_number]],
        bump = draw_state.bump,
        constraint = draw_state.status == DrawStatus::ThresholdMet @ DrawError::DrawNotThresholdMet,
    )]
    pub draw_state: Account<'info, DrawState>,

    #[account(
        mut,
        seeds = [PRIZE_ESCROW_SEED, &[draw_state.draw_number]],
        bump = draw_state.escrow_bump,
    )]
    /// CHECK: Prize escrow is a native SOL PDA, validated by seeds
    pub prize_escrow: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

/// For the hackathon demo, we mock the Jupiter swap.
/// The operator manually deposits 100 SOL into the prize escrow.
/// In production, this would CPI into Jupiter to swap USDC → SOL.
pub fn handler(ctx: Context<TriggerGrandDraw>) -> Result<()> {
    let draw_state = &mut ctx.accounts.draw_state;

    // Transfer 100 SOL from payer to prize escrow
    let transfer_ix = anchor_lang::system_program::Transfer {
        from: ctx.accounts.payer.to_account_info(),
        to: ctx.accounts.prize_escrow.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        transfer_ix,
    );
    anchor_lang::system_program::transfer(cpi_ctx, GRAND_PRIZE_LAMPORTS)?;

    // Update status to Drawing
    draw_state.status = DrawStatus::Drawing;

    msg!(
        "DrawSol: Grand draw triggered! 100 SOL locked in escrow. Status: Drawing"
    );

    Ok(())
}
