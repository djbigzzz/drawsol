use anchor_lang::prelude::*;

#[event]
pub struct DrawCreated {
    pub draw: Pubkey,
    pub id: u64,
    pub creator: Pubkey,
    pub ticket_price: u64,
    pub ticket_cap: u32,
    pub closes_at: i64,
    pub draw_at: i64,
    pub house_bps: u16,
    pub pot_bps: u16,
    pub instant_bps: u16,
    pub end_prize_lamports: u64,
    pub min_tickets: u32,
    pub schedule_total_lamports: u64,
}

#[event]
pub struct PoolInitialised {
    pub draw: Pubkey,
    pub from: u32,
    pub to: u32,
}

#[event]
pub struct ScheduleSet {
    pub draw: Pubkey,
    /// winning numbers registered so far
    pub schedule_set: u32,
}

#[event]
pub struct DrawOpened {
    pub draw: Pubkey,
    /// sha256 of the `ticket_cap` schedule bytes (tier index + 1 per number, 0 = no prize) at opening
    pub schedule_hash: [u8; 32],
    /// end prize + schedule total, escrowed by the authority
    pub escrow_lamports: u64,
}

#[event]
pub struct TicketsPurchased {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub seq: u32,
    pub first_pos: u32,
    pub count: u16,
    pub paid_lamports: u64,
    pub revenue_lamports: u64,
}

#[event]
pub struct EntryRevealed {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub seq: u32,
    pub tickets: Vec<u32>,
    /// per ticket: 0 = no prize, t+1 = tier t
    pub prizes: Vec<u8>,
    pub paid: u64,
}

#[event]
pub struct FreeEntryClaimed {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub seq: u32,
    pub pos: u32,
}

#[event]
pub struct DrawRequested {
    pub draw: Pubkey,
    pub vrf_request: Pubkey,
    pub total_tickets: u32,
}

#[event]
pub struct DrawSettled {
    pub draw: Pubkey,
    pub winning_pos: u32,
    pub winning_ticket: u32,
    pub winning_entry: Pubkey,
    pub winner: Pubkey,
    pub end_prize_paid: u64,
    /// true when `paid_tickets < min_tickets` and the fallback pot was paid instead of the end prize
    pub fallback: bool,
}

/// reason: 0 = no tickets, 1 = randomness timeout, 3 = draft cancelled by the authority
#[event]
pub struct DrawCancelled {
    pub draw: Pubkey,
    pub reason: u8,
}

#[event]
pub struct Refunded {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Withdrawn {
    pub draw: Pubkey,
    pub amount: u64,
}

#[event]
pub struct LimitSet {
    pub wallet: Pubkey,
    pub limit_lamports: u64,
    pub pending_limit: u64,
    /// 0 = nothing pending
    pub pending_from: i64,
}

#[event]
pub struct SelfExcluded {
    pub wallet: Pubkey,
    pub excluded_until: i64,
}

#[event]
pub struct KeeperSet {
    pub keeper: Pubkey,
}

#[event]
pub struct LegacyClosed {
    pub draw_id: u64,
    pub draw: Pubkey,
    pub amount: u64,
}
