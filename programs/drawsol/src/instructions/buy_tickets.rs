use anchor_lang::prelude::*;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::state::NetworkState;
use orao_solana_vrf::CONFIG_ACCOUNT_SEED;

use crate::constants::{DRAW_SEED, ENTRY_SEED, MAX_PER_TX, PLAYER_SEED, PROFILE_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::TicketsPurchased;
use crate::fairness::entry_vrf_seed;
use crate::state::{DrawStatus, DrawV4, EntryV4, PlayerV4, Profile, Vault};
use crate::utils::{deposit_to_vault, now};
use crate::vrf::request_randomness;

#[derive(Accounts)]
#[instruction(quantity: u16)]
pub struct BuyTickets<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV4>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    /// Sized from `quantity` (tickets + prizes vectors). Clamped to MAX_PER_TX so an oversized quantity
    /// fails with `ExceedsPerTx` in the handler rather than with the allocator's size limit.
    #[account(
        init,
        payer = buyer,
        space = EntryV4::space(quantity.min(MAX_PER_TX)),
        seeds = [ENTRY_SEED, draw.key().as_ref(), &draw.entry_count.to_le_bytes()],
        bump
    )]
    pub entry: Box<Account<'info, EntryV4>>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + PlayerV4::INIT_SPACE,
        seeds = [PLAYER_SEED, draw.key().as_ref(), buyer.key().as_ref()],
        bump
    )]
    pub player: Box<Account<'info, PlayerV4>>,

    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Profile::INIT_SPACE,
        seeds = [PROFILE_SEED, buyer.key().as_ref()],
        bump
    )]
    pub profile: Box<Account<'info, Profile>>,

    /// Pays the tickets, the ORAO fee and rent; becomes the entry owner.
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: ORAO randomness PDA for the seed this handler derives; checked in `request_randomness`
    /// and created by the ORAO CPI (`init`, so never reused).
    #[account(mut)]
    pub vrf_request: UncheckedAccount<'info>,

    #[account(mut, seeds = [CONFIG_ACCOUNT_SEED], bump, seeds::program = orao_solana_vrf::ID)]
    pub vrf_config: Box<Account<'info, NetworkState>>,

    /// CHECK: ORAO fee treasury, checked against the network state in `request_randomness`.
    #[account(mut)]
    pub vrf_treasury: UncheckedAccount<'info>,

    pub vrf: Program<'info, OraoVrf>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<BuyTickets>, quantity: u16, client_nonce: [u8; 16]) -> Result<()> {
    let now = now()?;
    let draw_key = ctx.accounts.draw.key();
    let buyer_key = ctx.accounts.buyer.key();

    // ---- draw / wallet checks
    let (seq, first_pos, cost) = {
        let d = &ctx.accounts.draw;
        require!(d.status == DrawStatus::Open, DrawError::WrongStatus);
        require!(now < d.closes_at, DrawError::SalesClosed);
        require!(quantity >= 1 && quantity <= d.max_per_tx, DrawError::ExceedsPerTx);
        // every ticket takes one of the cap numbers
        let new_pos = d.next_pos.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
        require!(new_pos <= d.ticket_cap, DrawError::SoldOut);
        let new_player = ctx.accounts.player.tickets
            .checked_add(quantity as u32)
            .ok_or(DrawError::MathOverflow)?;
        require!(new_player <= d.max_per_wallet, DrawError::ExceedsWalletCap);
        let cost = d.ticket_price.checked_mul(quantity as u64).ok_or(DrawError::MathOverflow)?;
        (d.entry_count, d.next_pos, cost)
    };

    // ---- profile: self-exclusion, spend limit
    {
        let bump = ctx.bumps.profile;
        let pr = &mut ctx.accounts.profile;
        pr.ensure_init(buyer_key, bump);
        pr.check_not_excluded(now)?;
        pr.spend(now, cost)?;
    }

    deposit_to_vault(
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        cost,
    )?;

    let seed = entry_vrf_seed(&draw_key, &buyer_key, seq, &client_nonce);
    let vrf_request = request_randomness(
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.vrf_request,
        &ctx.accounts.vrf_config,
        &ctx.accounts.vrf_treasury,
        &ctx.accounts.vrf,
        &ctx.accounts.system_program.to_account_info(),
        seed,
    )?;

    let player_bump = ctx.bumps.player;
    let p = &mut ctx.accounts.player;
    if p.wallet == Pubkey::default() {
        p.draw = draw_key;
        p.wallet = buyer_key;
        p.bump = player_bump;
    }
    p.tickets = p.tickets.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
    p.paid = p.paid.checked_add(cost).ok_or(DrawError::MathOverflow)?;

    let entry_key = ctx.accounts.entry.key();
    let entry_bump = ctx.bumps.entry;
    let e = &mut ctx.accounts.entry;
    e.draw = draw_key;
    e.owner = buyer_key;
    e.seq = seq;
    e.first_pos = first_pos;
    e.count = quantity;
    e.is_free = false;
    e.paid_lamports = cost;
    e.created_at = now;
    e.vrf_request = vrf_request;
    e.vrf_seed = seed;
    e.bump = entry_bump;

    let d = &mut ctx.accounts.draw;
    d.revenue = d.revenue.checked_add(cost).ok_or(DrawError::MathOverflow)?;
    d.paid_tickets = d.paid_tickets.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
    d.next_pos = d.next_pos.checked_add(quantity as u32).ok_or(DrawError::MathOverflow)?;
    d.entry_count = d.entry_count.checked_add(1).ok_or(DrawError::MathOverflow)?;

    emit!(TicketsPurchased {
        draw: draw_key,
        entry: entry_key,
        owner: buyer_key,
        seq,
        first_pos,
        count: quantity,
        paid_lamports: cost,
        revenue_lamports: d.revenue,
    });
    Ok(())
}
