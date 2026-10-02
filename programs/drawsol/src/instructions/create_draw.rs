use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, DRAW_SEED, MAX_PER_TX, VAULT_SEED};
use crate::errors::DrawError;
use crate::events::DrawCreated;
use crate::state::{Config, Draw, DrawStatus, IwTier, Vault};
use crate::utils::{deposit_to_vault, now};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct CreateDrawParams {
    pub ticket_price: u64,
    pub ticket_cap: u32,
    pub max_per_tx: u16,
    pub max_per_wallet: u32,
    pub free_cap: u32,
    pub closes_at: i64,
    pub prize_lamports: u64,
    pub iw_reserve_lamports: u64,
    pub iw_denominator: u32,
    pub iw_tiers: [IwTier; 4],
    pub terms_hash: [u8; 32],
}

impl CreateDrawParams {
    pub fn validate(&self, now: i64) -> Result<()> {
        require!(self.closes_at > now, DrawError::InvalidParams);
        require!(self.ticket_cap > 0, DrawError::InvalidParams);
        require!(self.max_per_tx >= 1 && self.max_per_tx <= MAX_PER_TX, DrawError::InvalidParams);
        require!(self.max_per_wallet >= 1, DrawError::InvalidParams);
        require!(self.prize_lamports > 0, DrawError::InvalidParams);
        require!(self.iw_denominator > 0, DrawError::InvalidParams);

        let mut odds_sum: u64 = 0;
        let mut expected_num: u128 = 0; // sum(amount * odds); expected payout = this / denominator
        for t in self.iw_tiers.iter() {
            // unused tiers must be {0,0}; a used tier needs both an amount and odds
            require!((t.amount == 0) == (t.odds == 0), DrawError::InvalidParams);
            odds_sum = odds_sum.checked_add(t.odds as u64).ok_or(DrawError::MathOverflow)?;
            expected_num = expected_num
                .checked_add((t.amount as u128).checked_mul(t.odds as u128).ok_or(DrawError::MathOverflow)?)
                .ok_or(DrawError::MathOverflow)?;
        }
        require!(odds_sum <= self.iw_denominator as u64, DrawError::InvalidParams);
        // expected instant payout per ticket < ticket_price
        let price_num = (self.ticket_price as u128)
            .checked_mul(self.iw_denominator as u128)
            .ok_or(DrawError::MathOverflow)?;
        require!(expected_num < price_num, DrawError::InvalidParams);
        // full sell-out revenue must be representable
        self.ticket_price
            .checked_mul(self.ticket_cap as u64)
            .ok_or(DrawError::MathOverflow)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateDraw<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ DrawError::Unauthorized)]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = 8 + Draw::INIT_SPACE,
        seeds = [DRAW_SEED, &config.next_draw_id.to_le_bytes()],
        bump
    )]
    pub draw: Box<Account<'info, Draw>>,

    #[account(init, payer = admin, space = 8 + Vault::INIT_SPACE, seeds = [VAULT_SEED, draw.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateDraw>, params: CreateDrawParams) -> Result<()> {
    let now = now()?;
    params.validate(now)?;

    let escrow = params
        .prize_lamports
        .checked_add(params.iw_reserve_lamports)
        .ok_or(DrawError::MathOverflow)?;
    deposit_to_vault(
        &ctx.accounts.admin.to_account_info(),
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        escrow,
    )?;

    let config = &mut ctx.accounts.config;
    let id = config.next_draw_id;
    config.next_draw_id = id.checked_add(1).ok_or(DrawError::MathOverflow)?;

    let draw_key = ctx.accounts.draw.key();
    let d = &mut ctx.accounts.draw;
    d.id = id;
    d.authority = ctx.accounts.admin.key();
    d.status = DrawStatus::Open;
    d.ticket_price = params.ticket_price;
    d.ticket_cap = params.ticket_cap;
    d.max_per_tx = params.max_per_tx;
    d.max_per_wallet = params.max_per_wallet;
    d.free_cap = params.free_cap;
    d.created_at = now;
    d.closes_at = params.closes_at;
    d.prize_lamports = params.prize_lamports;
    d.iw_reserve_lamports = params.iw_reserve_lamports;
    d.iw_paid_lamports = 0;
    d.iw_denominator = params.iw_denominator;
    d.iw_tiers = params.iw_tiers;
    d.terms_hash = params.terms_hash;
    d.bump = ctx.bumps.draw;
    d.vault_bump = ctx.bumps.vault;
    // every other field is zero/default from `init`

    emit!(DrawCreated {
        draw: draw_key,
        id,
        prize_lamports: d.prize_lamports,
        iw_reserve_lamports: d.iw_reserve_lamports,
        ticket_price: d.ticket_price,
        ticket_cap: d.ticket_cap,
        closes_at: d.closes_at,
    });
    Ok(())
}
