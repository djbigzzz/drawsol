use anchor_lang::prelude::*;

/// seeds = [b"player", draw.key(), wallet]
#[account]
#[derive(InitSpace)]
pub struct Player {
    pub draw: Pubkey,
    pub wallet: Pubkey,
    /// paid + free
    pub tickets: u32,
    pub spent: u64,
    /// instant wins paid
    pub won: u64,
    pub free_claimed: bool,
    pub bump: u8,
}
