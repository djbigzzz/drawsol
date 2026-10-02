use anchor_lang::prelude::*;

/// seeds = [b"config"]
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub next_draw_id: u64,
    pub bump: u8,
}
