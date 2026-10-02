/// Hard cap on tickets per purchase; also the length of `EntryV3.tiers`.
pub const MAX_PER_TX: u16 = 25;
pub const MAX_TIERS: usize = 4;
pub const BPS: u64 = 10_000;

/// House share bounds (bps of every paid ticket / of headline revenue at sell-out).
pub const HOUSE_BPS_MIN: u16 = 5_000;
pub const HOUSE_BPS_MAX: u16 = 6_000;
/// Minimum pot share of a pot draw.
pub const POT_BPS_MIN: u16 = 2_000;
/// Minimum margin over the prize a headline draw must make at `min_tickets`.
pub const FLOOR_MARGIN_BPS_MIN: u16 = 1_000;
/// Max `sol_share` tier value (bps of the entry's pool snapshot).
pub const SOL_SHARE_MAX_BPS: u32 = 5_000;
/// Max `credits` tier value (free-ticket credits per winning ticket).
pub const CREDITS_TIER_MAX: u32 = 100;

/// A draw stuck in `Drawing` for this long after `draw_at` may be cancelled by anyone.
pub const CANCEL_GRACE_SECS: i64 = 48 * 3600;
/// Max keeper/authority-only window after `draw_at`.
pub const PUBLIC_GRACE_MAX: u32 = 48 * 3600;
/// Spend-limit increases (and removal) take effect this long after they are requested.
pub const LIMIT_INCREASE_DELAY: i64 = 72 * 3600;
/// Spend-limit period.
pub const PERIOD_SECS: i64 = 30 * 86400;

pub const CONFIG_SEED: &[u8] = b"config";
pub const DRAW_SEED: &[u8] = b"draw3";
pub const VAULT_SEED: &[u8] = b"vault3";
pub const PLAYER_SEED: &[u8] = b"player3";
pub const ENTRY_SEED: &[u8] = b"entry3";
pub const PROFILE_SEED: &[u8] = b"profile";

pub const ENTRY_VRF_DOMAIN: &[u8] = b"drawsol:v3:entry";
pub const DRAW_VRF_DOMAIN: &[u8] = b"drawsol:v3:draw";

/// v2 (legacy) seeds / domains — only for `legacy_close_v2` and history verification.
pub const LEGACY_DRAW_SEED: &[u8] = b"draw";
pub const LEGACY_VAULT_SEED: &[u8] = b"vault";
pub const LEGACY_ENTRY_VRF_DOMAIN: &[u8] = b"drawsol:v2:entry";
pub const LEGACY_DRAW_VRF_DOMAIN: &[u8] = b"drawsol:v2:draw";

/// `DrawCancelled.reason`
pub const CANCEL_REASON_NO_TICKETS: u8 = 0;
pub const CANCEL_REASON_RANDOMNESS_TIMEOUT: u8 = 1;
pub const CANCEL_REASON_UNDERSOLD: u8 = 2;

/// `IwTierV3.kind`
pub const TIER_NONE: u8 = 0;
pub const TIER_SOL_SHARE: u8 = 1;
pub const TIER_CREDITS: u8 = 2;
