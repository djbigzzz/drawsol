use anchor_lang::prelude::*;

/// seeds = [b"player3", draw.key(), wallet]
#[account]
#[derive(InitSpace)]
pub struct PlayerV3 {
    pub draw: Pubkey,
    pub wallet: Pubkey,
    /// all kinds (paid + credit + free)
    pub tickets: u32,
    /// lamports paid for tickets
    pub paid: u64,
    pub won_sol: u64,
    pub won_credits: u32,
    pub free_claimed: bool,
    pub bump: u8,
}

/// seeds = [b"vault3", draw.key()]. Program-owned, no fields: its lamports are everything the draw holds.
/// Debited directly by the program; it always stays rent-exempt.
#[account]
#[derive(InitSpace)]
pub struct VaultV3 {}
