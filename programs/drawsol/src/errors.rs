use anchor_lang::prelude::*;

#[error_code]
pub enum DrawError {
    #[msg("Draw is not in Open status")]
    DrawNotOpen,
    #[msg("Draw is not in ThresholdMet status")]
    DrawNotThresholdMet,
    #[msg("Draw is not in Drawing status")]
    DrawNotDrawing,
    #[msg("All tickets have been sold")]
    TicketsSoldOut,
    #[msg("Invalid ticket quantity (1-100)")]
    InvalidQuantity,
    #[msg("Purchase would exceed ticket cap")]
    ExceedsTicketCap,
    #[msg("Incorrect skill answer")]
    IncorrectSkillAnswer,
    #[msg("Insufficient USDC payment")]
    InsufficientPayment,
    #[msg("Payout not yet due")]
    PayoutNotDue,
    #[msg("Payout already processed")]
    PayoutAlreadyPaid,
    #[msg("Free entry already claimed for this draw")]
    FreeEntryAlreadyClaimed,
    #[msg("Invalid CAPTCHA proof")]
    InvalidCaptchaProof,
    #[msg("Unauthorized operator")]
    UnauthorizedOperator,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Invalid VRF result")]
    InvalidVrfResult,
    #[msg("Threshold not met")]
    ThresholdNotMet,
    #[msg("Invalid price feed")]
    InvalidPriceFeed,
}
