use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::DrawError;
use crate::events::DrawCreated;
use crate::state::{Config, DrawKind, DrawStatus, DrawV3, IwTierV3, VaultV3};
use crate::utils::{deposit_to_vault, now};

/// Parameters shared by both draw kinds.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CommonDrawParams {
    pub ticket_price: u64,
    pub ticket_cap: u32,
    pub max_per_tx: u16,
    pub max_per_wallet: u32,
    pub free_cap: u32,
    pub closes_at: i64,
    pub draw_at: i64,
    pub public_grace_secs: u32,
    pub house_bps: u16,
    pub terms_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PotDrawParams {
    pub common: CommonDrawParams,
    pub pot_bps: u16,
    pub instant_bps: u16,
    /// 0 = no instant wins (all tiers must then be unused)
    pub iw_denominator: u32,
    pub iw_tiers: [IwTierV3; 4],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct HeadlineDrawParams {
    pub common: CommonDrawParams,
    pub prize_lamports: u64,
    pub min_tickets: u32,
    pub floor_margin_bps: u16,
}

impl CommonDrawParams {
    pub fn validate(&self, now: i64) -> Result<()> {
        require!(self.ticket_price > 0, DrawError::InvalidParams);
        require!(self.ticket_cap > 0, DrawError::InvalidParams);
        require!(self.max_per_tx >= 1 && self.max_per_tx <= MAX_PER_TX, DrawError::InvalidParams);
        require!(self.max_per_wallet >= 1, DrawError::InvalidParams);
        require!(self.closes_at > now, DrawError::InvalidParams);
        require!(self.draw_at >= self.closes_at, DrawError::InvalidParams);
        require!(self.public_grace_secs <= PUBLIC_GRACE_MAX, DrawError::InvalidParams);
        require!(
            self.house_bps >= HOUSE_BPS_MIN && self.house_bps <= HOUSE_BPS_MAX,
            DrawError::InvalidParams
        );
        // full sell-out revenue must be representable
        self.ticket_price
            .checked_mul(self.ticket_cap as u64)
            .ok_or(DrawError::InvalidParams)?;
        Ok(())
    }
}

impl PotDrawParams {
    pub fn validate(&self, now: i64) -> Result<()> {
        self.common.validate(now)?;
        let sum = self.common.house_bps as u64 + self.pot_bps as u64 + self.instant_bps as u64;
        require!(sum == BPS, DrawError::InvalidParams);
        require!(self.pot_bps >= POT_BPS_MIN, DrawError::InvalidParams);

        let mut odds_sum: u64 = 0;
        // Σ(odds × credits) over credit tiers: expected credits per ticket × denominator
        let mut credit_ev: u64 = 0;
        for t in self.iw_tiers.iter() {
            match t.kind {
                TIER_NONE => require!(t.odds == 0 && t.value == 0, DrawError::InvalidParams),
                TIER_SOL_SHARE => require!(
                    t.odds > 0 && t.value > 0 && t.value <= SOL_SHARE_MAX_BPS,
                    DrawError::InvalidParams
                ),
                TIER_CREDITS => require!(
                    t.odds > 0 && t.value > 0 && t.value <= CREDITS_TIER_MAX,
                    DrawError::InvalidParams
                ),
                _ => return err!(DrawError::InvalidParams),
            }
            odds_sum = odds_sum.checked_add(t.odds as u64).ok_or(DrawError::MathOverflow)?;
            if t.kind == TIER_CREDITS {
                credit_ev = credit_ev
                    .checked_add((t.odds as u64).checked_mul(t.value as u64).ok_or(DrawError::MathOverflow)?)
                    .ok_or(DrawError::MathOverflow)?;
            }
        }
        // A credit ticket must win back less than one ticket on average, or credits could compound forever.
        require!(self.iw_denominator == 0 || credit_ev < self.iw_denominator as u64, DrawError::InvalidParams);
        if self.iw_denominator == 0 {
            require!(odds_sum == 0, DrawError::InvalidParams);
        } else {
            require!(odds_sum > 0 && odds_sum <= self.iw_denominator as u64, DrawError::InvalidParams);
        }
        Ok(())
    }
}

impl HeadlineDrawParams {
    pub fn validate(&self, now: i64) -> Result<()> {
        let c = &self.common;
        c.validate(now)?;
        require!(self.prize_lamports > 0, DrawError::InvalidParams);
        require!(self.min_tickets >= 1 && self.min_tickets <= c.ticket_cap, DrawError::InvalidParams);
        require!(self.floor_margin_bps >= FLOOR_MARGIN_BPS_MIN, DrawError::InvalidParams);
        let price = c.ticket_price as u128;
        let prize = self.prize_lamports as u128;
        let bps = BPS as u128;
        // house >= house_bps at sell-out: cap × price × (1e4 − house_bps) ≥ prize × 1e4
        let sellout = (c.ticket_cap as u128)
            .checked_mul(price)
            .and_then(|v| v.checked_mul(bps - c.house_bps as u128))
            .ok_or(DrawError::MathOverflow)?;
        require!(sellout >= prize.checked_mul(bps).ok_or(DrawError::MathOverflow)?, DrawError::InvalidParams);
        // margin at the minimum: min × price × 1e4 ≥ prize × (1e4 + floor_margin_bps)
        let at_min = (self.min_tickets as u128)
            .checked_mul(price)
            .and_then(|v| v.checked_mul(bps))
            .ok_or(DrawError::MathOverflow)?;
        let need = prize
            .checked_mul(bps + self.floor_margin_bps as u128)
            .ok_or(DrawError::MathOverflow)?;
        require!(at_min >= need, DrawError::InvalidParams);
        Ok(())
    }
}

fn init_common(d: &mut DrawV3, id: u64, authority: Pubkey, kind: DrawKind, c: &CommonDrawParams, now: i64) {
    d.id = id;
    d.authority = authority;
    d.kind = kind;
    d.status = DrawStatus::Open;
    d.ticket_price = c.ticket_price;
    d.ticket_cap = c.ticket_cap;
    d.max_per_tx = c.max_per_tx;
    d.max_per_wallet = c.max_per_wallet;
    d.free_cap = c.free_cap;
    d.created_at = now;
    d.closes_at = c.closes_at;
    d.draw_at = c.draw_at;
    d.public_grace_secs = c.public_grace_secs;
    d.house_bps = c.house_bps;
    d.terms_hash = c.terms_hash;
    // every other field is zero/default from `init`
}

// ---------------------------------------------------------------- pot

#[derive(Accounts)]
pub struct CreatePotDraw<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = creator.key() == config.admin || creator.key() == config.keeper @ DrawError::Unauthorized,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        init,
        payer = creator,
        space = 8 + DrawV3::INIT_SPACE,
        seeds = [DRAW_SEED, &config.next_draw_id.to_le_bytes()],
        bump
    )]
    pub draw: Box<Account<'info, DrawV3>>,

    #[account(init, payer = creator, space = 8 + VaultV3::INIT_SPACE, seeds = [VAULT_SEED, draw.key().as_ref()], bump)]
    pub vault: Account<'info, VaultV3>,

    /// Admin or keeper; pays rent only (no escrow).
    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_pot_draw_handler(ctx: Context<CreatePotDraw>, params: PotDrawParams) -> Result<()> {
    let now = now()?;
    params.validate(now)?;

    let config = &mut ctx.accounts.config;
    let id = config.next_draw_id;
    config.next_draw_id = id.checked_add(1).ok_or(DrawError::MathOverflow)?;
    let authority = config.admin;

    let draw_key = ctx.accounts.draw.key();
    let d = &mut ctx.accounts.draw;
    init_common(d, id, authority, DrawKind::Pot, &params.common, now);
    d.pot_bps = params.pot_bps;
    d.instant_bps = params.instant_bps;
    d.iw_denominator = params.iw_denominator;
    d.iw_tiers = params.iw_tiers;
    d.bump = ctx.bumps.draw;
    d.vault_bump = ctx.bumps.vault;

    emit!(DrawCreated {
        draw: draw_key,
        id,
        kind: DrawKind::Pot,
        creator: ctx.accounts.creator.key(),
        ticket_price: d.ticket_price,
        ticket_cap: d.ticket_cap,
        closes_at: d.closes_at,
        draw_at: d.draw_at,
        house_bps: d.house_bps,
        pot_bps: d.pot_bps,
        instant_bps: d.instant_bps,
        prize_lamports: 0,
        min_tickets: 0,
    });
    Ok(())
}

// ---------------------------------------------------------------- headline

#[derive(Accounts)]
pub struct CreateHeadlineDraw<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ DrawError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,

    #[account(
        init,
        payer = admin,
        space = 8 + DrawV3::INIT_SPACE,
        seeds = [DRAW_SEED, &config.next_draw_id.to_le_bytes()],
        bump
    )]
    pub draw: Box<Account<'info, DrawV3>>,

    #[account(init, payer = admin, space = 8 + VaultV3::INIT_SPACE, seeds = [VAULT_SEED, draw.key().as_ref()], bump)]
    pub vault: Account<'info, VaultV3>,

    /// Pays rent and escrows the prize.
    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_headline_draw_handler(ctx: Context<CreateHeadlineDraw>, params: HeadlineDrawParams) -> Result<()> {
    let now = now()?;
    params.validate(now)?;

    deposit_to_vault(
        &ctx.accounts.admin.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        params.prize_lamports,
    )?;

    let config = &mut ctx.accounts.config;
    let id = config.next_draw_id;
    config.next_draw_id = id.checked_add(1).ok_or(DrawError::MathOverflow)?;
    let authority = config.admin;

    let draw_key = ctx.accounts.draw.key();
    let d = &mut ctx.accounts.draw;
    init_common(d, id, authority, DrawKind::Headline, &params.common, now);
    d.prize_lamports = params.prize_lamports;
    d.min_tickets = params.min_tickets;
    d.floor_margin_bps = params.floor_margin_bps;
    d.bump = ctx.bumps.draw;
    d.vault_bump = ctx.bumps.vault;

    emit!(DrawCreated {
        draw: draw_key,
        id,
        kind: DrawKind::Headline,
        creator: ctx.accounts.admin.key(),
        ticket_price: d.ticket_price,
        ticket_cap: d.ticket_cap,
        closes_at: d.closes_at,
        draw_at: d.draw_at,
        house_bps: d.house_bps,
        pot_bps: 0,
        instant_bps: 0,
        prize_lamports: d.prize_lamports,
        min_tickets: d.min_tickets,
    });
    Ok(())
}
