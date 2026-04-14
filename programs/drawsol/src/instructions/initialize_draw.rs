use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(draw_number: u8)]
pub struct InitializeDraw<'info> {
    #[account(
        init,
        payer = operator,
        space = DrawState::LEN,
        seeds = [DRAW_STATE_SEED, &[draw_number]],
        bump,
    )]
    pub draw_state: Account<'info, DrawState>,

    #[account(
        init,
        payer = operator,
        token::mint = usdc_mint,
        token::authority = draw_state,
        seeds = [VAULT_SEED, &[draw_number]],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PRIZE_ESCROW_SEED, &[draw_number]],
        bump,
    )]
    /// CHECK: Prize escrow is a native SOL account, validated by seeds
    pub prize_escrow: UncheckedAccount<'info>,

    pub usdc_mint: Account<'info, Mint>,

    #[account(mut)]
    pub operator: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeDraw>,
    draw_number: u8,
    ticket_cap: u32,
    skill_answer_hash: [u8; 32],
) -> Result<()> {
    let draw_state = &mut ctx.accounts.draw_state;

    draw_state.ticket_cap = ticket_cap;
    draw_state.tickets_sold = 0;
    draw_state.usdc_collected = 0;
    draw_state.sol_price_usd = 0;
    draw_state.threshold_usdc = 0;
    draw_state.status = DrawStatus::Open;
    draw_state.operator = ctx.accounts.operator.key();
    draw_state.winner = None;
    draw_state.draw_number = draw_number;
    draw_state.vault_bump = ctx.bumps.vault;
    draw_state.escrow_bump = ctx.bumps.prize_escrow;
    draw_state.bump = ctx.bumps.draw_state;
    draw_state.skill_answer_hash = skill_answer_hash;
    draw_state.usdc_mint = ctx.accounts.usdc_mint.key();

    msg!("DrawSol: Draw #{} initialized with cap {}", draw_number, ticket_cap);
    Ok(())
}
