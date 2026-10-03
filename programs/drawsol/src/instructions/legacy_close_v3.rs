use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, LEGACY_V3_DRAW_SEED, LEGACY_V3_VAULT_SEED};
use crate::errors::DrawError;
use crate::events::LegacyClosed;
use crate::state::Config;
use crate::utils::close_raw;

/// `sha256("account:DrawV3")[..8]` — the v3 `DrawV3` discriminator.
pub const V3_DRAW_DISCRIMINATOR: [u8; 8] = [0xce, 0x5a, 0xd7, 0x49, 0x8e, 0x94, 0xde, 0xb4];
/// `sha256("account:VaultV3")[..8]` — the v3 `VaultV3` discriminator.
pub const V3_VAULT_DISCRIMINATOR: [u8; 8] = [0xb8, 0x09, 0x87, 0x9d, 0x03, 0x1d, 0x5d, 0xd3];
/// 8 + DrawV3::INIT_SPACE of the v3 program.
pub const V3_DRAW_LEN: usize = 483;

/// Byte offsets of the v3 `DrawV3` fields this instruction reads (SPEC-v3 §2.2 layout, Borsh, after the
/// 8-byte discriminator).
pub mod v3_offsets {
    pub const ID: usize = 8;
    pub const KIND: usize = 48;
    pub const STATUS: usize = 49;
    pub const HOUSE_LAMPORTS: usize = 136;
    pub const HOUSE_WITHDRAWN: usize = 144;
    pub const REVENUE_LAMPORTS: usize = 152;
    pub const REFUNDED_LAMPORTS: usize = 160;
    pub const NEXT_TICKET: usize = 220;
    pub const ENTRY_COUNT: usize = 224;
    pub const PRIZE_PAID: usize = 448;
}
pub const V3_KIND_HEADLINE: u8 = 1;
pub const V3_STATUS_SETTLED: u8 = 2;
pub const V3_STATUS_CANCELLED: u8 = 3;

/// Closable v3 draws: zero entries (any status; an Open draw's escrow is simply all the vault holds),
/// Settled with the prize paid and the house share fully withdrawn, or Cancelled with every paid lamport
/// refunded (and a headline prize already returned). Every lamport of the draw and vault goes to the admin.
#[derive(Accounts)]
#[instruction(draw_id: u64)]
pub struct LegacyCloseV3<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ DrawError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,

    /// Receives every lamport of the v3 draw and vault.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: v3 `DrawV3` PDA, parsed by raw bytes (owner, discriminator, length and id checked in the handler).
    #[account(mut, seeds = [LEGACY_V3_DRAW_SEED, &draw_id.to_le_bytes()], bump)]
    pub legacy_draw: UncheckedAccount<'info>,

    /// CHECK: v3 `VaultV3` PDA of that draw (owner and discriminator checked in the handler).
    #[account(mut, seeds = [LEGACY_V3_VAULT_SEED, legacy_draw.key().as_ref()], bump)]
    pub legacy_vault: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<LegacyCloseV3>, draw_id: u64) -> Result<()> {
    use v3_offsets::*;
    let draw = ctx.accounts.legacy_draw.to_account_info();
    let vault = ctx.accounts.legacy_vault.to_account_info();
    require_keys_eq!(*draw.owner, crate::ID, DrawError::NotLegacyAccount);
    require_keys_eq!(*vault.owner, crate::ID, DrawError::NotLegacyAccount);
    {
        let v = vault.try_borrow_data()?;
        require!(v.len() == 8 && v[..8] == V3_VAULT_DISCRIMINATOR, DrawError::NotLegacyAccount);

        let d = draw.try_borrow_data()?;
        require!(d.len() == V3_DRAW_LEN && d[..8] == V3_DRAW_DISCRIMINATOR, DrawError::NotLegacyAccount);
        let u32_at = |o: usize| u32::from_le_bytes(d[o..o + 4].try_into().unwrap());
        let u64_at = |o: usize| u64::from_le_bytes(d[o..o + 8].try_into().unwrap());
        require!(u64_at(ID) == draw_id, DrawError::NotLegacyAccount);

        let empty = u32_at(ENTRY_COUNT) == 0 && u32_at(NEXT_TICKET) == 0;
        let settled = d[STATUS] == V3_STATUS_SETTLED
            && d[PRIZE_PAID] == 1
            && u64_at(HOUSE_WITHDRAWN) == u64_at(HOUSE_LAMPORTS);
        let cancelled = d[STATUS] == V3_STATUS_CANCELLED
            && u64_at(REFUNDED_LAMPORTS) == u64_at(REVENUE_LAMPORTS)
            && (d[KIND] != V3_KIND_HEADLINE || d[PRIZE_PAID] == 1);
        require!(empty || settled || cancelled, DrawError::LegacyNotClosable);
    }

    let admin = ctx.accounts.admin.to_account_info();
    let amount = close_raw(&vault, &admin)?
        .checked_add(close_raw(&draw, &admin)?)
        .ok_or(DrawError::MathOverflow)?;

    emit!(LegacyClosed { draw_id, draw: draw.key(), amount });
    Ok(())
}
