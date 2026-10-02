use anchor_lang::prelude::*;

/// seeds = [b"entry3", draw.key(), seq.to_le_bytes()] where seq = draw.entry_count at creation.
#[account]
#[derive(InitSpace)]
pub struct EntryV3 {
    pub draw: Pubkey,
    pub owner: Pubkey,
    pub seq: u32,
    pub first_ticket: u32,
    /// paid + credit (+1 for a free entry)
    pub count: u16,
    pub paid_count: u16,
    pub credit_count: u16,
    pub is_free: bool,
    pub paid_lamports: u64,
    pub created_at: i64,
    /// pot draws: `instant_pool_lamports` right after this purchase's contribution
    pub pool_snapshot: u64,
    /// ORAO randomness request PDA (default when the entry has no roll)
    pub vrf_request: Pubkey,
    pub vrf_seed: [u8; 32],
    pub needs_reveal: bool,
    pub revealed: bool,
    /// per ticket: 0 = no win, 1..=4 = tier index + 1
    pub tiers: [u8; 25],
    /// instant SOL actually paid
    pub sol_paid: u64,
    pub credits_won: u32,
    pub refunded: bool,
    pub bump: u8,
}

impl EntryV3 {
    pub fn contains(&self, ticket: u32) -> bool {
        ticket >= self.first_ticket && (ticket - self.first_ticket) < self.count as u32
    }
}
