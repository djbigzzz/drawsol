use anchor_lang::prelude::*;

use crate::constants::*;
use crate::errors::DrawError;
use crate::events::EntryRevealed;
use crate::fairness::{assign_index, read_fulfilled_randomness};
use crate::side::{check_pool, check_schedule, pool_get, pool_remaining, pool_set, set_pool_remaining};
use crate::state::{DrawStatus, DrawV4, EntryV4, PlayerV4, Vault};
use crate::utils::pay_from_vault;

/// Permissionless: assigns the entry's ticket numbers at random (Fisher–Yates swap-remove over the Pool,
/// driven by the entry's ORAO randomness), looks each one up in the Schedule and pays the instant prizes
/// from the vault to the owner. Compute grows with `count`: a 1000-ticket reveal needs the client to
/// request a higher compute-unit limit (see BUILD.md).
#[derive(Accounts)]
pub struct RevealEntry<'info> {
    #[account(mut, seeds = [DRAW_SEED, &draw.id.to_le_bytes()], bump = draw.bump)]
    pub draw: Box<Account<'info, DrawV4>>,

    #[account(mut, seeds = [VAULT_SEED, draw.key().as_ref()], bump = draw.vault_bump)]
    pub vault: Account<'info, Vault>,

    /// CHECK: owner / discriminator checked in the handler; raw bytes.
    #[account(mut, seeds = [POOL_SEED, draw.key().as_ref()], bump = draw.pool_bump)]
    pub pool: UncheckedAccount<'info>,

    /// CHECK: owner / discriminator checked in the handler; raw bytes.
    #[account(mut, seeds = [SCHEDULE_SEED, draw.key().as_ref()], bump = draw.schedule_bump)]
    pub schedule: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [ENTRY_SEED, draw.key().as_ref(), &entry.seq.to_le_bytes()],
        bump = entry.bump,
        has_one = draw,
        has_one = owner,
    )]
    pub entry: Box<Account<'info, EntryV4>>,

    #[account(
        mut,
        seeds = [PLAYER_SEED, draw.key().as_ref(), entry.owner.as_ref()],
        bump = player.bump,
    )]
    pub player: Box<Account<'info, PlayerV4>>,

    /// CHECK: receives the instant prizes; pinned to the entry owner.
    #[account(mut, address = entry.owner)]
    pub owner: UncheckedAccount<'info>,

    /// CHECK: owner / seed / fulfilment checked in `read_fulfilled_randomness`.
    #[account(address = entry.vrf_request @ DrawError::VrfWrongAccount)]
    pub vrf_request: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<RevealEntry>) -> Result<()> {
    let draw_key = ctx.accounts.draw.key();
    let entry_key = ctx.accounts.entry.key();
    {
        let e = &ctx.accounts.entry;
        require!(!e.revealed, DrawError::AlreadyRevealed);
        // A cancelled draw refunds `paid − instant_paid`: no new instant payouts once refunds are open.
        let st = ctx.accounts.draw.status;
        require!(st != DrawStatus::Cancelled && st != DrawStatus::Draft, DrawError::WrongStatus);
    }
    let rnd = read_fulfilled_randomness(
        &ctx.accounts.vrf_request.to_account_info(),
        &ctx.accounts.entry.vrf_request,
        &ctx.accounts.entry.vrf_seed,
    )?;
    let pool = ctx.accounts.pool.to_account_info();
    let schedule = ctx.accounts.schedule.to_account_info();
    check_pool(&pool)?;
    check_schedule(&schedule)?;

    let d = &mut ctx.accounts.draw;
    let count = ctx.accounts.entry.count;
    let mut tickets: Vec<u32> = Vec::with_capacity(count as usize);
    let mut prizes: Vec<u8> = Vec::with_capacity(count as usize);
    let mut owed: u64 = 0;
    {
        let mut pd = pool.try_borrow_mut_data()?;
        let mut sd = schedule.try_borrow_mut_data()?;
        require!(pd.len() >= d.pool_len() && sd.len() >= d.schedule_len(), DrawError::PoolIncomplete);
        let mut remaining = pool_remaining(&pd);
        for i in 0..count as u32 {
            require!(remaining > 0, DrawError::PoolExhausted);
            let j = assign_index(&rnd, i, remaining) as usize;
            let last = (remaining - 1) as usize;
            let ticket = pool_get(&pd, j);
            let moved = pool_get(&pd, last);
            pool_set(&mut pd, j, moved);
            remaining -= 1;
            let o = SCHEDULE_BYTES_OFFSET + ticket as usize;
            let s = sd[o];
            let tier = s & SCHEDULE_TIER_MASK;
            if tier != 0 {
                // each number is assigned once, so a set won bit means a corrupt pool
                require!(s & SCHEDULE_WON_BIT == 0 && (tier as usize) <= MAX_TIERS, DrawError::PoolExhausted);
                sd[o] = s | SCHEDULE_WON_BIT;
                let t = &mut d.tiers[(tier - 1) as usize];
                t.won = t.won.checked_add(1).ok_or(DrawError::MathOverflow)?;
                owed = owed.checked_add(t.amount).ok_or(DrawError::MathOverflow)?;
            }
            tickets.push(ticket);
            prizes.push(tier);
        }
        set_pool_remaining(&mut pd, remaining);
    }

    // Each schedule number is won at most once, so Σ owed ≤ schedule_total while the escrow is held.
    // After the unwon escrow went back to the authority (Settled, all revealed / 48 h), a late reveal
    // still records its prizes but nothing is left to pay them from.
    let paid = if d.instant_escrow_returned { 0 } else { owed };
    require!(paid <= d.instant_escrow_left()?, DrawError::VaultShortfall);
    pay_from_vault(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        paid,
    )?;

    let e = &mut ctx.accounts.entry;
    e.revealed = true;
    e.tickets = tickets.clone();
    e.prizes = prizes.clone();
    e.instant_paid = paid;
    let (owner, seq) = (e.owner, e.seq);

    let p = &mut ctx.accounts.player;
    p.won_lamports = p.won_lamports.checked_add(paid).ok_or(DrawError::MathOverflow)?;

    d.assigned = d.assigned.checked_add(count as u32).ok_or(DrawError::MathOverflow)?;
    d.revealed_entries = d.revealed_entries.checked_add(1).ok_or(DrawError::MathOverflow)?;
    d.instants_paid = d.instants_paid.checked_add(paid).ok_or(DrawError::MathOverflow)?;

    emit!(EntryRevealed { draw: draw_key, entry: entry_key, owner, seq, tickets, prizes, paid });
    Ok(())
}
