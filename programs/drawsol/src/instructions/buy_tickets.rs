use anchor_lang::prelude::*;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::state::NetworkState;
use orao_solana_vrf::CONFIG_ACCOUNT_SEED;

use crate::constants::{DRAW_SEED, ENTRY_SEED, PLAYER_SEED, PROFILE_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::TicketsPurchased;
use crate::fairness::entry_vrf_seed;
use crate::state::{DrawKind, DrawStatus, DrawV3, EntryV3, PlayerV3, Profile, VaultV3};
use crate::utils::{deposit_to_vault, now, split_payment};
use crate::vrf::request_randomness;

#[derive(Accounts)]
pub struct BuyTickets<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV3>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, VaultV3>,

    #[account(
        init,
        payer = buyer,
        space = 8 + EntryV3::INIT_SPACE,
        seeds = [ENTRY_SEED, draw.key().as_ref(), &draw.entry_count.to_le_bytes()],
        bump
    )]
    pub entry: Box<Account<'info, EntryV3>>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + PlayerV3::INIT_SPACE,
        seeds = [PLAYER_SEED, draw.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub player: Box<Account<'info, PlayerV3>>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Profile::INIT_SPACE,
        seeds = [PROFILE_SEED, buyer.key().as_ref()],
        bump
    )]
    pub profile: Box<Account<'info, Profile>>,

    /// Pays the tickets, the ORAO fee (pot draws) and rent; becomes the entry owner.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: pot draws with instant tiers only: ORAO randomness PDA for the seed this handler derives;
    /// checked in `request_randomness` and created by the ORAO CPI (`init`, so never reused).
    #[account(mut)]
    pub vrf_request: Option<UncheckedAccount<'info>>,

    #[account(mut, seeds = [CONFIG_ACCOUNT_SEED], bump, seeds::program = orao_solana_vrf::ID)]
    pub vrf_config: Option<Box<Account<'info, NetworkState>>>,

    /// CHECK: ORAO fee treasury, checked against the network state in `request_randomness`.
    #[account(mut)]
    pub vrf_treasury: Option<UncheckedAccount<'info>>,

    pub vrf: Option<Program<'info, OraoVrf>>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<BuyTickets>, quantity: u16, use_credits: u16, client_nonce: [u8; 16]) -> Result<()> {
    let now = now()?;
    let draw_key = ctx.accounts.draw.key();
    let buyer_key = ctx.accounts.buyer.key();

    // ---- draw / wallet checks
    let (seq, first_ticket, paid, cost) = {
        let d = &ctx.accounts.draw;
        require!(d.status == DrawStatus::Open, DrawError::WrongStatus);
        require!(now < d.closes_at, DrawError::SalesClosed);
        require!(!d.sold_out(), DrawError::SoldOut);
        require!(quantity >= 1 && quantity <= d.max_per_tx, DrawError::ExceedsPerTx);
        require!(use_credits <= quantity, DrawError::InvalidParams);
        let paid = quantity - use_credits;
        let new_paid = d.paid_tickets.checked_add(paid as u32).ok_or(DrawError::MathOverflow)?;
        require!(new_paid <= d.ticket_cap, DrawError::SoldOut);
        let new_player = ctx.accounts.player.tickets
            .checked_add(quantity as u32)
            .ok_or(DrawError::MathOverflow)?;
        require!(new_player <= d.max_per_wallet, DrawError::ExceedsWalletCap);
        let cost = d.ticket_price.checked_mul(paid as u64).ok_or(DrawError::MathOverflow)?;
        (d.entry_count, d.next_ticket, paid, cost)
    };

    // ---- profile: self-exclusion, credits, spend limit (paid amounts only)
    {
        let bump = ctx.bumps.profile;
        let pr = &mut ctx.accounts.profile;
        pr.ensure_init(buyer_key, bump);
        pr.check_not_excluded(now)?;
        pr.credits = pr
            .credits
            .checked_sub(use_credits as u32)
            .ok_or(DrawError::InsufficientCredits)?;
        pr.spend(now, cost)?;
    }

    deposit_to_vault(
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        cost,
    )?;

    // ---- money split
    {
        let d = &mut ctx.accounts.draw;
        d.revenue_lamports = d.revenue_lamports.checked_add(cost).ok_or(DrawError::MathOverflow)?;
        if d.kind == DrawKind::Pot {
            let (house, instant, pot) = split_payment(cost, d.house_bps, d.instant_bps)?;
            d.house_lamports = d.house_lamports.checked_add(house).ok_or(DrawError::MathOverflow)?;
            d.instant_pool_lamports = d.instant_pool_lamports.checked_add(instant).ok_or(DrawError::MathOverflow)?;
            d.pot_lamports = d.pot_lamports.checked_add(pot).ok_or(DrawError::MathOverflow)?;
        }
        // Headline: everything stays in revenue_lamports; the house share is fixed at settlement.
    }

    // ---- instant roll (pot draws with tiers only)
    let needs_reveal = ctx.accounts.draw.needs_roll();
    let (vrf_request, vrf_seed) = if needs_reveal {
        let seed = entry_vrf_seed(&draw_key, &buyer_key, seq, &client_nonce);
        let req = request_randomness(
            &ctx.accounts.buyer.to_account_info(),
            &ctx.accounts.vrf_request,
            &ctx.accounts.vrf_config,
            &ctx.accounts.vrf_treasury,
            &ctx.accounts.vrf,
            &ctx.accounts.system_program.to_account_info(),
            seed,
        )?;
        (req, seed)
    } else {
        (Pubkey::default(), [0u8; 32])
    };

    let player_bump = ctx.bumps.player;
    let p = &mut ctx.accounts.player;
    if p.wallet == Pubkey::default() {
        p.draw = draw_key;
        p.wallet = buyer_key;
        p.bump = player_bump;
    }
    p.tickets = p.tickets.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
    p.paid = p.paid.checked_add(cost).ok_or(DrawError::MathOverflow)?;

    let pool_snapshot = ctx.accounts.draw.instant_pool_lamports;
    let entry_key = ctx.accounts.entry.key();
    let entry_bump = ctx.bumps.entry;
    let e = &mut ctx.accounts.entry;
    e.draw = draw_key;
    e.owner = buyer_key;
    e.seq = seq;
    e.first_ticket = first_ticket;
    e.count = quantity;
    e.paid_count = paid;
    e.credit_count = use_credits;
    e.is_free = false;
    e.paid_lamports = cost;
    e.created_at = now;
    e.pool_snapshot = pool_snapshot;
    e.vrf_request = vrf_request;
    e.vrf_seed = vrf_seed;
    e.needs_reveal = needs_reveal;
    e.bump = entry_bump;

    let d = &mut ctx.accounts.draw;
    d.paid_tickets = d.paid_tickets.checked_add(paid as u32).ok_or(DrawError::MathOverflow)?;
    d.credit_tickets = d.credit_tickets.checked_add(use_credits as u32).ok_or(DrawError::MathOverflow)?;
    d.next_ticket = d.next_ticket.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
    d.entry_count = d.entry_count.checked_add(1).ok_or(DrawError::MathOverflow)?;
    if needs_reveal {
        d.rolled_entries = d.rolled_entries.checked_add(1).ok_or(DrawError::MathOverflow)?;
    }

    emit!(TicketsPurchased {
        draw: draw_key,
        entry: entry_key,
        owner: buyer_key,
        seq,
        first_ticket,
        count: quantity,
        paid_count: paid,
        credit_count: use_credits,
        paid_lamports: cost,
        pot_lamports: d.pot_lamports,
        instant_pool_lamports: d.instant_pool_lamports,
    });
    Ok(())
}
