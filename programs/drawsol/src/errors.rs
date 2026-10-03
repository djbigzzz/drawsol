use anchor_lang::prelude::*;

#[error_code]
pub enum DrawError {
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("Invalid parameters")]
    InvalidParams,
    #[msg("Sales for this draw are closed")]
    SalesClosed,
    #[msg("Sales are still open: the draw is not due yet")]
    SalesStillOpen,
    #[msg("Not enough tickets left")]
    SoldOut,
    #[msg("Quantity exceeds the per-transaction limit")]
    ExceedsPerTx,
    #[msg("Quantity exceeds the per-wallet limit")]
    ExceedsWalletCap,
    #[msg("All free entries have been claimed")]
    FreeCapReached,
    #[msg("This wallet already claimed its free entry")]
    FreeAlreadyClaimed,
    #[msg("The draw is not in the right status for this action")]
    WrongStatus,
    #[msg("Randomness account is not owned by ORAO VRF")]
    VrfWrongOwner,
    #[msg("Randomness account does not match the stored request")]
    VrfWrongAccount,
    #[msg("Randomness seed mismatch")]
    VrfSeedMismatch,
    #[msg("Randomness has not been fulfilled yet")]
    VrfNotFulfilled,
    #[msg("Entry already revealed")]
    AlreadyRevealed,
    #[msg("This entry does not hold the winning position")]
    WrongWinningEntry,
    #[msg("The winning entry has not been revealed yet")]
    WinnerNotRevealed,
    #[msg("The draw cannot be cancelled yet")]
    NotCancellable,
    #[msg("Entry already refunded")]
    AlreadyRefunded,
    #[msg("Nothing to refund for this entry")]
    NothingToRefund,
    #[msg("Nothing to withdraw right now")]
    NothingToWithdraw,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("The draw is not due yet (draw_at)")]
    DrawNotDue,
    #[msg("This purchase would exceed your spend limit for the period")]
    SpendLimitExceeded,
    #[msg("This wallet is self-excluded")]
    SelfExcluded,
    #[msg("The vault cannot cover this payment yet; the operator must top it up")]
    VaultShortfall,
    #[msg("Account is not a legacy account of this program")]
    NotLegacyAccount,
    #[msg("The legacy draw still holds liabilities and cannot be closed")]
    LegacyNotClosable,
    // ---- v4
    #[msg("Pool / Schedule account is not the draw's (owner, seeds or discriminator)")]
    WrongSideAccount,
    #[msg("init_pool chunk must start at the next unfilled number and hold 1..=2000 numbers up to the cap")]
    BadPoolChunk,
    #[msg("The pool is not fully initialised yet")]
    PoolIncomplete,
    #[msg("Schedule batch is empty or larger than 300")]
    BadScheduleBatch,
    #[msg("This ticket number is already in the schedule")]
    DuplicateScheduleTicket,
    #[msg("This tier already has every winning number registered")]
    TierFull,
    #[msg("Not every tier has all its winning numbers registered")]
    ScheduleIncomplete,
    #[msg("The pool is corrupt: no numbers left to assign")]
    PoolExhausted,
}
