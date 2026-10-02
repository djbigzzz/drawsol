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
    #[msg("This entry has no instant roll")]
    NoInstantRoll,
    #[msg("This entry does not hold the winning ticket")]
    WrongWinningEntry,
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
    // ---- v3
    #[msg("The draw is not due yet (draw_at)")]
    DrawNotDue,
    #[msg("Not enough credits")]
    InsufficientCredits,
    #[msg("This purchase would exceed your spend limit for the period")]
    SpendLimitExceeded,
    #[msg("This wallet is self-excluded")]
    SelfExcluded,
    #[msg("The vault cannot cover this payment yet; the operator must top it up")]
    VaultShortfall,
    #[msg("Config is already migrated")]
    AlreadyMigrated,
    #[msg("Account is not a v2 account of this program")]
    NotLegacyAccount,
    #[msg("The v2 draw still holds liabilities and cannot be closed")]
    LegacyNotClosable,
}
