use anchor_lang::prelude::*;

#[account]
pub struct Ticket {
    /// Owner of this ticket
    pub owner: Pubkey,
    /// Slot number within the draw (0-indexed)
    pub slot_number: u32,
    /// Timestamp of purchase
    pub timestamp: i64,
    /// Whether this is a free entry
    pub free_entry: bool,
    /// Instant win amount in USDC (0 if no win)
    pub instant_win_amount: u64,
    /// Whether the instant win has been resolved (VRF callback received)
    pub instant_win_resolved: bool,
    /// Draw number this ticket belongs to
    pub draw_number: u8,
    /// Bump seed
    pub bump: u8,
}

impl Ticket {
    pub const LEN: usize = 8 + // discriminator
        32 +  // owner
        4 +   // slot_number
        8 +   // timestamp
        1 +   // free_entry
        8 +   // instant_win_amount
        1 +   // instant_win_resolved
        1 +   // draw_number
        1 +   // bump
        16;   // padding
}
