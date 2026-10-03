//! Every randomness-related function of SPEC-v4 (seeds, random ticket assignment, winning position).
//! These are pure (no account access) except `read_fulfilled_randomness`, and are mirrored 1:1 by
//! `scripts/lib.ts` (and the app's `fairness.ts`).
//! Cross-language vectors: `tests-svm/fixtures/fairness_vectors.json`.
//!
//! The v2/v3 functions at the bottom only exist to verify the history of draws #0–#6.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use orao_solana_vrf::state::RandomnessAccountData;
use orao_solana_vrf::RANDOMNESS_ACCOUNT_SEED;

use crate::constants::*;
use crate::errors::DrawError;

/// `sha256("drawsol:v4:entry" || draw || buyer || seq_le_u32 || client_nonce[16])`
///
/// Everything but `client_nonce` is fixed by program state. The nonce only stops third parties
/// from pre-creating (griefing) the ORAO PDA for a predictable seed; it gives the caller no control
/// over the output, which is ORAO's VRF signature over the seed. `request_v2` `init`s the PDA, so a
/// seed (and therefore an already-known randomness) can never be reused.
pub fn entry_vrf_seed(draw: &Pubkey, buyer: &Pubkey, seq: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    entry_vrf_seed_in(ENTRY_VRF_DOMAIN, draw, buyer, seq, client_nonce)
}

/// `sha256("drawsol:v4:draw" || draw || next_pos_le_u32 || client_nonce[16])`
pub fn draw_vrf_seed(draw: &Pubkey, next_pos: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    draw_vrf_seed_in(DRAW_VRF_DOMAIN, draw, next_pos, client_nonce)
}

fn entry_vrf_seed_in(domain: &[u8], draw: &Pubkey, buyer: &Pubkey, seq: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    hashv(&[domain, draw.as_ref(), buyer.as_ref(), &seq.to_le_bytes(), client_nonce]).to_bytes()
}

fn draw_vrf_seed_in(domain: &[u8], draw: &Pubkey, n: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    hashv(&[domain, draw.as_ref(), &n.to_le_bytes(), client_nonce]).to_bytes()
}

/// ORAO randomness request PDA: `[b"orao-vrf-randomness-request", seed]` under the ORAO program.
pub fn vrf_request_address(seed: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[RANDOMNESS_ACCOUNT_SEED, seed], &orao_solana_vrf::ID).0
}

/// `(r * n) >> 64` — uniform in `[0, n)` (bias < n / 2^64).
pub fn uniform_index(r: u64, n: u32) -> u32 {
    ((r as u128 * n as u128) >> 64) as u32
}

/// Number of assignment rolls derived from one sha256 (4 × u64 per 32-byte digest).
pub const ROLLS_PER_HASH: u32 = 4;

/// Roll for the `i`-th ticket of an entry: `u64_le(sha256(rand64 || "assign" || (i / 4)_le_u32)[8·(i % 4) ..][..8])`.
/// Four rolls share one hash to keep a 1000-ticket reveal cheap.
pub fn assign_roll(randomness: &[u8; 64], i: u32) -> u64 {
    let h = hashv(&[randomness, b"assign", &(i / ROLLS_PER_HASH).to_le_bytes()]).to_bytes();
    let o = ((i % ROLLS_PER_HASH) * 8) as usize;
    u64::from_le_bytes(h[o..o + 8].try_into().unwrap())
}

/// Index into the pool's remaining numbers for the `i`-th ticket: `assign_roll(rand, i) mod remaining`.
pub fn assign_index(randomness: &[u8; 64], i: u32, remaining: u32) -> u32 {
    (assign_roll(randomness, i) % remaining as u64) as u32
}

/// Fisher–Yates swap-remove assignment of `count` numbers from `pool[..*remaining]`, exactly as
/// `reveal_entry` does it on the Pool account. Returns the tickets in assignment order and leaves
/// `pool` / `remaining` as the on-chain Pool would be afterwards. Panics if the pool runs dry.
pub fn assign_tickets(randomness: &[u8; 64], count: u16, pool: &mut [u32], remaining: &mut u32) -> Vec<u32> {
    let mut out = Vec::with_capacity(count as usize);
    for i in 0..count as u32 {
        assert!(*remaining > 0, "pool exhausted");
        let j = assign_index(randomness, i, *remaining) as usize;
        let last = (*remaining - 1) as usize;
        out.push(pool[j]);
        pool[j] = pool[last];
        *remaining -= 1;
    }
    out
}

/// Winning position of the end-prize draw: `uniform_index(u64_le(sha256(rand64 || "draw")[0..8]), next_pos)`.
/// The winning ticket is `entry.tickets[pos - entry.first_pos]` of the entry holding that position.
pub fn winning_position(randomness: &[u8; 64], next_pos: u32) -> u32 {
    let h = hashv(&[randomness, b"draw"]).to_bytes();
    uniform_index(u64::from_le_bytes(h[..8].try_into().unwrap()), next_pos)
}

/// Reads a fulfilled ORAO randomness account. Checks owner = ORAO, key = the stored request,
/// stored seed = the seed the program derived, and fulfilment.
pub fn read_fulfilled_randomness(
    acc: &AccountInfo,
    expected_key: &Pubkey,
    expected_seed: &[u8; 32],
) -> Result<[u8; 64]> {
    require_keys_eq!(*acc.owner, orao_solana_vrf::ID, DrawError::VrfWrongOwner);
    require_keys_eq!(acc.key(), *expected_key, DrawError::VrfWrongAccount);
    let data = acc.try_borrow_data()?;
    let parsed = RandomnessAccountData::try_deserialize(&mut &data[..])?;
    require!(parsed.seed() == expected_seed, DrawError::VrfSeedMismatch);
    let rnd = parsed
        .fulfilled_randomness()
        .ok_or(error!(DrawError::VrfNotFulfilled))?;
    Ok(*rnd)
}

// ---------------------------------------------------------------- legacy (v2 / v3 history only)

/// v3 entry seed (`drawsol:v3:entry`), for verifying draws #2–#6 only.
pub fn entry_vrf_seed_v3(draw: &Pubkey, buyer: &Pubkey, seq: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    entry_vrf_seed_in(LEGACY_V3_ENTRY_VRF_DOMAIN, draw, buyer, seq, client_nonce)
}

/// v3 draw seed (`drawsol:v3:draw`), for verifying draws #2–#6 only.
pub fn draw_vrf_seed_v3(draw: &Pubkey, next_ticket: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    draw_vrf_seed_in(LEGACY_V3_DRAW_VRF_DOMAIN, draw, next_ticket, client_nonce)
}

/// v2 entry seed (`drawsol:v2:entry`), for verifying draws #0–#1 only.
pub fn entry_vrf_seed_v2(draw: &Pubkey, buyer: &Pubkey, seq: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    entry_vrf_seed_in(LEGACY_V2_ENTRY_VRF_DOMAIN, draw, buyer, seq, client_nonce)
}

/// v2 draw seed (`drawsol:v2:draw`), for verifying draws #0–#1 only.
pub fn draw_vrf_seed_v2(draw: &Pubkey, next_ticket: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    draw_vrf_seed_in(LEGACY_V2_DRAW_VRF_DOMAIN, draw, next_ticket, client_nonce)
}

/// v2/v3 per-ticket instant roll: `u64_le(sha256(rand64 || "ticket" || ticket_le_u32)[0..8])`.
pub fn ticket_roll(randomness: &[u8; 64], ticket: u32) -> u64 {
    let h = hashv(&[randomness, b"ticket", &ticket.to_le_bytes()]).to_bytes();
    u64::from_le_bytes(h[..8].try_into().unwrap())
}

/// v2/v3 instant-win tier of one ticket: 0 = no win, `i + 1` = tier `i` (cumulative odds walk).
pub fn ticket_tier(randomness: &[u8; 64], ticket: u32, denominator: u32, odds: &[u32; 4]) -> u8 {
    if denominator == 0 {
        return 0;
    }
    let x = uniform_index(ticket_roll(randomness, ticket), denominator) as u64;
    let mut cumulative: u64 = 0;
    for (i, o) in odds.iter().enumerate() {
        cumulative += *o as u64;
        if x < cumulative {
            return (i + 1) as u8;
        }
    }
    0
}

/// v2/v3 grand-draw winning ticket (same function as `winning_position`, over `next_ticket`).
pub fn winning_ticket(randomness: &[u8; 64], next_ticket: u32) -> u32 {
    winning_position(randomness, next_ticket)
}
