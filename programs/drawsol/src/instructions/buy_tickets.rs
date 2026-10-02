use anchor_lang::prelude::*;
use orao_solana_vrf::cpi::accounts::RequestV2;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::state::NetworkState;
use orao_solana_vrf::CONFIG_ACCOUNT_SEED;

use crate::constants::{DRAW_SEED, ENTRY_SEED, PLAYER_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::TicketsPurchased;
use crate::fairness::{entry_vrf_seed, vrf_request_address};
use crate::state::{Draw, DrawStatus, Entry, Player, Vault};
use crate::utils::{deposit_to_vault, now};

#[derive(Accounts)]
pub struct BuyTickets<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, Draw>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

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

    /// Pays the tickets, the ORAO fee and rent; becomes the entry owner.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: ORAO randomness PDA for the seed this handler derives; checked against
    /// `vrf_request_address(seed)` in the handler and created by the ORAO CPI (`init`, so never reused).
    #[account(mut)]
    pub vrf_request: UncheckedAccount<'info>,

    #[account(mut, seeds = [CONFIG_ACCOUNT_SEED], bump, seeds::program = orao_solana_vrf::ID)]
    pub vrf_config: Box<Account<'info, NetworkState>>,

    /// CHECK: ORAO fee treasury, pinned to the one in ORAO's network state.
    #[account(mut, address = vrf_config.config.treasury)]
    pub vrf_treasury: UncheckedAccount<'info>,

    pub vrf: Program<'info, OraoVrf>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<BuyTickets>, quantity: u16, client_nonce: [u8; 16]) -> Result<()> {
    let now = now()?;
    let draw_key = ctx.accounts.draw.key();
    let buyer_key = ctx.accounts.buyer.key();

    let (seq, first_ticket, cost) = {
        let d = &ctx.accounts.draw;
        require!(d.status == DrawStatus::Open, DrawError::WrongStatus);
        require!(now < d.closes_at, DrawError::SalesClosed);
        require!(quantity >= 1 && quantity <= d.max_per_tx, DrawError::ExceedsPerTx);
        let new_paid = d.paid_tickets.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
        require!(new_paid <= d.ticket_cap, DrawError::SoldOut);
        let new_player = ctx.accounts.player.tickets
            .checked_add(quantity as u32)
            .ok_or(DrawError::MathOverflow)?;
        require!(new_player <= d.max_per_wallet, DrawError::ExceedsWalletCap);
        let cost = d.ticket_price.checked_mul(quantity as u64).ok_or(DrawError::MathOverflow)?;
        (d.entry_count, d.next_ticket, cost)
    };

    // Randomness seed is fixed by program state; the passed ORAO account must be its PDA.
    let seed = entry_vrf_seed(&draw_key, &buyer_key, seq, &client_nonce);
    let expected_req = vrf_request_address(&seed);
    require_keys_eq!(ctx.accounts.vrf_request.key(), expected_req, DrawError::VrfWrongAccount);

    deposit_to_vault(
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        cost,
    )?;

    orao_solana_vrf::cpi::request_v2(
        CpiContext::new(
            ctx.accounts.vrf.to_account_info(),
            RequestV2 {
                payer: ctx.accounts.buyer.to_account_info(),
                network_state: ctx.accounts.vrf_config.to_account_info(),
                treasury: ctx.accounts.vrf_treasury.to_account_info(),
                request: ctx.accounts.vrf_request.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
        ),
        seed,
    )?;

    let player = &mut ctx.accounts.player;
    if player.wallet == Pubkey::default() {
        player.draw = draw_key;
        player.wallet = buyer_key;
        player.bump = ctx.bumps.player;
    }
    player.tickets = player.tickets.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
    player.spent = player.spent.checked_add(cost).ok_or(DrawError::MathOverflow)?;

    let entry_key = ctx.accounts.entry.key();
    let e = &mut ctx.accounts.entry;
    e.draw = draw_key;
    e.owner = buyer_key;
    e.seq = seq;
    e.first_ticket = first_ticket;
    e.count = quantity;
    e.is_free = false;
    e.paid_lamports = cost;
    e.created_at = now;
    e.vrf_request = expected_req;
    e.vrf_seed = seed;
    e.revealed = false;
    e.tiers = [0u8; 25];
    e.instant_paid = 0;
    e.refunded = false;
    e.bump = ctx.bumps.entry;

    let d = &mut ctx.accounts.draw;
    d.paid_tickets = d.paid_tickets.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
    d.next_ticket = d.next_ticket.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
    d.entry_count = d.entry_count.checked_add(1).ok_or(DrawError::MathOverflow)?;
    d.paid_entries = d.paid_entries.checked_add(1).ok_or(DrawError::MathOverflow)?;
    d.proceeds_lamports = d.proceeds_lamports.checked_add(cost).ok_or(DrawError::MathOverflow)?;

    emit!(TicketsPurchased {
        draw: draw_key,
        entry: entry_key,
        owner: buyer_key,
        seq,
        first_ticket,
        count: quantity,
        paid_lamports: cost,
    });
    Ok(())
}
