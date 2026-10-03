use anchor_lang::prelude::*;

use crate::constants::{CANCEL_GRACE_SECS, CANCEL_REASON_DRAFT, CANCEL_REASON_RANDOMNESS_TIMEOUT, DRAW_SEED};
use crate::errors::DrawError;
use crate::events::DrawCancelled;
use crate::state::{DrawStatus, DrawV4};
use crate::utils::now;

/// Two cases:
/// - **Drawing** and `now > draw_at + 48 h` (the randomness never landed): anyone; refunds open via
///   `claim_refund`, the escrow returns to the authority via `withdraw`.
/// - **Draft** (never opened, nothing escrowed): the authority only.
#[derive(Accounts)]
pub struct CancelDraw<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV4>>,

    pub signer: Signer<'info>,
}

pub fn handler(ctx: Context<CancelDraw>) -> Result<()> {
    let now = now()?;
    let d = &mut ctx.accounts.draw;
    let reason = match d.status {
        DrawStatus::Drawing => {
            let deadline = d.draw_at.checked_add(CANCEL_GRACE_SECS).ok_or(DrawError::MathOverflow)?;
            require!(now > deadline, DrawError::NotCancellable);
            CANCEL_REASON_RANDOMNESS_TIMEOUT
        }
        DrawStatus::Draft => {
            require_keys_eq!(ctx.accounts.signer.key(), d.authority, DrawError::Unauthorized);
            // nothing was escrowed: nothing to return
            d.escrow_returned = true;
            d.instant_escrow_returned = true;
            CANCEL_REASON_DRAFT
        }
        _ => return err!(DrawError::WrongStatus),
    };
    d.status = DrawStatus::Cancelled;
    emit!(DrawCancelled { draw: d.key(), reason });
    Ok(())
}
