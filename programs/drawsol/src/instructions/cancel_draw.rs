use anchor_lang::prelude::*;

use crate::constants::{CANCEL_GRACE_SECS, CANCEL_REASON_RANDOMNESS_TIMEOUT, DRAW_SEED};
use crate::errors::DrawError;
use crate::events::DrawCancelled;
use crate::state::{DrawStatus, DrawV3};
use crate::utils::now;

/// Permissionless escape hatch: if the draw randomness never lands, the draw can be cancelled and refunded.
/// A headline prize returns to the authority through `withdraw`.
#[derive(Accounts)]
pub struct CancelDraw<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV3>>,
}

pub fn handler(ctx: Context<CancelDraw>) -> Result<()> {
    let now = now()?;
    let d = &mut ctx.accounts.draw;
    require!(d.status == DrawStatus::Drawing, DrawError::WrongStatus);
    let deadline = d.draw_at.checked_add(CANCEL_GRACE_SECS).ok_or(DrawError::MathOverflow)?;
    require!(now > deadline, DrawError::NotCancellable);
    d.status = DrawStatus::Cancelled;
    emit!(DrawCancelled { draw: d.key(), reason: CANCEL_REASON_RANDOMNESS_TIMEOUT });
    Ok(())
}
