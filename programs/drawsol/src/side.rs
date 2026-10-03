//! Raw-byte access to the Pool and Schedule accounts (SPEC-v4 §2). They are never deserialised:
//! `reveal_entry` touches a handful of bytes per ticket, so the whole account is only ever borrowed.

use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

use crate::constants::*;
use crate::errors::DrawError;
use crate::state::{Pool, Schedule};

/// Owner + discriminator check of a Pool / Schedule account (the PDA seeds are checked by Anchor).
fn check_side(acc: &AccountInfo, disc: &[u8]) -> Result<()> {
    require_keys_eq!(*acc.owner, crate::ID, DrawError::WrongSideAccount);
    let data = acc.try_borrow_data()?;
    require!(data.len() >= 8 && &data[..8] == disc, DrawError::WrongSideAccount);
    Ok(())
}

pub fn check_pool(acc: &AccountInfo) -> Result<()> {
    check_side(acc, Pool::DISCRIMINATOR)
}

pub fn check_schedule(acc: &AccountInfo) -> Result<()> {
    check_side(acc, Schedule::DISCRIMINATOR)
}

/// Numbers still in the pool (during init: numbers filled so far).
pub fn pool_remaining(data: &[u8]) -> u32 {
    u32::from_le_bytes(data[POOL_REMAINING_OFFSET..POOL_REMAINING_OFFSET + 4].try_into().unwrap())
}

pub fn set_pool_remaining(data: &mut [u8], remaining: u32) {
    data[POOL_REMAINING_OFFSET..POOL_REMAINING_OFFSET + 4].copy_from_slice(&remaining.to_le_bytes());
}

#[inline(always)]
pub fn pool_get(data: &[u8], i: usize) -> u32 {
    let o = POOL_NUMBERS_OFFSET + 4 * i;
    u32::from_le_bytes(data[o..o + 4].try_into().unwrap())
}

#[inline(always)]
pub fn pool_set(data: &mut [u8], i: usize, v: u32) {
    let o = POOL_NUMBERS_OFFSET + 4 * i;
    data[o..o + 4].copy_from_slice(&v.to_le_bytes());
}

/// The pool's numbers as a Vec (tests / off-chain recomputation).
pub fn pool_numbers(data: &[u8], cap: u32) -> Vec<u32> {
    (0..cap as usize).map(|i| pool_get(data, i)).collect()
}
