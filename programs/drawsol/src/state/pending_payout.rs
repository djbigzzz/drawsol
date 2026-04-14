use anchor_lang::prelude::*;

#[account]
pub struct PendingPayout {
    /// Winner wallet address
    pub winner: Pubkey,
    /// Amount in USDC (6 decimals)
    pub amount: u64,
    /// Timestamp when the payout becomes due
    pub due_timestamp: i64,
    /// Whether this payout has been processed
    pub paid: bool,
    /// Draw number
    pub draw_number: u8,
    /// Ticket slot number (for PDA derivation uniqueness)
    pub slot_number: u32,
    /// Bump seed
    pub bump: u8,
}

impl PendingPayout {
    pub const LEN: usize = 8 + // discriminator
        32 +  // winner
        8 +   // amount
        8 +   // due_timestamp
        1 +   // paid
        1 +   // draw_number
        4 +   // slot_number
        1 +   // bump
        16;   // padding
}
