use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, LEGACY_DRAW_SEED, LEGACY_VAULT_SEED};
use crate::errors::DrawError;
use crate::events::LegacyClosed;
use crate::state::Config;
use crate::utils::close_raw;

/// `sha256("account:Draw")[..8]` — the v2 `Draw` discriminator.
pub const V2_DRAW_DISCRIMINATOR: [u8; 8] = [0xe1, 0x83, 0x29, 0xde, 0x7a, 0x14, 0x92, 0xca];
/// `sha256("account:Vault")[..8]` — the v2 `Vault` discriminator.
pub const V2_VAULT_DISCRIMINATOR: [u8; 8] = [0xd3, 0x08, 0xe8, 0x2b, 0x02, 0x98, 0x75, 0x77];
/// 8 + Draw::INIT_SPACE of the v2 program.
pub const V2_DRAW_LEN: usize = 444;

/// Byte offsets of the v2 `Draw` fields this instruction reads (SPEC.md §2.2 layout, Borsh, after the
/// 8-byte discriminator): id u64 @8, authority @16, status u8 @48, ..., next_ticket u32 @187,
/// entry_count u32 @191, ..., prize_paid @407, proceeds_withdrawn @408, reserve_withdrawn @409.
pub mod v2_offsets {
    pub const ID: usize = 8;
    pub const STATUS: usize = 48;
    pub const NEXT_TICKET: usize = 187;
    pub const ENTRY_COUNT: usize = 191;
    pub const PRIZE_PAID: usize = 407;
    pub const PROCEEDS_WITHDRAWN: usize = 408;
    pub const RESERVE_WITHDRAWN: usize = 409;
}
const V2_STATUS_SETTLED: u8 = 2;

#[derive(Accounts)]
#[instruction(draw_id: u64)]
pub struct LegacyCloseV2<'info> {
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ DrawError::Unauthorized)]
    pub config: Box<Account<'info, Config>>,

    /// Receives every lamport of the v2 draw and vault.
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: v2 `Draw` PDA, parsed by raw bytes (owner, discriminator, length and id checked in the handler).
    #[account(mut, seeds = [LEGACY_DRAW_SEED, &draw_id.to_le_bytes()], bump)]
    pub legacy_draw: UncheckedAccount<'info>,

    /// CHECK: v2 `Vault` PDA of that draw (owner and discriminator checked in the handler).
    #[account(mut, seeds = [LEGACY_VAULT_SEED, legacy_draw.key().as_ref()], bump)]
    pub legacy_vault: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<LegacyCloseV2>, draw_id: u64) -> Result<()> {
    use v2_offsets::*;
    let draw = ctx.accounts.legacy_draw.to_account_info();
    let vault = ctx.accounts.legacy_vault.to_account_info();
    require_keys_eq!(*draw.owner, crate::ID, DrawError::NotLegacyAccount);
    require_keys_eq!(*vault.owner, crate::ID, DrawError::NotLegacyAccount);
    {
        let v = vault.try_borrow_data()?;
        require!(v.len() == 8 && v[..8] == V2_VAULT_DISCRIMINATOR, DrawError::NotLegacyAccount);

        let d = draw.try_borrow_data()?;
        require!(d.len() == V2_DRAW_LEN && d[..8] == V2_DRAW_DISCRIMINATOR, DrawError::NotLegacyAccount);
        let u32_at = |o: usize| u32::from_le_bytes(d[o..o + 4].try_into().unwrap());
        let id = u64::from_le_bytes(d[ID..ID + 8].try_into().unwrap());
        require!(id == draw_id, DrawError::NotLegacyAccount);

        let empty = u32_at(ENTRY_COUNT) == 0 && u32_at(NEXT_TICKET) == 0;
        let finished = d[STATUS] == V2_STATUS_SETTLED
            && d[PRIZE_PAID] == 1
            && d[PROCEEDS_WITHDRAWN] == 1
            && d[RESERVE_WITHDRAWN] == 1;
        require!(empty || finished, DrawError::LegacyNotClosable);
    }

    let admin = ctx.accounts.admin.to_account_info();
    let amount = close_raw(&vault, &admin)?
        .checked_add(close_raw(&draw, &admin)?)
        .ok_or(DrawError::MathOverflow)?;

    emit!(LegacyClosed { draw_id, draw: draw.key(), amount });
    Ok(())
}
