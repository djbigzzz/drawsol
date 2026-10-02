/// Hard cap on tickets per purchase; also the length of `Entry.tiers`.
pub const MAX_PER_TX: u16 = 25;
pub const MAX_TIERS: usize = 4;
/// A draw stuck in `Drawing` for this long after `closes_at` may be cancelled by anyone.
pub const CANCEL_GRACE_SECS: i64 = 48 * 3600;
/// Reserve leftovers become withdrawable after this even if paid entries remain unrevealed.
pub const RESERVE_UNLOCK_SECS: i64 = 7 * 86400;

pub const CONFIG_SEED: &[u8] = b"config";
pub const DRAW_SEED: &[u8] = b"draw";
pub const VAULT_SEED: &[u8] = b"vault";
pub const PLAYER_SEED: &[u8] = b"player";
pub const ENTRY_SEED: &[u8] = b"entry";

pub const ENTRY_VRF_DOMAIN: &[u8] = b"drawsol:v2:entry";
pub const DRAW_VRF_DOMAIN: &[u8] = b"drawsol:v2:draw";

pub const CANCEL_REASON_NO_TICKETS: u8 = 0;
pub const CANCEL_REASON_RANDOMNESS_TIMEOUT: u8 = 1;
