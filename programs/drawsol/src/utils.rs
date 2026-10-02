use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::DrawError;

/// Moves `amount` lamports out of the program-owned vault by direct lamport arithmetic.
/// Fails if the vault would drop below its rent-exempt minimum.
pub fn pay_from_vault<'info>(vault: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let min = Rent::get()?.minimum_balance(vault.data_len());
    let remaining = vault
        .lamports()
        .checked_sub(amount)
        .ok_or(error!(DrawError::MathOverflow))?;
    require!(remaining >= min, DrawError::MathOverflow);
    **vault.try_borrow_mut_lamports()? = remaining;
    let credited = to
        .lamports()
        .checked_add(amount)
        .ok_or(error!(DrawError::MathOverflow))?;
    **to.try_borrow_mut_lamports()? = credited;
    Ok(())
}

/// Moves `amount` lamports from a signer into the vault through the System Program.
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

pub fn now() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}
