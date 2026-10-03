//! ORAO `request_v2` CPI shared by buy_tickets, claim_free_entry and request_draw.

use anchor_lang::prelude::*;
use orao_solana_vrf::cpi::accounts::RequestV2;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::state::NetworkState;

use crate::errors::DrawError;
use crate::fairness::vrf_request_address;

/// Requests randomness for `seed`. The passed request account must be the ORAO PDA of that seed
/// (`request_v2` `init`s it, so a seed can never be reused) and the treasury must be the one in ORAO's
/// network state. Returns the request address.
pub fn request_randomness<'info>(
    payer: &AccountInfo<'info>,
    request: &UncheckedAccount<'info>,
    network_state: &Account<'info, NetworkState>,
    treasury: &UncheckedAccount<'info>,
    vrf: &Program<'info, OraoVrf>,
    system_program: &AccountInfo<'info>,
    seed: [u8; 32],
) -> Result<Pubkey> {
    let expected = vrf_request_address(&seed);
    require_keys_eq!(request.key(), expected, DrawError::VrfWrongAccount);
    require_keys_eq!(treasury.key(), network_state.config.treasury, DrawError::VrfWrongAccount);
    orao_solana_vrf::cpi::request_v2(
        CpiContext::new(
            vrf.to_account_info(),
            RequestV2 {
                payer: payer.clone(),
                network_state: network_state.to_account_info(),
                treasury: treasury.to_account_info(),
                request: request.to_account_info(),
                system_program: system_program.clone(),
            },
        ),
        seed,
    )?;
    Ok(expected)
}
