use anchor_lang::prelude::*;

/// seeds = [b"config"]
///
/// Unchanged since v3 (`admin, keeper, next_draw_id, bump`); devnet's account is already in this layout.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Low-trust automation key: may create draws, fill pools/schedules and request draws during the
    /// public-grace window. It never escrows money and never receives the house share.
    pub keeper: Pubkey,
    pub next_draw_id: u64,
    pub bump: u8,
}
