use anchor_lang::prelude::*;

use crate::state::DrawKind;

#[event]
pub struct DrawCreated {
    pub draw: Pubkey,
    pub id: u64,
    pub kind: DrawKind,
    pub creator: Pubkey,
    pub ticket_price: u64,
    pub ticket_cap: u32,
    pub closes_at: i64,
    pub draw_at: i64,
    pub house_bps: u16,
    pub pot_bps: u16,
    pub instant_bps: u16,
    /// headline: escrowed prize; pot: 0
    pub prize_lamports: u64,
    pub min_tickets: u32,
}

#[event]
pub struct TicketsPurchased {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub seq: u32,
    pub first_ticket: u32,
    pub count: u16,
    pub paid_count: u16,
    pub credit_count: u16,
    pub paid_lamports: u64,
    /// pot draws: the draw's pot / instant pool after this purchase
    pub pot_lamports: u64,
    pub instant_pool_lamports: u64,
}

#[event]
pub struct EntryRevealed {
    pub draw: Pubkey,
    pub entry: Pubkey,
    pub owner: Pubkey,
    pub first_ticket: u32,
    pub count: u16,
    pub tiers: [u8; 25],
    pub sol_paid: u64,
    pub credits_won: u32,
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
    pub prize: u64,
}

/// reason: 0 = no tickets, 1 = randomness timeout, 2 = headline undersold (below min_tickets)
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
    pub credits: u32,
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
