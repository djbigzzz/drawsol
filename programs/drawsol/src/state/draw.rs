use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::DrawError;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum DrawStatus {
    /// Created; pool being filled and schedule being registered; nothing escrowed yet.
    Draft,
    Open,
    Drawing,
    Settled,
    Cancelled,
}

/// One instant-prize tier. Unused = all zero.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default, InitSpace)]
pub struct Tier {
    /// prize per winning number, lamports
    pub amount: u64,
    /// winning numbers in the schedule
    pub count: u16,
    /// winning numbers registered so far by `set_schedule` (== count once the draw is Open)
    pub set: u16,
    /// winning numbers assigned (and paid) so far
    pub won: u16,
}

/// seeds = [b"draw4", id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct DrawV4 {
    pub id: u64,
    /// config.admin at creation; escrows the prizes at `open_draw`, receives the house share / returned escrow
    pub authority: Pubkey,
    pub status: DrawStatus,
    pub ticket_price: u64,
    /// ticket numbers are 0..ticket_cap; every ticket (paid or free) takes one number, so this caps all tickets
    pub ticket_cap: u32,
    pub max_per_tx: u16,
    /// all ticket kinds
    pub max_per_wallet: u32,
    pub free_cap: u32,
    pub created_at: i64,
    pub closes_at: i64,
    /// >= closes_at; sell-out ends sales early, the draw still waits for draw_at
    pub draw_at: i64,
    /// only keeper/authority may request the draw during [draw_at, draw_at + grace)
    pub public_grace_secs: u32,
    // ---- money
    pub house_bps: u16,
    pub pot_bps: u16,
    pub instant_bps: u16,
    /// fixed end prize, escrowed at open; paid in full when paid_tickets >= min_tickets
    pub end_prize_lamports: u64,
    pub min_tickets: u32,
    pub tiers: [Tier; 8],
    /// Σ tiers.amount × count — escrowed at open
    pub schedule_total_lamports: u64,
    /// winning numbers registered so far (== Σ tiers.count once Open)
    pub schedule_set: u32,
    /// instant prizes paid so far
    pub instants_paid: u64,
    /// every lamport paid for tickets
    pub revenue: u64,
    /// fixed at settle: revenue − fallback pot (if paid); withdrawable after Settled
    pub house_lamports: u64,
    pub house_withdrawn: u64,
    pub refunded_lamports: u64,
    // ---- counters
    pub paid_tickets: u32,
    pub free_tickets: u32,
    /// tickets that have a number (revealed)
    pub assigned: u32,
    /// positions handed out: every ticket (paid or free) gets the next position at purchase
    pub next_pos: u32,
    pub entry_count: u32,
    pub revealed_entries: u32,
    // ---- result
    pub draw_vrf_request: Pubkey,
    pub draw_vrf_seed: [u8; 32],
    pub randomness: [u8; 64],
    pub winning_pos: u32,
    pub winning_ticket: u32,
    pub winning_entry: Pubkey,
    pub winner: Pubkey,
    /// what the winner actually received (end prize, or the fallback pot)
    pub end_prize_paid: u64,
    pub settled_at: i64,
    /// the prize was disbursed (to the winner, or the fallback pot was paid)
    pub prize_paid: bool,
    /// the end-prize escrow has left the vault (paid to the winner, or returned to the authority)
    pub escrow_returned: bool,
    /// the unwon part of the schedule escrow (schedule_total − instants_paid) was returned to the authority
    pub instant_escrow_returned: bool,
    pub terms_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
    pub pool_bump: u8,
    pub schedule_bump: u8,
}

impl DrawV4 {
    /// Every number handed out: no ticket of any kind can be sold any more.
    pub fn sold_out(&self) -> bool {
        self.next_pos >= self.ticket_cap
    }

    pub fn all_revealed(&self) -> bool {
        self.revealed_entries == self.entry_count
    }

    pub fn tiers_total_count(&self) -> u32 {
        self.tiers.iter().map(|t| t.count as u32).sum()
    }

    /// Schedule escrow still held for instant prizes.
    pub fn instant_escrow_left(&self) -> Result<u64> {
        self.schedule_total_lamports
            .checked_sub(self.instants_paid)
            .ok_or_else(|| error!(DrawError::MathOverflow))
    }

    /// Byte length of the Pool account once fully initialised.
    pub fn pool_len(&self) -> usize {
        POOL_NUMBERS_OFFSET + 4 * self.ticket_cap as usize
    }

    /// Byte length of the Schedule account once fully initialised.
    pub fn schedule_len(&self) -> usize {
        SCHEDULE_BYTES_OFFSET + self.ticket_cap as usize
    }

    /// SPEC-v4 §1 inequalities over the stored parameters (checked at create and again at open).
    pub fn check_profitability(&self) -> Result<()> {
        let bps = BPS as u128;
        require!(
            self.house_bps >= HOUSE_BPS_MIN && self.house_bps <= HOUSE_BPS_MAX,
            DrawError::InvalidParams
        );
        let sum = self.house_bps as u64 + self.pot_bps as u64 + self.instant_bps as u64;
        require!(sum == BPS, DrawError::InvalidParams);
        require!(self.end_prize_lamports > 0, DrawError::InvalidParams);
        require!(self.min_tickets >= 1 && self.min_tickets <= self.ticket_cap, DrawError::InvalidParams);
        let price = self.ticket_price as u128;
        // min_tickets × price × (10000 − house − instant) / 10000 ≥ end_prize
        let at_min = (self.min_tickets as u128)
            .checked_mul(price)
            .and_then(|v| v.checked_mul(self.pot_bps as u128))
            .ok_or(DrawError::MathOverflow)?;
        let need = (self.end_prize_lamports as u128).checked_mul(bps).ok_or(DrawError::MathOverflow)?;
        require!(at_min >= need, DrawError::InvalidParams);
        // Σ schedule ≤ instant_bps × cap × price / 10000
        let budget = (self.ticket_cap as u128)
            .checked_mul(price)
            .and_then(|v| v.checked_mul(self.instant_bps as u128))
            .ok_or(DrawError::MathOverflow)?;
        let total = (self.schedule_total_lamports as u128).checked_mul(bps).ok_or(DrawError::MathOverflow)?;
        require!(total <= budget, DrawError::InvalidParams);
        Ok(())
    }
}
