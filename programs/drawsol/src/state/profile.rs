use anchor_lang::prelude::*;

use crate::constants::PERIOD_SECS;
use crate::errors::DrawError;

/// seeds = [b"profile", wallet]. Global across draws.
#[account]
#[derive(InitSpace)]
pub struct Profile {
    pub wallet: Pubkey,
    /// free-ticket credits (won as instant prizes, spent with `use_credits`)
    pub credits: u32,
    /// 0 = no limit
    pub limit_lamports: u64,
    pub pending_limit: u64,
    /// 0 = no pending change; otherwise `pending_limit` applies from this time
    pub pending_from: i64,
    pub period_start: i64,
    pub period_spent: u64,
    pub excluded_until: i64,
    pub bump: u8,
}

impl Profile {
    /// Sets `wallet`/`bump` on a freshly `init_if_needed`-created profile.
    pub fn ensure_init(&mut self, wallet: Pubkey, bump: u8) {
        if self.wallet == Pubkey::default() {
            self.wallet = wallet;
            self.bump = bump;
        }
    }

    /// Applies a pending limit change whose delay has elapsed.
    pub fn apply_pending(&mut self, now: i64) {
        if self.pending_from != 0 && now >= self.pending_from {
            self.limit_lamports = self.pending_limit;
            self.pending_limit = 0;
            self.pending_from = 0;
        }
    }

    /// Rolls the spend period, then checks and records `amount` against the limit.
    pub fn spend(&mut self, now: i64, amount: u64) -> Result<()> {
        self.apply_pending(now);
        let period_end = self.period_start.checked_add(PERIOD_SECS).ok_or(DrawError::MathOverflow)?;
        if self.period_start == 0 || now >= period_end {
            self.period_start = now;
            self.period_spent = 0;
        }
        let spent = self.period_spent.checked_add(amount).ok_or(DrawError::MathOverflow)?;
        require!(self.limit_lamports == 0 || spent <= self.limit_lamports, DrawError::SpendLimitExceeded);
        self.period_spent = spent;
        Ok(())
    }

    pub fn check_not_excluded(&self, now: i64) -> Result<()> {
        require!(now >= self.excluded_until, DrawError::SelfExcluded);
        Ok(())
    }
}
