use anchor_lang::prelude::*;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::state::NetworkState;
use orao_solana_vrf::CONFIG_ACCOUNT_SEED;

use crate::constants::{CANCEL_REASON_NO_TICKETS, CONFIG_SEED, DRAW_SEED, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::{DrawCancelled, DrawRequested};
use crate::fairness::draw_vrf_seed;
use crate::state::{Config, DrawStatus, DrawV4, Vault};
use crate::utils::{now, pay_from_vault};
use crate::vrf::request_randomness;

/// Due at `draw_at`. Keeper/authority only during `[draw_at, draw_at + public_grace_secs)`, anyone after.
/// With no tickets at all the draw is cancelled here and the whole escrow returns to the authority.
#[derive(Accounts)]
pub struct RequestDraw<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, Config>>,

    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV4>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    /// CHECK: receives the escrow back if the draw is cancelled here.
    #[account(mut, address = draw.authority @ DrawError::Unauthorized)]
    pub authority: UncheckedAccount<'info>,

    /// Pays the ORAO fee; must be the keeper or the authority during the grace window.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: ORAO randomness PDA for the draw seed; checked in `request_randomness`, created by the CPI.
    /// Not needed when the draw is cancelled here (no tickets).
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

pub fn handler(ctx: Context<RequestDraw>, client_nonce: [u8; 16]) -> Result<()> {
    let now = now()?;
    let draw_key = ctx.accounts.draw.key();
    {
        let d = &ctx.accounts.draw;
        require!(d.status == DrawStatus::Open, DrawError::WrongStatus);
        // draw_at >= closes_at, so sales are necessarily closed too.
        require!(now >= d.draw_at, DrawError::DrawNotDue);
        let public_from = d
            .draw_at
            .checked_add(d.public_grace_secs as i64)
            .ok_or(DrawError::MathOverflow)?;
        if now < public_from {
            let payer = ctx.accounts.payer.key();
            require!(payer == ctx.accounts.config.keeper || payer == d.authority, DrawError::Unauthorized);
        }
    }

    if ctx.accounts.draw.next_pos == 0 {
        // Nothing sold: the whole escrow (end prize + schedule total, nothing paid out) goes straight back.
        let d = &ctx.accounts.draw;
        let escrow = d
            .end_prize_lamports
            .checked_add(d.instant_escrow_left()?)
            .ok_or(DrawError::MathOverflow)?;
        pay_from_vault(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.authority.to_account_info(),
            escrow,
        )?;
        let d = &mut ctx.accounts.draw;
        d.escrow_returned = true;
        d.instant_escrow_returned = true;
        d.status = DrawStatus::Cancelled;
        emit!(DrawCancelled { draw: draw_key, reason: CANCEL_REASON_NO_TICKETS });
        return Ok(());
    }

    let (Some(request), Some(network_state), Some(treasury), Some(vrf)) = (
        &ctx.accounts.vrf_request,
        &ctx.accounts.vrf_config,
        &ctx.accounts.vrf_treasury,
        &ctx.accounts.vrf,
    ) else {
        return err!(DrawError::VrfWrongAccount);
    };
    let total_tickets = ctx.accounts.draw.next_pos;
    let seed = draw_vrf_seed(&draw_key, total_tickets, &client_nonce);
    let req = request_randomness(
        &ctx.accounts.payer.to_account_info(),
        request,
        network_state,
        treasury,
        vrf,
        &ctx.accounts.system_program.to_account_info(),
        seed,
    )?;

    let d = &mut ctx.accounts.draw;
    d.draw_vrf_request = req;
    d.draw_vrf_seed = seed;
    d.status = DrawStatus::Drawing;

    emit!(DrawRequested { draw: draw_key, vrf_request: req, total_tickets });
    Ok(())
}
