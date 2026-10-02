//! Every randomness-related function of SPEC §2.3. These are pure (no account access) except
//! `read_fulfilled_randomness`, and are mirrored 1:1 by `app/src/lib/fairness.ts`.
//! Cross-language vectors: `tests-svm/fixtures/fairness_vectors.json`.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use orao_solana_vrf::state::RandomnessAccountData;
use orao_solana_vrf::RANDOMNESS_ACCOUNT_SEED;

use crate::constants::{DRAW_VRF_DOMAIN, ENTRY_VRF_DOMAIN};
use crate::errors::DrawError;
use crate::state::IwTier;

/// `sha256("drawsol:v2:entry" || draw || buyer || seq_le_u32 || client_nonce[16])`
///
/// Everything but `client_nonce` is fixed by program state. The nonce only stops third parties
/// from pre-creating (griefing) the ORAO PDA for a predictable seed; it gives the caller no control
/// over the output, which is ORAO's VRF signature over the seed. `request_v2` `init`s the PDA, so a
/// seed (and therefore an already-known randomness) can never be reused.
pub fn entry_vrf_seed(draw: &Pubkey, buyer: &Pubkey, seq: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    hashv(&[
        ENTRY_VRF_DOMAIN,
        draw.as_ref(),
        buyer.as_ref(),
        &seq.to_le_bytes(),
        client_nonce,
    ])
    .to_bytes()
}

/// `sha256("drawsol:v2:draw" || draw || next_ticket_le_u32 || client_nonce[16])`
pub fn draw_vrf_seed(draw: &Pubkey, next_ticket: u32, client_nonce: &[u8; 16]) -> [u8; 32] {
    hashv(&[DRAW_VRF_DOMAIN, draw.as_ref(), &next_ticket.to_le_bytes(), client_nonce]).to_bytes()
}

/// ORAO randomness request PDA: `[b"orao-vrf-randomness-request", seed]` under the ORAO program.
pub fn vrf_request_address(seed: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[RANDOMNESS_ACCOUNT_SEED, seed], &orao_solana_vrf::ID).0
}

/// `u64_le(sha256(rand64 || "ticket" || ticket_le_u32)[0..8])`
pub fn ticket_roll(randomness: &[u8; 64], ticket: u32) -> u64 {
    let h = hashv(&[randomness, b"ticket", &ticket.to_le_bytes()]).to_bytes();
    u64::from_le_bytes(h[..8].try_into().unwrap())
}

/// `(r * n) >> 64` — uniform in `[0, n)` (bias < n / 2^64).
pub fn uniform_index(r: u64, n: u32) -> u32 {
    ((r as u128 * n as u128) >> 64) as u32
}

/// Instant-win tier of one ticket: 0 = no win, `i + 1` = tier `i`.
/// `x = uniform_index(ticket_roll, denominator)`; walk the tiers cumulatively by `odds`;
/// the first tier with `x < cumulative` wins.
pub fn ticket_tier(randomness: &[u8; 64], ticket: u32, denominator: u32, tiers: &[IwTier; 4]) -> u8 {
    if denominator == 0 {
        return 0;
    }
    let x = uniform_index(ticket_roll(randomness, ticket), denominator) as u64;
    let mut cumulative: u64 = 0;
    for (i, t) in tiers.iter().enumerate() {
        cumulative += t.odds as u64;
        if x < cumulative {
            return (i + 1) as u8;
        }
    }
    0
}

/// Grand-draw winning ticket: `uniform_index(u64_le(sha256(rand64 || "draw")[0..8]), next_ticket)`.
pub fn winning_ticket(randomness: &[u8; 64], next_ticket: u32) -> u32 {
    let h = hashv(&[randomness, b"draw"]).to_bytes();
    uniform_index(u64::from_le_bytes(h[..8].try_into().unwrap()), next_ticket)
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
