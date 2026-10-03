/// Hard cap on tickets per purchase (SPEC-v4 §1). Bounds the `reveal_entry` compute budget.
pub const MAX_PER_TX: u16 = 1000;
/// Number of instant-prize tiers in a draw (unused tiers are all-zero).
pub const MAX_TIERS: usize = 8;
/// Ticket numbers are `0..ticket_cap`; the Pool holds `ticket_cap` u32 and the Schedule `ticket_cap` bytes.
pub const TICKET_CAP_MAX: u32 = 65_535;
/// `init_pool(from, to)`: at most this many numbers per call (8 KB of pool growth, under the 10 KB realloc limit).
pub const POOL_CHUNK_MAX: u32 = 2_000;
/// `set_schedule`: at most this many winning numbers per call.
pub const SCHEDULE_BATCH_MAX: usize = 300;
/// Largest account an `init` / single realloc may create or add (runtime limit).
pub const REALLOC_STEP: usize = 10_240;
pub const BPS: u64 = 10_000;

/// House share bounds (bps of revenue, in expectation, at every sales level).
pub const HOUSE_BPS_MIN: u16 = 5_000;
pub const HOUSE_BPS_MAX: u16 = 6_000;

/// A draw stuck in `Drawing` for this long after `draw_at` may be cancelled by anyone; also the point after
/// which unclaimed instant-prize escrow of a Settled draw becomes withdrawable even with unrevealed entries.
pub const CANCEL_GRACE_SECS: i64 = 48 * 3600;
/// Max keeper/authority-only window after `draw_at`.
pub const PUBLIC_GRACE_MAX: u32 = 48 * 3600;
/// Spend-limit increases (and removal) take effect this long after they are requested.
pub const LIMIT_INCREASE_DELAY: i64 = 72 * 3600;
/// Spend-limit period.
pub const PERIOD_SECS: i64 = 30 * 86400;

pub const CONFIG_SEED: &[u8] = b"config";
pub const DRAW_SEED: &[u8] = b"draw4";
pub const VAULT_SEED: &[u8] = b"vault4";
pub const POOL_SEED: &[u8] = b"pool";
pub const SCHEDULE_SEED: &[u8] = b"schedule";
pub const PLAYER_SEED: &[u8] = b"player4";
pub const ENTRY_SEED: &[u8] = b"entry4";
pub const PROFILE_SEED: &[u8] = b"profile";

pub const ENTRY_VRF_DOMAIN: &[u8] = b"drawsol:v4:entry";
pub const DRAW_VRF_DOMAIN: &[u8] = b"drawsol:v4:draw";

/// v3 (legacy) seeds / domains — only for `legacy_close_v3` and history verification.
pub const LEGACY_V3_DRAW_SEED: &[u8] = b"draw3";
pub const LEGACY_V3_VAULT_SEED: &[u8] = b"vault3";
pub const LEGACY_V3_ENTRY_VRF_DOMAIN: &[u8] = b"drawsol:v3:entry";
pub const LEGACY_V3_DRAW_VRF_DOMAIN: &[u8] = b"drawsol:v3:draw";
/// v2 (legacy) domains — history verification of draws #0–#1 only.
pub const LEGACY_V2_ENTRY_VRF_DOMAIN: &[u8] = b"drawsol:v2:entry";
pub const LEGACY_V2_DRAW_VRF_DOMAIN: &[u8] = b"drawsol:v2:draw";

/// `DrawCancelled.reason`
pub const CANCEL_REASON_NO_TICKETS: u8 = 0;
pub const CANCEL_REASON_RANDOMNESS_TIMEOUT: u8 = 1;
/// A Draft draw cancelled by its authority before it opened (nothing was escrowed).
pub const CANCEL_REASON_DRAFT: u8 = 3;

/// Schedule byte: bit 7 = the prize of this number was won; low bits = tier index + 1 (0 = no prize).
pub const SCHEDULE_WON_BIT: u8 = 0x80;
pub const SCHEDULE_TIER_MASK: u8 = 0x7f;
/// Byte offsets inside the Pool / Schedule accounts (after the 8-byte discriminator).
pub const POOL_REMAINING_OFFSET: usize = 8;
pub const POOL_NUMBERS_OFFSET: usize = 12;
pub const SCHEDULE_BYTES_OFFSET: usize = 8;
