use anchor_lang::prelude::*;

use crate::constants::{DRAW_SEED, ENTRY_SEED, PLAYER_SEED};
use crate::errors::DrawError;
use crate::events::FreeEntryClaimed;
use crate::state::{Draw, DrawStatus, Entry, Player};
use crate::utils::now;

#[derive(Accounts)]
pub struct ClaimFreeEntry<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, Draw>>,

    #[account(
        init,
        payer = buyer,
        space = 8 + Entry::INIT_SPACE,
        seeds = [ENTRY_SEED, draw.key().as_ref(), &draw.entry_count.to_le_bytes()],
        bump
    )]
    pub entry: Box<Account<'info, Entry>>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Player::INIT_SPACE,
        seeds = [PLAYER_SEED, draw.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub player: Box<Account<'info, Player>>,

    /// The claiming wallet (pays rent; becomes the entry owner).
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimFreeEntry>) -> Result<()> {
    let now = now()?;
    let draw_key = ctx.accounts.draw.key();
    let buyer_key = ctx.accounts.buyer.key();

    let d = &ctx.accounts.draw;
    require!(d.status == DrawStatus::Open, DrawError::WrongStatus);
    require!(now < d.closes_at, DrawError::SalesClosed);
    require!(d.free_tickets < d.free_cap, DrawError::FreeCapReached);
    require!(!ctx.accounts.player.free_claimed, DrawError::FreeAlreadyClaimed);
    let new_player = ctx.accounts.player.tickets.checked_add(1).ok_or(DrawError::MathOverflow)?;
    require!(new_player <= d.max_per_wallet, DrawError::ExceedsWalletCap);
    let seq = d.entry_count;
    let ticket = d.next_ticket;

    let player = &mut ctx.accounts.player;
    if player.wallet == Pubkey::default() {
        player.draw = draw_key;
        player.wallet = buyer_key;
        player.bump = ctx.bumps.player;
    }
    player.tickets = new_player;
    player.free_claimed = true;

    let entry_key = ctx.accounts.entry.key();
    let e = &mut ctx.accounts.entry;
    e.draw = draw_key;
    e.owner = buyer_key;
    e.seq = seq;
    e.first_ticket = ticket;
    e.count = 1;
    e.is_free = true;
    e.paid_lamports = 0;
    e.created_at = now;
    e.vrf_request = Pubkey::default();
    e.vrf_seed = [0u8; 32];
    e.revealed = true; // grand draw only: no instant roll
    e.tiers = [0u8; 25];
    e.instant_paid = 0;
    e.refunded = false;
    e.bump = ctx.bumps.entry;

    let d = &mut ctx.accounts.draw;
    d.free_tickets = d.free_tickets.checked_add(1).ok_or(DrawError::MathOverflow)?;
    d.next_ticket = d.next_ticket.checked_add(1).ok_or(DrawError::MathOverflow)?;
    d.entry_count = d.entry_count.checked_add(1).ok_or(DrawError::MathOverflow)?;

    emit!(FreeEntryClaimed { draw: draw_key, entry: entry_key, owner: buyer_key, ticket });
    Ok(())
}
