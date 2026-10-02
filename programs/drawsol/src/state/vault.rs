use anchor_lang::prelude::*;

/// seeds = [b"vault", draw.key()]. Program-owned, no fields: its lamports are the escrow
/// (prize + instant-win reserve + ticket proceeds). Debited directly by the program; it must
/// always stay rent-exempt.
#[account]
#[derive(InitSpace)]
pub struct Vault {}
