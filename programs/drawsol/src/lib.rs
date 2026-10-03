//! DrawSol v4 — one draw kind: escrowed end prize with a fallback pot, a published schedule of instant
//! prizes, and ticket numbers assigned at random by ORAO VRF at reveal. See docs/SPEC-v4.md.
#![allow(unexpected_cfgs)]
#![allow(ambiguous_glob_reexports)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod fairness;
pub mod instructions;
pub mod side;
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

    /// Fresh deployments: creates the Config. Signer must be the program's upgrade authority.
    pub fn init_config(ctx: Context<InitConfig>, keeper: Pubkey) -> Result<()> {
        instructions::init_config::init_config_handler(ctx, keeper)
    }

    /// Admin only.
    pub fn set_keeper(ctx: Context<SetKeeper>, keeper: Pubkey) -> Result<()> {
        instructions::init_config::set_keeper_handler(ctx, keeper)
    }

    // ------------------------------------------------------------ draw setup (Draft)

    /// Admin or keeper. Creates a Draft draw with its vault, pool header and (zeroed) schedule.
    /// Validates the SPEC-v4 §1 inequalities.
    pub fn create_draw(ctx: Context<CreateDraw>, params: CreateDrawParams) -> Result<()> {
        instructions::create_draw::handler(ctx, params)
    }

    /// Admin or keeper. Fills `pool[from..to] = from..to` (sequential chunks of ≤ 2000), growing the account.
    pub fn init_pool(ctx: Context<InitPool>, from: u32, to: u32) -> Result<()> {
        instructions::init_pool::handler(ctx, from, to)
    }

    /// Admin or keeper. Registers winning numbers (≤ 300 per call), each once, per-tier counts enforced.
    pub fn set_schedule(ctx: Context<SetSchedule>, entries: Vec<ScheduleEntry>) -> Result<()> {
        instructions::set_schedule::handler(ctx, entries)
    }

    /// Authority. Draft → Open: pool complete, schedule complete, escrows end prize + schedule total,
    /// emits the schedule hash.
    pub fn open_draw(ctx: Context<OpenDraw>) -> Result<()> {
        instructions::open_draw::handler(ctx)
    }

    // ------------------------------------------------------------ play

    /// Buys `quantity` (≤ max_per_tx ≤ 1000) tickets as one entry and requests its ORAO randomness.
    pub fn buy_tickets(ctx: Context<BuyTickets>, quantity: u16, client_nonce: [u8; 16]) -> Result<()> {
        instructions::buy_tickets::handler(ctx, quantity, client_nonce)
    }

    /// One free ticket per wallet, up to `free_cap`: a normal ticket in every respect.
    pub fn claim_free_entry(ctx: Context<ClaimFreeEntry>, client_nonce: [u8; 16]) -> Result<()> {
        instructions::claim_free_entry::handler(ctx, client_nonce)
    }

    /// Permissionless. Assigns the entry's ticket numbers at random from the pool, looks them up in the
    /// schedule and pays the instant prizes from the vault to the owner.
    pub fn reveal_entry(ctx: Context<RevealEntry>) -> Result<()> {
        instructions::reveal_entry::handler(ctx)
    }

    // ------------------------------------------------------------ draw lifecycle

    /// At draw_at: keeper/authority first, anyone after the public grace. Requests the end-prize
    /// randomness, or cancels and returns the escrow when nothing was sold.
    pub fn request_draw(ctx: Context<RequestDraw>, client_nonce: [u8; 16]) -> Result<()> {
        instructions::request_draw::handler(ctx, client_nonce)
    }

    /// Permissionless. Pays the end prize (or the fallback pot) to the owner of the entry holding the
    /// winning position; returns unused escrow to the authority.
    pub fn settle_draw(ctx: Context<SettleDraw>) -> Result<()> {
        instructions::settle_draw::handler(ctx)
    }

    /// Cancels a draw whose randomness never arrived (anyone, 48 h after draw_at) or a Draft (authority).
    pub fn cancel_draw(ctx: Context<CancelDraw>) -> Result<()> {
        instructions::cancel_draw::handler(ctx)
    }

    /// Permissionless. Refunds an entry of a cancelled draw (paid − instant prizes received).
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        instructions::claim_refund::handler(ctx)
    }

    /// Authority only. House share (+ released schedule escrow) after settlement; a cancelled draw's escrow.
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

    /// Admin only. Closes a v3 draw + vault (raw-byte parse) into the admin: zero entries (escrow back),
    /// or Settled / Cancelled with nothing owed.
    pub fn legacy_close_v3(ctx: Context<LegacyCloseV3>, draw_id: u64) -> Result<()> {
        instructions::legacy_close_v3::handler(ctx, draw_id)
    }
}
