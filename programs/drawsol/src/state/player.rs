use anchor_lang::prelude::*;

/// seeds = [b"player4", draw.key(), wallet]
#[account]
#[derive(InitSpace)]
pub struct PlayerV4 {
    pub draw: Pubkey,
    pub wallet: Pubkey,
    /// all kinds (paid + free)
    pub tickets: u32,
    /// lamports paid for tickets
    pub paid: u64,
    /// instant prizes received
    pub won_lamports: u64,
    pub free_claimed: bool,
    pub bump: u8,
}

/// seeds = [b"vault4", draw.key()]. Program-owned, no fields: its lamports are everything the draw holds.
/// Debited directly by the program; it always stays rent-exempt.
#[account]
#[derive(InitSpace)]
pub struct Vault {}

/// seeds = [b"pool", draw.key()]. Raw layout after the discriminator: `remaining: u32` then
/// `u32[ticket_cap]` ticket numbers. Filled 0..cap by `init_pool`; `reveal_entry` swap-removes from
/// `[..remaining]`. Accessed by raw bytes (never deserialised) — this type only names the discriminator.
#[account]
#[derive(InitSpace)]
pub struct Pool {}

/// seeds = [b"schedule", draw.key()]. Raw layout after the discriminator: `u8[ticket_cap]`,
/// `0` = no prize, `1..=8` = tier index + 1, bit 7 = that number's prize has been won.
#[account]
#[derive(InitSpace)]
pub struct Schedule {}
