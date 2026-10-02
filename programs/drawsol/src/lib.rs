//! DrawSol v2 — escrowed prize draw. See docs/SPEC.md §2.
#![allow(unexpected_cfgs)]
#![allow(ambiguous_glob_reexports)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod fairness;
pub mod instructions;
pub mod state;
pub mod utils;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb");

#[program]
pub mod drawsol {
    use super::*;

    /// Creates the global Config. Signer must be the program's upgrade authority.
    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        instructions::init_config::handler(ctx)
    }

    /// Admin only. Creates a Draw + Vault and escrows prize + instant-win reserve.
    pub fn create_draw(ctx: Context<CreateDraw>, params: CreateDrawParams) -> Result<()> {
        instructions::create_draw::handler(ctx, params)
    }

    /// Buys `quantity` tickets as one Entry and requests its ORAO randomness.
    pub fn buy_tickets(ctx: Context<BuyTickets>, quantity: u16, client_nonce: [u8; 16]) -> Result<()> {
        instructions::buy_tickets::handler(ctx, quantity, client_nonce)
    }

    /// Permissionless. Computes the entry's instant results from fulfilled randomness and pays them.
    pub fn reveal_entry(ctx: Context<RevealEntry>) -> Result<()> {
        instructions::reveal_entry::handler(ctx)
    }

    /// One free grand-draw ticket per wallet, up to `free_cap`.
    pub fn claim_free_entry(ctx: Context<ClaimFreeEntry>) -> Result<()> {
        instructions::claim_free_entry::handler(ctx)
    }

    /// Permissionless once due. Requests the grand-draw randomness (or cancels if nobody entered).
    pub fn request_draw(ctx: Context<RequestDraw>, client_nonce: [u8; 16]) -> Result<()> {
        instructions::request_draw::handler(ctx, client_nonce)
    }

    /// Permissionless. Pays the prize to the owner of the entry holding the winning ticket.
    pub fn settle_draw(ctx: Context<SettleDraw>) -> Result<()> {
        instructions::settle_draw::handler(ctx)
    }

    /// Permissionless. Cancels a draw whose randomness never arrived (after the grace period).
    pub fn cancel_draw(ctx: Context<CancelDraw>) -> Result<()> {
        instructions::cancel_draw::handler(ctx)
    }

    /// Permissionless. Refunds a paid entry of a cancelled draw to its owner.
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        instructions::claim_refund::handler(ctx)
    }

    /// Authority only. Withdraws proceeds / reserve leftovers / an unpaid prize when allowed.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::handler(ctx)
    }
}
