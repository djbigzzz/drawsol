use anchor_lang::prelude::*;


#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum DrawStatus {
    Open,
    Drawing,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default, InitSpace)]
pub struct IwTier {
    /// lamports paid per winning ticket
    pub amount: u64,
    /// winning outcomes out of `iw_denominator`
    pub odds: u32,
}

/// seeds = [b"draw", id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct Draw {
    pub id: u64,
    /// admin at creation; receives proceeds / leftovers
    pub authority: Pubkey,
    pub status: DrawStatus,
    /// lamports
    pub ticket_price: u64,
    /// paid tickets
    pub ticket_cap: u32,
    pub max_per_tx: u16,
    /// includes the free entry
    pub max_per_wallet: u32,
    /// max free tickets (separate from ticket_cap)
    pub free_cap: u32,
    pub created_at: i64,
    pub closes_at: i64,
    pub prize_lamports: u64,
    /// escrowed instant-win budget
    pub iw_reserve_lamports: u64,
    pub iw_paid_lamports: u64,
    pub iw_denominator: u32,
    pub iw_tiers: [IwTier; 4],
    /// sum of paid ticket revenue
    pub proceeds_lamports: u64,
    pub refunded_lamports: u64,
    pub paid_tickets: u32,
    pub free_tickets: u32,
    /// paid + free; ticket numbers are 0..next_ticket
    pub next_ticket: u32,
    pub entry_count: u32,
    pub paid_entries: u32,
    /// paid entries revealed
    pub revealed_entries: u32,
    /// default until request_draw
    pub draw_vrf_request: Pubkey,
    pub draw_vrf_seed: [u8; 32],
    /// copied at settlement for audit
    pub randomness: [u8; 64],
    pub winning_ticket: u32,
    pub winning_entry: Pubkey,
    pub winner: Pubkey,
    pub settled_at: i64,
    pub prize_paid: bool,
    pub proceeds_withdrawn: bool,
    pub reserve_withdrawn: bool,
    /// sha256 of the published terms + skill question + odds
    pub terms_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
}

impl Draw {
    pub fn iw_remaining(&self) -> u64 {
        self.iw_reserve_lamports.saturating_sub(self.iw_paid_lamports)
    }
}
