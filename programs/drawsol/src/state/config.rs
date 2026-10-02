use anchor_lang::prelude::*;

/// seeds = [b"config"]
///
/// v3 layout. The v2 layout was `admin, next_draw_id, bump` (8 + 41 bytes, same discriminator);
/// `migrate_config` reallocs a v2 Config into this layout.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Low-trust automation key: may create pot draws and request draws during the public-grace window.
    pub keeper: Pubkey,
    pub next_draw_id: u64,
    pub bump: u8,
}

/// Size of the v2 Config account (discriminator included).
pub const CONFIG_V2_LEN: usize = 8 + 32 + 8 + 1;
