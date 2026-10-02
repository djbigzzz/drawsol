use anchor_lang::prelude::*;

#[event]
pub struct DrawCreated {
    pub draw: Pubkey,
    pub id: u64,
    pub prize_lamports: u64,
    pub iw_reserve_lamports: u64,
    pub ticket_price: u64,
    pub ticket_cap: u32,
    pub closes_at: i64,
}

#[event]
pub struct TicketsPurchased {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub seq: u32,
    pub first_ticket: u32,
    pub count: u16,
    pub paid_lamports: u64,
}

#[event]
pub struct EntryRevealed {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub first_ticket: u32,
    pub count: u16,
    pub tiers: [u8; 25],
    pub paid: u64,
}

#[event]
pub struct FreeEntryClaimed {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub ticket: u32,
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
    pub winning_ticket: u32,
    pub winning_entry: Pubkey,
    pub winner: Pubkey,
    pub prize_lamports: u64,
}

/// reason: 0 = no tickets, 1 = randomness timeout
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
