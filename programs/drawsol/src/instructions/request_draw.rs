use anchor_lang::prelude::*;
use orao_solana_vrf::cpi::accounts::RequestV2;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::state::NetworkState;
use orao_solana_vrf::CONFIG_ACCOUNT_SEED;

use crate::constants::{CANCEL_REASON_NO_TICKETS, DRAW_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::{DrawCancelled, DrawRequested};
use crate::fairness::{draw_vrf_seed, vrf_request_address};
use crate::state::{Draw, DrawStatus, Vault};
use crate::utils::{now, pay_from_vault};

/// Permissionless: anyone may run the draw once it is due (deadline passed or sold out).
#[derive(Accounts)]
pub struct RequestDraw<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, Draw>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    /// CHECK: receives prize + reserve back if no tickets were sold.
    #[account(mut, address = draw.authority @ DrawError::Unauthorized)]
    pub authority: UncheckedAccount<'info>,

    /// Pays the ORAO fee.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ORAO randomness PDA for the draw seed; checked in the handler, created by the CPI.
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

pub fn handler(ctx: Context<RequestDraw>, client_nonce: [u8; 16]) -> Result<()> {
    let now = now()?;
    let draw_key = ctx.accounts.draw.key();
    {
        let d = &ctx.accounts.draw;
        require!(d.status == DrawStatus::Open, DrawError::WrongStatus);
        require!(now >= d.closes_at || d.paid_tickets == d.ticket_cap, DrawError::SalesStillOpen);
    }

    if ctx.accounts.draw.next_ticket == 0 {
        // Nobody entered: return the escrow to the authority and cancel.
        let d = &ctx.accounts.draw;
        let refund = d
            .prize_lamports
            .checked_add(d.iw_reserve_lamports.checked_sub(d.iw_paid_lamports).ok_or(DrawError::MathOverflow)?)
            .ok_or(DrawError::MathOverflow)?;
        pay_from_vault(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.authority.to_account_info(),
            refund,
        )?;
        let d = &mut ctx.accounts.draw;
        d.prize_paid = true;
        d.reserve_withdrawn = true;
        d.status = DrawStatus::Cancelled;
        emit!(DrawCancelled { draw: draw_key, reason: CANCEL_REASON_NO_TICKETS });
        return Ok(());
    }

    let total_tickets = ctx.accounts.draw.next_ticket;
    let seed = draw_vrf_seed(&draw_key, total_tickets, &client_nonce);
    let expected_req = vrf_request_address(&seed);
    require_keys_eq!(ctx.accounts.vrf_request.key(), expected_req, DrawError::VrfWrongAccount);

    orao_solana_vrf::cpi::request_v2(
        CpiContext::new(
            ctx.accounts.vrf.to_account_info(),
            RequestV2 {
                payer: ctx.accounts.payer.to_account_info(),
                network_state: ctx.accounts.vrf_config.to_account_info(),
                treasury: ctx.accounts.vrf_treasury.to_account_info(),
                request: ctx.accounts.vrf_request.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
        ),
        seed,
    )?;

    let d = &mut ctx.accounts.draw;
    d.draw_vrf_request = expected_req;
    d.draw_vrf_seed = seed;
    d.status = DrawStatus::Drawing;

    emit!(DrawRequested { draw: draw_key, vrf_request: expected_req, total_tickets });
    Ok(())
}
