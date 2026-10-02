//! DrawSol v3 — pot draws (nightly) and headline draws (weekly). See docs/SPEC-v3.md (and docs/SPEC.md).
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
pub mod vrf;

pub use constants::*;
pub use errors::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb");

#[program]
pub mod drawsol {
    use super::*;

    // ------------------------------------------------------------ config

    /// Fresh deployments: creates the v3 Config. Signer must be the program's upgrade authority.
    pub fn init_config(ctx: Context<InitConfig>, keeper: Pubkey) -> Result<()> {
        instructions::init_config::init_config_handler(ctx, keeper)
    }

    /// Admin only. Reallocs the v2 Config into the v3 layout and sets the keeper.
    pub fn migrate_config(ctx: Context<MigrateConfig>, keeper: Pubkey) -> Result<()> {
        instructions::init_config::migrate_config_handler(ctx, keeper)
    }

    /// Admin only.
    pub fn set_keeper(ctx: Context<SetKeeper>, keeper: Pubkey) -> Result<()> {
        instructions::init_config::set_keeper_handler(ctx, keeper)
    }

    // ------------------------------------------------------------ draws

    /// Admin or keeper. Nightly pot draw; no escrow. Enforces the house/pot/instant split bounds.
    pub fn create_pot_draw(ctx: Context<CreatePotDraw>, params: PotDrawParams) -> Result<()> {
        instructions::create_draw::create_pot_draw_handler(ctx, params)
    }

    /// Admin only. Headline draw; escrows the prize. Enforces sell-out house share and the floor margin.
    pub fn create_headline_draw(ctx: Context<CreateHeadlineDraw>, params: HeadlineDrawParams) -> Result<()> {
        instructions::create_draw::create_headline_draw_handler(ctx, params)
    }

    /// Buys `quantity` tickets as one entry, `use_credits` of them paid with credits.
    /// Pot draws with instant tiers request the entry's ORAO randomness.
    pub fn buy_tickets(ctx: Context<BuyTickets>, quantity: u16, use_credits: u16, client_nonce: [u8; 16]) -> Result<()> {
        instructions::buy_tickets::handler(ctx, quantity, use_credits, client_nonce)
    }

    /// Permissionless. Computes a pot entry's instant results and pays them from the instant pool.
    pub fn reveal_entry(ctx: Context<RevealEntry>) -> Result<()> {
        instructions::reveal_entry::handler(ctx)
    }

    /// One free ticket per wallet, up to `free_cap`. Rolls for instant wins in pot draws.
    pub fn claim_free_entry(ctx: Context<ClaimFreeEntry>, client_nonce: [u8; 16]) -> Result<()> {
        instructions::claim_free_entry::handler(ctx, client_nonce)
    }

    /// At draw_at: keeper/authority first, anyone after the public grace. Requests the grand-draw
    /// randomness, or cancels (no tickets / headline below min_tickets).
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

    /// Permissionless. Refunds an entry of a cancelled draw (paid − instant SOL received; credits back).
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        instructions::claim_refund::handler(ctx)
    }

    /// Authority only. House share after settlement; a cancelled headline's escrow.
    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        instructions::withdraw::handler(ctx)
    }

    // ------------------------------------------------------------ responsible play

    /// Spend limit per 30 days (0 = none). Decrease now, increase after 72 h.
    pub fn set_limit(ctx: Context<UpdateProfile>, lamports: u64) -> Result<()> {
        instructions::profile::set_limit_handler(ctx, lamports)
    }

    /// Self-exclusion until `until` (unix seconds); can only be extended.
    pub fn self_exclude(ctx: Context<UpdateProfile>, until: i64) -> Result<()> {
        instructions::profile::self_exclude_handler(ctx, until)
    }

    // ------------------------------------------------------------ legacy

    /// Admin only. Closes an empty or fully settled v2 draw + vault (raw-byte parse) into the admin.
    pub fn legacy_close_v2(ctx: Context<LegacyCloseV2>, draw_id: u64) -> Result<()> {
        instructions::legacy_close_v2::handler(ctx, draw_id)
    }
}
