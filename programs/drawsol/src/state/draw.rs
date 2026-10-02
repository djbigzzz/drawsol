use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum DrawStatus {
    Open,
    Drawing,
    Settled,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum DrawKind {
    /// Nightly: pot grows from every paid ticket, instant wins from the instant pool, never refunded
    /// unless the randomness never arrives.
    Pot,
    /// Weekly: fixed escrowed prize, no instant wins, cancelled + refunded below `min_tickets`.
    Headline,
}

/// One instant-win tier. Unused = all zero.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default, InitSpace)]
pub struct IwTierV3 {
    /// winning outcomes out of `iw_denominator`
    pub odds: u32,
    /// 0 none, 1 sol_share, 2 credits
    pub kind: u8,
    /// sol_share: bps of the entry's pool snapshot; credits: free-ticket credits
    pub value: u32,
}

/// seeds = [b"draw3", id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct DrawV3 {
    pub id: u64,
    /// config.admin at creation; receives the house share / returned escrow
    pub authority: Pubkey,
    pub kind: DrawKind,
    pub status: DrawStatus,
    pub ticket_price: u64,
    /// paid tickets (free and credit tickets never count)
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
    /// headline: fixed escrow; pot: 0 until settled (then the prize actually computed)
    pub prize_lamports: u64,
    /// headline only
    pub min_tickets: u32,
    /// headline only
    pub floor_margin_bps: u16,
    /// pot draws: accumulated pot share
    pub pot_lamports: u64,
    /// pot draws: current instant pool balance
    pub instant_pool_lamports: u64,
    pub house_lamports: u64,
    pub house_withdrawn: u64,
    /// every lamport paid for tickets
    pub revenue_lamports: u64,
    pub refunded_lamports: u64,
    pub iw_denominator: u32,
    pub iw_tiers: [IwTierV3; 4],
    // ---- counters
    pub paid_tickets: u32,
    pub free_tickets: u32,
    pub credit_tickets: u32,
    /// ticket numbers are 0..next_ticket (all kinds)
    pub next_ticket: u32,
    pub entry_count: u32,
    /// entries that need a reveal (have an ORAO request)
    pub rolled_entries: u32,
    pub revealed_entries: u32,
    // ---- result
    pub draw_vrf_request: Pubkey,
    pub draw_vrf_seed: [u8; 32],
    pub randomness: [u8; 64],
    pub winning_ticket: u32,
    pub winning_entry: Pubkey,
    pub winner: Pubkey,
    pub prize_paid_lamports: u64,
    pub settled_at: i64,
    /// prize disbursed: to the winner (Settled) or the escrow back to the authority (Cancelled headline)
    pub prize_paid: bool,
    pub terms_hash: [u8; 32],
    pub bump: u8,
    pub vault_bump: u8,
}

impl DrawV3 {
    /// Pot draws with at least one instant tier roll every ticket through ORAO.
    pub fn needs_roll(&self) -> bool {
        self.kind == DrawKind::Pot && self.iw_denominator > 0
    }

    pub fn sold_out(&self) -> bool {
        self.paid_tickets >= self.ticket_cap
    }

    pub fn tier_odds(&self) -> [u32; 4] {
        [self.iw_tiers[0].odds, self.iw_tiers[1].odds, self.iw_tiers[2].odds, self.iw_tiers[3].odds]
    }
}
