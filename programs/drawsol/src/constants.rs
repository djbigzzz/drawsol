use anchor_lang::prelude::*;

/// Ticket price: $1.99 USDC (USDC has 6 decimals)
pub const TICKET_PRICE_USDC: u64 = 1_990_000;

/// Default ticket cap per draw
pub const DEFAULT_TICKET_CAP: u32 = 25_000;

/// Grand prize: 100 SOL in lamports
pub const GRAND_PRIZE_LAMPORTS: u64 = 100 * 1_000_000_000;

/// Threshold multiplier: 1.5x (represented as 150 / 100)
pub const THRESHOLD_NUMERATOR: u64 = 150;
pub const THRESHOLD_DENOMINATOR: u64 = 100;

/// SOL amount to purchase (100 SOL)
pub const SOL_PURCHASE_AMOUNT: u64 = 100;

/// Payout delay: 24 hours in seconds
pub const PAYOUT_DELAY_SECONDS: i64 = 86_400;

/// Bulk discount thresholds and percentages (discount in basis points)
pub const DISCOUNT_TIER_1_MIN: u32 = 10;
pub const DISCOUNT_TIER_1_MAX: u32 = 29;
pub const DISCOUNT_TIER_1_BPS: u64 = 1000; // 10%

pub const DISCOUNT_TIER_2_MIN: u32 = 30;
pub const DISCOUNT_TIER_2_MAX: u32 = 69;
pub const DISCOUNT_TIER_2_BPS: u64 = 2000; // 20%

pub const DISCOUNT_TIER_3_MIN: u32 = 70;
pub const DISCOUNT_TIER_3_MAX: u32 = 100;
pub const DISCOUNT_TIER_3_BPS: u64 = 3000; // 30%

/// Max tickets per purchase
pub const MAX_TICKETS_PER_PURCHASE: u32 = 100;

/// Instant win prize table thresholds (out of 25,000)
/// Randomness modulo 25,000:
///   0..9       => $50 USDC  (10 winners)
///   10..29     => $25 USDC  (20 winners)
///   30..129    => $10 USDC  (100 winners)
///   130..729   => $5 USDC   (600 winners)
///   730..24999 => no win    (24,270)
pub const PRIZE_TIER_50_END: u64 = 10;
pub const PRIZE_TIER_25_END: u64 = 30;
pub const PRIZE_TIER_10_END: u64 = 130;
pub const PRIZE_TIER_5_END: u64 = 730;

pub const PRIZE_50_USDC: u64 = 50_000_000;  // $50
pub const PRIZE_25_USDC: u64 = 25_000_000;  // $25
pub const PRIZE_10_USDC: u64 = 10_000_000;  // $10
pub const PRIZE_5_USDC: u64 = 5_000_000;    // $5

/// USDC mint addresses
#[cfg(feature = "devnet")]
pub const USDC_MINT: &str = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr";
#[cfg(not(feature = "devnet"))]
pub const USDC_MINT: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/// ORAO VRF Program ID
pub const ORAO_VRF_PROGRAM_ID: &str = "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y";

/// Seeds
pub const DRAW_STATE_SEED: &[u8] = b"draw_state";
pub const VAULT_SEED: &[u8] = b"vault";
pub const PRIZE_ESCROW_SEED: &[u8] = b"prize_escrow";
pub const TICKET_SEED: &[u8] = b"ticket";
pub const PENDING_PAYOUT_SEED: &[u8] = b"pending_payout";
pub const FREE_ENTRY_SEED: &[u8] = b"free_entry";

/// Prize table total for randomness modulo
pub const PRIZE_TABLE_TOTAL: u64 = 25_000;
