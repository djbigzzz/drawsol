use anchor_lang::prelude::*;

/// seeds = [b"entry4", draw.key(), seq.to_le_bytes()] where seq = draw.entry_count at creation.
/// Space is sized from `count` at purchase: `EntryV4::space(count)`.
///
/// Fixed-size fields come first (memcmp-friendly offsets: draw @8, owner @40, seq @72, first_pos @76,
/// count @80, is_free @82, ...); the two vectors are at the end.
#[account]
pub struct EntryV4 {
    pub draw: Pubkey,
    pub owner: Pubkey,
    pub seq: u32,
    /// positions first_pos .. first_pos + count belong to this entry (the end-prize draw picks a position)
    pub first_pos: u32,
    pub count: u16,
    pub is_free: bool,
    pub paid_lamports: u64,
    pub created_at: i64,
    /// ORAO randomness request PDA for this entry's ticket assignment
    pub vrf_request: Pubkey,
    pub vrf_seed: [u8; 32],
    pub revealed: bool,
    /// instant prizes paid to the owner at reveal
    pub instant_paid: u64,
    pub refunded: bool,
    pub bump: u8,
    /// ticket numbers, len == count once revealed (empty before)
    pub tickets: Vec<u32>,
    /// per ticket: 0 = no prize, t + 1 = tier t (len == count once revealed)
    pub prizes: Vec<u8>,
}

impl EntryV4 {
    pub const FIXED: usize = 32 + 32 + 4 + 4 + 2 + 1 + 8 + 8 + 32 + 32 + 1 + 8 + 1 + 1;

    /// Account size (discriminator included) for an entry of `count` tickets.
    pub fn space(count: u16) -> usize {
        8 + Self::FIXED + (4 + 4 * count as usize) + (4 + count as usize)
    }

    pub fn holds_pos(&self, pos: u32) -> bool {
        pos >= self.first_pos && (pos - self.first_pos) < self.count as u32
    }
}
