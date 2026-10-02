use anchor_lang::prelude::*;


/// seeds = [b"entry", draw.key(), seq.to_le_bytes()] where seq = draw.entry_count at creation.
#[account]
#[derive(InitSpace)]
pub struct Entry {
    pub draw: Pubkey,
    pub owner: Pubkey,
    pub seq: u32,
    pub first_ticket: u32,
    pub count: u16,
    pub is_free: bool,
    pub paid_lamports: u64,
    pub created_at: i64,
    /// ORAO randomness request PDA (default for free entries)
    pub vrf_request: Pubkey,
    pub vrf_seed: [u8; 32],
    /// free entries are created revealed (no instant roll)
    pub revealed: bool,
    /// per ticket: 0 = no win, 1..=4 = tier index + 1
    pub tiers: [u8; 25],
    pub instant_paid: u64,
    pub refunded: bool,
    pub bump: u8,
}

impl Entry {
    pub fn contains(&self, ticket: u32) -> bool {
        ticket >= self.first_ticket && (ticket - self.first_ticket) < self.count as u32
    }
}
