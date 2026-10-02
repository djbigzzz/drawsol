use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::constants::BPS;
use crate::errors::DrawError;

/// `amount * bps / 10_000`, in u128, floored.
pub fn mul_bps(amount: u64, bps: u64) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(error!(DrawError::MathOverflow))?
        / BPS as u128;
    u64::try_from(v).map_err(|_| error!(DrawError::MathOverflow))
}

/// Pot-draw split of one payment (SPEC-v3 §2.3): `(house, instant, pot)`.
/// house and instant are floored; the pot takes the remainder, so the three always sum to `payment`.
pub fn split_payment(payment: u64, house_bps: u16, instant_bps: u16) -> Result<(u64, u64, u64)> {
    let house = mul_bps(payment, house_bps as u64)?;
    let instant = mul_bps(payment, instant_bps as u64)?;
    let pot = payment
        .checked_sub(house)
        .and_then(|v| v.checked_sub(instant))
        .ok_or(error!(DrawError::MathOverflow))?;
    Ok((house, instant, pot))
}

/// Lamports the vault can pay out while staying rent-exempt.
pub fn vault_available(vault: &AccountInfo) -> Result<u64> {
    let min = Rent::get()?.minimum_balance(vault.data_len());
    Ok(vault.lamports().saturating_sub(min))
}

/// Moves `amount` lamports out of the program-owned vault by direct lamport arithmetic.
/// Fails if the vault would drop below its rent-exempt minimum.
pub fn pay_from_vault<'info>(vault: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    require!(amount <= vault_available(vault)?, DrawError::VaultShortfall);
    let remaining = vault
        .lamports()
        .checked_sub(amount)
        .ok_or(error!(DrawError::MathOverflow))?;
    **vault.try_borrow_mut_lamports()? = remaining;
    let credited = to
        .lamports()
        .checked_add(amount)
        .ok_or(error!(DrawError::MathOverflow))?;
    **to.try_borrow_mut_lamports()? = credited;
    Ok(())
}

/// Moves `amount` lamports from a signer into an account through the System Program.
pub fn deposit_to_vault<'info>(
    from: &AccountInfo<'info>,
    vault: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(
            system_program.clone(),
            system_program::Transfer { from: from.clone(), to: vault.clone() },
        ),
        amount,
    )
}

/// Empties a program-owned account into `to` and hands it back to the System Program (like Anchor's `close`).
pub fn close_raw<'info>(acc: &AccountInfo<'info>, to: &AccountInfo<'info>) -> Result<u64> {
    let amount = acc.lamports();
    let credited = to.lamports().checked_add(amount).ok_or(error!(DrawError::MathOverflow))?;
    **to.try_borrow_mut_lamports()? = credited;
    **acc.try_borrow_mut_lamports()? = 0;
    acc.assign(&system_program::ID);
    #[allow(deprecated)] // see init_config.rs
    acc.realloc(0, false)?;
    Ok(amount)
}

pub fn now() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}
