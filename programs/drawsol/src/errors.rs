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
    #[msg("Free entries have no instant result or refund")]
    FreeEntryNoReveal,
    #[msg("This entry does not hold the winning ticket")]
    WrongWinningEntry,
    #[msg("The draw cannot be cancelled yet")]
    NotCancellable,
    #[msg("Entry already refunded")]
    AlreadyRefunded,
    #[msg("Nothing to withdraw right now")]
    NothingToWithdraw,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
