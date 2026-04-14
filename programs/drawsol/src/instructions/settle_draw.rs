use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::state::*;
use crate::constants::*;
use crate::errors::DrawError;

#[derive(Accounts)]
pub struct SettleDraw<'info> {
    #[account(
        mut,
        seeds = [DRAW_STATE_SEED, &[draw_state.draw_number]],
        bump = draw_state.bump,
        constraint = draw_state.status == DrawStatus::Drawing @ DrawError::DrawNotDrawing,
    )]
    pub draw_state: Account<'info, DrawState>,

    #[account(
        mut,
        seeds = [PRIZE_ESCROW_SEED, &[draw_state.draw_number]],
        bump = draw_state.escrow_bump,
    )]
    /// CHECK: Prize escrow PDA, validated by seeds
    pub prize_escrow: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, &[draw_state.draw_number]],
        bump = draw_state.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// The winning ticket, used to determine the winner
    pub winning_ticket: Account<'info, Ticket>,

    /// CHECK: Winner wallet, receives the SOL prize
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,

    /// CHECK: Operator wallet, receives remaining USDC
    #[account(
        mut,
        constraint = operator_wallet.key() == draw_state.operator @ DrawError::UnauthorizedOperator,
    )]
    pub operator_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = operator_token_account.owner == draw_state.operator,
        constraint = operator_token_account.mint == draw_state.usdc_mint,
    )]
    pub operator_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SettleDraw>, randomness: [u8; 32]) -> Result<()> {
    // Read values we need before mutable borrow
    let draw_number = ctx.accounts.draw_state.draw_number;
    let state_bump = ctx.accounts.draw_state.bump;
    let _escrow_bump = ctx.accounts.draw_state.escrow_bump;
    let tickets_sold = ctx.accounts.draw_state.tickets_sold;

    // Select winner: randomness % tickets_sold
    let random_value = u64::from_le_bytes(randomness[0..8].try_into().unwrap());
    let winning_index = (random_value % tickets_sold as u64) as u32;

    // Verify the winning ticket matches
    let winning_ticket = &ctx.accounts.winning_ticket;
    require!(
        winning_ticket.slot_number == winning_index,
        DrawError::InvalidVrfResult
    );
    require!(
        winning_ticket.owner == ctx.accounts.winner.key(),
        DrawError::InvalidVrfResult
    );

    // Transfer SOL from prize escrow to winner
    let escrow_balance = ctx.accounts.prize_escrow.lamports();
    **ctx.accounts.prize_escrow.try_borrow_mut_lamports()? -= escrow_balance;
    **ctx.accounts.winner.try_borrow_mut_lamports()? += escrow_balance;

    // Sweep remaining USDC from vault to operator
    let vault_balance = ctx.accounts.vault.amount;
    if vault_balance > 0 {
        let state_seeds = &[
            DRAW_STATE_SEED,
            &[draw_number],
            &[state_bump],
        ];
        let state_signer = &[&state_seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.operator_token_account.to_account_info(),
                authority: ctx.accounts.draw_state.to_account_info(),
            },
            state_signer,
        );
        token::transfer(transfer_ctx, vault_balance)?;
    }

    // Update draw state
    let draw_state = &mut ctx.accounts.draw_state;
    draw_state.winner = Some(ctx.accounts.winner.key());
    draw_state.status = DrawStatus::Settled;

    msg!(
        "DrawSol: Draw #{} settled! Winner: {} (ticket #{}).",
        draw_number,
        ctx.accounts.winner.key(),
        winning_index,
    );

    Ok(())
}
