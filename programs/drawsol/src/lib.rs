use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Ezd47gH9g4jheYrN8M7svheSszkjpPXXvW3NHc2V4Emg");

#[program]
pub mod drawsol {
    use super::*;

    pub fn initialize_draw(
        ctx: Context<InitializeDraw>,
        draw_number: u8,
        ticket_cap: u32,
        skill_answer_hash: [u8; 32],
    ) -> Result<()> {
        instructions::initialize_draw::handler(ctx, draw_number, ticket_cap, skill_answer_hash)
    }

    pub fn buy_tickets(
        ctx: Context<BuyTickets>,
        quantity: u32,
        skill_answer_hash: [u8; 32],
        sol_price_usd: u64,
    ) -> Result<()> {
        instructions::buy_tickets::handler(ctx, quantity, skill_answer_hash, sol_price_usd)
    }

    pub fn vrf_callback(
        ctx: Context<VrfCallback>,
        slot_number: u32,
        randomness: [u8; 32],
    ) -> Result<()> {
        instructions::vrf_callback::handler(ctx, slot_number, randomness)
    }

    pub fn trigger_grand_draw(ctx: Context<TriggerGrandDraw>) -> Result<()> {
        instructions::trigger_grand_draw::handler(ctx)
    }

    pub fn settle_draw(ctx: Context<SettleDraw>, randomness: [u8; 32]) -> Result<()> {
        instructions::settle_draw::handler(ctx, randomness)
    }

    pub fn process_payout(ctx: Context<ProcessPayout>) -> Result<()> {
        instructions::process_payout::handler(ctx)
    }

    pub fn claim_free_entry(ctx: Context<ClaimFreeEntry>) -> Result<()> {
        instructions::claim_free_entry::handler(ctx)
    }
}
