use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::DrawError;
use crate::events::DrawCreated;
use crate::state::{Config, DrawStatus, DrawV4, Pool, Schedule, Tier, Vault};
use crate::utils::now;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TierParams {
    /// prize per winning number, lamports (0 = unused tier)
    pub amount: u64,
    /// winning numbers of this tier
    pub count: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateDrawParams {
    pub ticket_price: u64,
    pub ticket_cap: u32,
    pub max_per_tx: u16,
    pub max_per_wallet: u32,
    pub free_cap: u32,
    pub closes_at: i64,
    pub draw_at: i64,
    pub public_grace_secs: u32,
    pub house_bps: u16,
    pub pot_bps: u16,
    pub instant_bps: u16,
    pub end_prize_lamports: u64,
    pub min_tickets: u32,
    pub tiers: [TierParams; 8],
    pub terms_hash: [u8; 32],
}

impl CreateDrawParams {
    /// Σ amount × count over the tiers (checked).
    pub fn schedule_total(&self) -> Result<u64> {
        let mut total: u64 = 0;
        for t in self.tiers.iter() {
            let v = t.amount.checked_mul(t.count as u64).ok_or(DrawError::MathOverflow)?;
            total = total.checked_add(v).ok_or(DrawError::MathOverflow)?;
        }
        Ok(total)
    }

    /// Initial size of the Schedule account: the full `cap` bytes when that fits one allocation,
    /// otherwise the 10 KB maximum (`init_pool` grows it in steps).
    pub fn schedule_initial_len(&self) -> usize {
        (SCHEDULE_BYTES_OFFSET + self.ticket_cap as usize).min(REALLOC_STEP)
    }

    pub fn validate(&self, now: i64) -> Result<()> {
        require!(self.ticket_price > 0, DrawError::InvalidParams);
        require!(self.ticket_cap >= 1 && self.ticket_cap <= TICKET_CAP_MAX, DrawError::InvalidParams);
        require!(self.max_per_tx >= 1 && self.max_per_tx <= MAX_PER_TX, DrawError::InvalidParams);
        require!(self.max_per_wallet >= 1, DrawError::InvalidParams);
        require!(self.closes_at > now, DrawError::InvalidParams);
        require!(self.draw_at >= self.closes_at, DrawError::InvalidParams);
        require!(self.public_grace_secs <= PUBLIC_GRACE_MAX, DrawError::InvalidParams);
        // full sell-out revenue must be representable
        self.ticket_price
            .checked_mul(self.ticket_cap as u64)
            .ok_or(DrawError::InvalidParams)?;
        let mut count: u32 = 0;
        for t in self.tiers.iter() {
            require!((t.amount == 0) == (t.count == 0), DrawError::InvalidParams);
            count = count.checked_add(t.count as u32).ok_or(DrawError::MathOverflow)?;
        }
        require!(count <= self.ticket_cap, DrawError::InvalidParams);
        // the escrow must be representable
        self.end_prize_lamports
            .checked_add(self.schedule_total()?)
            .ok_or(DrawError::InvalidParams)?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(params: CreateDrawParams)]
pub struct CreateDraw<'info> {
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
        space = 8 + DrawV4::INIT_SPACE,
        seeds = [DRAW_SEED, &config.next_draw_id.to_le_bytes()],
        bump
    )]
    pub draw: Box<Account<'info, DrawV4>>,

    #[account(init, payer = creator, space = 8 + Vault::INIT_SPACE, seeds = [VAULT_SEED, draw.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,

    /// Header only (`remaining = 0`); `init_pool` grows and fills it.
    #[account(init, payer = creator, space = POOL_NUMBERS_OFFSET, seeds = [POOL_SEED, draw.key().as_ref()], bump)]
    pub pool: Account<'info, Pool>,

    /// Zeroed; full size when `8 + cap ≤ 10 KB`, else grown by `init_pool`.
    #[account(
        init,
        payer = creator,
        space = params.schedule_initial_len(),
        seeds = [SCHEDULE_SEED, draw.key().as_ref()],
        bump
    )]
    pub schedule: Account<'info, Schedule>,

    /// Admin or keeper; pays rent only (the escrow comes from the authority at `open_draw`).
    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateDraw>, params: CreateDrawParams) -> Result<()> {
    let now = now()?;
    params.validate(now)?;
    let schedule_total = params.schedule_total()?;

    let config = &mut ctx.accounts.config;
    let id = config.next_draw_id;
    config.next_draw_id = id.checked_add(1).ok_or(DrawError::MathOverflow)?;
    let authority = config.admin;

    let draw_key = ctx.accounts.draw.key();
    let d = &mut ctx.accounts.draw;
    d.id = id;
    d.authority = authority;
    d.status = DrawStatus::Draft;
    d.ticket_price = params.ticket_price;
    d.ticket_cap = params.ticket_cap;
    d.max_per_tx = params.max_per_tx;
    d.max_per_wallet = params.max_per_wallet;
    d.free_cap = params.free_cap;
    d.created_at = now;
    d.closes_at = params.closes_at;
    d.draw_at = params.draw_at;
    d.public_grace_secs = params.public_grace_secs;
    d.house_bps = params.house_bps;
    d.pot_bps = params.pot_bps;
    d.instant_bps = params.instant_bps;
    d.end_prize_lamports = params.end_prize_lamports;
    d.min_tickets = params.min_tickets;
    for (i, t) in params.tiers.iter().enumerate() {
        d.tiers[i] = Tier { amount: t.amount, count: t.count, set: 0, won: 0 };
    }
    d.schedule_total_lamports = schedule_total;
    d.terms_hash = params.terms_hash;
    d.bump = ctx.bumps.draw;
    d.vault_bump = ctx.bumps.vault;
    d.pool_bump = ctx.bumps.pool;
    d.schedule_bump = ctx.bumps.schedule;
    // every other field is zero/default from `init`
    d.check_profitability()?;

    emit!(DrawCreated {
        draw: draw_key,
        id,
        creator: ctx.accounts.creator.key(),
        ticket_price: d.ticket_price,
        ticket_cap: d.ticket_cap,
        closes_at: d.closes_at,
        draw_at: d.draw_at,
        house_bps: d.house_bps,
        pot_bps: d.pot_bps,
        instant_bps: d.instant_bps,
        end_prize_lamports: d.end_prize_lamports,
        min_tickets: d.min_tickets,
        schedule_total_lamports: schedule_total,
    });
    Ok(())
}
