use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct DrawState {
    /// Maximum number of tickets for this draw
    pub ticket_cap: u32,
    /// Number of tickets sold so far
    pub tickets_sold: u32,
    /// Total USDC collected (in USDC lamports, 6 decimals)
    pub usdc_collected: u64,
    /// Current SOL price in USD (6 decimal fixed point from Pyth)
    pub sol_price_usd: u64,
    /// Threshold in USDC to trigger the draw (sol_price * 100 * 1.5)
    pub threshold_usdc: u64,
    /// Current draw status
    pub status: DrawStatus,
    /// Operator wallet (receives remaining funds)
    pub operator: Pubkey,
    /// Winner of the grand prize (set after draw)
    pub winner: Option<Pubkey>,
    /// Draw number (starting at 1)
    pub draw_number: u8,
    /// Vault bump seed
    pub vault_bump: u8,
    /// Prize escrow bump seed
    pub escrow_bump: u8,
    /// Draw state bump seed
    pub bump: u8,
    /// Hash of the correct skill answer for this draw
    pub skill_answer_hash: [u8; 32],
    /// USDC mint address
    pub usdc_mint: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum DrawStatus {
    #[default]
    Open,
    ThresholdMet,
    Drawing,
    Settled,
}

impl DrawState {
    /// Account size: 4 + 4 + 8 + 8 + 8 + 1 + 32 + (1+32) + 1 + 1 + 1 + 1 + 32 + 32 + padding
    pub const LEN: usize = 8 + // discriminator
        4 +   // ticket_cap
        4 +   // tickets_sold
        8 +   // usdc_collected
        8 +   // sol_price_usd
        8 +   // threshold_usdc
        1 +   // status
        32 +  // operator
        33 +  // winner (Option<Pubkey>)
        1 +   // draw_number
        1 +   // vault_bump
        1 +   // escrow_bump
        1 +   // bump
        32 +  // skill_answer_hash
        32 +  // usdc_mint
        64;   // padding for future use
}
