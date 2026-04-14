use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::state::*;
use crate::constants::*;
use crate::errors::DrawError;

#[derive(Accounts)]
#[instruction(quantity: u32)]
pub struct BuyTickets<'info> {
    #[account(
        mut,
        seeds = [DRAW_STATE_SEED, &[draw_state.draw_number]],
        bump = draw_state.bump,
    )]
    pub draw_state: Account<'info, DrawState>,

    #[account(
        mut,
        seeds = [VAULT_SEED, &[draw_state.draw_number]],
        bump = draw_state.vault_bump,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// The first ticket PDA — additional tickets are created via remaining_accounts
    #[account(
        init,
        payer = buyer,
        space = Ticket::LEN,
        seeds = [TICKET_SEED, &[draw_state.draw_number], &draw_state.tickets_sold.to_le_bytes()],
        bump,
    )]
    pub ticket: Account<'info, Ticket>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == draw_state.usdc_mint,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub usdc_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<BuyTickets>,
    quantity: u32,
    skill_answer_hash: [u8; 32],
    sol_price_usd: u64,
) -> Result<()> {
    let draw_state = &mut ctx.accounts.draw_state;

    // Validate draw is open
    require!(draw_state.status == DrawStatus::Open, DrawError::DrawNotOpen);

    // Validate quantity
    require!(
        quantity >= 1 && quantity <= MAX_TICKETS_PER_PURCHASE,
        DrawError::InvalidQuantity
    );

    // Check ticket cap
    require!(
        draw_state.tickets_sold.checked_add(quantity).ok_or(DrawError::ArithmeticOverflow)?
            <= draw_state.ticket_cap,
        DrawError::ExceedsTicketCap
    );

    // Validate skill answer
    require!(
        skill_answer_hash == draw_state.skill_answer_hash,
        DrawError::IncorrectSkillAnswer
    );

    // Calculate price with bulk discount
    let discount_bps = get_discount_bps(quantity);
    let base_price = TICKET_PRICE_USDC
        .checked_mul(quantity as u64)
        .ok_or(DrawError::ArithmeticOverflow)?;
    let discount = base_price
        .checked_mul(discount_bps)
        .ok_or(DrawError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(DrawError::ArithmeticOverflow)?;
    let total_price = base_price
        .checked_sub(discount)
        .ok_or(DrawError::ArithmeticOverflow)?;

    // Transfer USDC from buyer to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, total_price)?;

    // Initialize first ticket
    let ticket = &mut ctx.accounts.ticket;
    let clock = Clock::get()?;
    ticket.owner = ctx.accounts.buyer.key();
    ticket.slot_number = draw_state.tickets_sold;
    ticket.timestamp = clock.unix_timestamp;
    ticket.free_entry = false;
    ticket.instant_win_amount = 0;
    ticket.instant_win_resolved = false;
    ticket.draw_number = draw_state.draw_number;
    ticket.bump = ctx.bumps.ticket;

    // Update draw state
    draw_state.tickets_sold = draw_state
        .tickets_sold
        .checked_add(quantity)
        .ok_or(DrawError::ArithmeticOverflow)?;
    draw_state.usdc_collected = draw_state
        .usdc_collected
        .checked_add(total_price)
        .ok_or(DrawError::ArithmeticOverflow)?;

    // Update SOL price and threshold
    draw_state.sol_price_usd = sol_price_usd;
    // threshold = sol_price * 100 * 1.5 = sol_price * 150
    // sol_price_usd is in 6 decimals (e.g., 126_000_000 = $126)
    // threshold in USDC lamports (6 decimals)
    draw_state.threshold_usdc = sol_price_usd
        .checked_mul(SOL_PURCHASE_AMOUNT)
        .ok_or(DrawError::ArithmeticOverflow)?
        .checked_mul(THRESHOLD_NUMERATOR)
        .ok_or(DrawError::ArithmeticOverflow)?
        .checked_div(THRESHOLD_DENOMINATOR)
        .ok_or(DrawError::ArithmeticOverflow)?;

    // Check if threshold is met
    if draw_state.usdc_collected >= draw_state.threshold_usdc && draw_state.threshold_usdc > 0 {
        draw_state.status = DrawStatus::ThresholdMet;
        msg!("DrawSol: Threshold met! USDC collected: {}", draw_state.usdc_collected);
    }

    msg!(
        "DrawSol: {} tickets purchased by {}. Total sold: {}",
        quantity,
        ctx.accounts.buyer.key(),
        draw_state.tickets_sold,
    );

    Ok(())
}

fn get_discount_bps(quantity: u32) -> u64 {
    if quantity >= DISCOUNT_TIER_3_MIN && quantity <= DISCOUNT_TIER_3_MAX {
        DISCOUNT_TIER_3_BPS
    } else if quantity >= DISCOUNT_TIER_2_MIN && quantity <= DISCOUNT_TIER_2_MAX {
        DISCOUNT_TIER_2_BPS
    } else if quantity >= DISCOUNT_TIER_1_MIN && quantity <= DISCOUNT_TIER_1_MAX {
        DISCOUNT_TIER_1_BPS
    } else {
        0
    }
}
