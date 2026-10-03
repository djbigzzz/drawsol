//! Generates / checks `fixtures/fairness_vectors.json`: cross-language test vectors produced by the
//! program's own fairness functions, for `scripts/lib.ts` and the app's `fairness.ts`.
//!
//! The file is (re)written when missing or when `DRAWSOL_REGEN_VECTORS=1`; otherwise the test asserts
//! that the committed file still matches what the Rust code produces.
//!
//! v4 sections: `assign` (random ticket assignment over a pool state), `winning_position`,
//! `entry_seed_v4`, `draw_seed_v4`, `pdas_v4`, `functions_v4`. The v2 (`entry_seed`, `draw_seed`, `pdas`,
//! `ticket_tier`, `winning_ticket`) and v3 (`*_v3`) sections are kept byte-identical for verifying the
//! history of draws #0–#6.
mod common;

use anchor_lang::prelude::Pubkey;
use common::*;
use drawsol::fairness::*;
use serde_json::{json, Value};

/// v2 instant tier (amount in lamports), kept only so the v2 vector sections stay identical.
#[derive(Clone, Copy)]
struct IwTier {
    amount: u64,
    odds: u32,
}

fn odds(t: &[IwTier; 4]) -> [u32; 4] {
    [t[0].odds, t[1].odds, t[2].odds, t[3].odds]
}

/// v2 devnet demo tiers (SPEC.md §3).
fn demo_tiers() -> [IwTier; 4] {
    [
        IwTier { amount: SOL / 5, odds: 10 },
        IwTier { amount: SOL / 20, odds: 40 },
        IwTier { amount: SOL / 100, odds: 150 },
        IwTier { amount: 0, odds: 0 },
    ]
}

fn legacy_pda(seeds: &[&[u8]]) -> Pubkey {
    pda(seeds)
}
fn v3_draw_pda(id: u64) -> Pubkey {
    pda(&[b"draw3", &id.to_le_bytes()])
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Deterministic 64-byte randomness: sha256 chain of a label (so vectors are easy to reproduce).
fn rnd(label: &str) -> [u8; 64] {
    use anchor_lang::solana_program::hash::hashv;
    let a = hashv(&[label.as_bytes(), b"/0"]).to_bytes();
    let b = hashv(&[label.as_bytes(), b"/1"]).to_bytes();
    let mut r = [0u8; 64];
    r[..32].copy_from_slice(&a);
    r[32..].copy_from_slice(&b);
    r
}

fn key(label: &str) -> Pubkey {
    Pubkey::new_from_array(anchor_lang::solana_program::hash::hashv(&[label.as_bytes()]).to_bytes())
}

fn tiers_json(t: &[IwTier; 4]) -> Value {
    Value::Array(t.iter().map(|t| json!({ "amount": t.amount.to_string(), "odds": t.odds })).collect())
}

fn seeds_json(domain_fn: impl Fn(&Pubkey, &Pubkey, u32, &[u8; 16]) -> [u8; 32], draw_of: impl Fn(usize) -> Pubkey) -> Vec<Value> {
    let mut out = Vec::new();
    for (i, (seq, nonce)) in [(0u32, [0u8; 16]), (1, [0xAB; 16]), (4_000_000_000, *b"0123456789abcdef")].iter().enumerate() {
        let draw = draw_of(i);
        let buyer = key(&format!("buyer-{i}"));
        let seed = domain_fn(&draw, &buyer, *seq, nonce);
        out.push(json!({
            "draw": draw.to_string(),
            "buyer": buyer.to_string(),
            "seq": seq,
            "client_nonce": hex(nonce),
            "seed": hex(&seed),
            "vrf_request": vrf_request_address(&seed).to_string(),
        }));
    }
    out
}

fn draw_seeds_json(domain_fn: impl Fn(&Pubkey, u32, &[u8; 16]) -> [u8; 32], draw_of: impl Fn(usize) -> Pubkey, ns: [u32; 2], field: &str) -> Vec<Value> {
    let mut out = Vec::new();
    for (i, (n, nonce)) in [(ns[0], [7u8; 16]), (ns[1], *b"fedcba9876543210")].iter().enumerate() {
        let draw = draw_of(i);
        let seed = domain_fn(&draw, *n, nonce);
        out.push(json!({
            "draw": draw.to_string(),
            field: n,
            "client_nonce": hex(nonce),
            "seed": hex(&seed),
            "vrf_request": vrf_request_address(&seed).to_string(),
        }));
    }
    out
}

fn build() -> Value {
    let demo = demo_tiers();
    let prod = [
        IwTier { amount: SOL, odds: 4 },
        IwTier { amount: SOL / 4, odds: 16 },
        IwTier { amount: SOL / 20, odds: 120 },
        IwTier { amount: 15 * SOL / 1000, odds: 400 },
    ];

    // --- v2/v3 per-ticket instant tiers (history only)
    let mut ticket_cases = Vec::new();
    let mut add_ticket = |label: &str, ticket: u32, denom: u32, tiers: &[IwTier; 4]| {
        let r = rnd(label);
        let roll = ticket_roll(&r, ticket);
        ticket_cases.push(json!({
            "randomness": hex(&r),
            "ticket": ticket,
            "denominator": denom,
            "tiers": tiers_json(tiers),
            "roll": roll.to_string(),
            "x": uniform_index(roll, denom),
            "tier": ticket_tier(&r, ticket, denom, &odds(tiers)),
        }));
    };
    add_ticket("ticket-a", 0, 1000, &demo);
    add_ticket("ticket-b", 41, 1000, &demo);
    add_ticket("ticket-c", 9_999, 10_000, &prod);
    add_ticket("ticket-d", 123_456, 10_000, &prod);
    let r = rnd("ticket-search");
    for want in 1..=3u8 {
        let t = (0u32..100_000).find(|&t| ticket_tier(&r, t, 1000, &odds(&demo)) == want).unwrap();
        add_ticket("ticket-search", t, 1000, &demo);
    }

    // --- v2/v3 grand-draw winning ticket == v4 winning position (same function)
    let mut win_cases = Vec::new();
    for (label, n) in [("win-a", 1u32), ("win-b", 150), ("win-c", 165), ("win-d", 10_500), ("win-e", u32::MAX)] {
        let r = rnd(label);
        let h = anchor_lang::solana_program::hash::hashv(&[&r, b"draw"]).to_bytes();
        win_cases.push(json!({
            "randomness": hex(&r),
            "next_ticket": n,
            "roll": u64::from_le_bytes(h[..8].try_into().unwrap()).to_string(),
            "winning_ticket": winning_ticket(&r, n),
        }));
    }

    // --- v2 seeds / PDAs (draws #0–#1)
    let v2_draw_pda = |id: u64| legacy_pda(&[b"draw", &id.to_le_bytes()]);
    let entry_seeds = seeds_json(entry_vrf_seed_v2, |i| v2_draw_pda(i as u64));
    let draw_seeds = draw_seeds_json(draw_vrf_seed_v2, |i| v2_draw_pda(i as u64), [1, 150], "next_ticket");
    let d0 = v2_draw_pda(0);
    let w = key("buyer-0");
    let pdas = json!({
        "config": config_pda().to_string(),
        "draw_0": d0.to_string(),
        "draw_1": v2_draw_pda(1).to_string(),
        "vault_of_draw_0": legacy_pda(&[b"vault", d0.as_ref()]).to_string(),
        "entry_0_of_draw_0": legacy_pda(&[b"entry", d0.as_ref(), &0u32.to_le_bytes()]).to_string(),
        "entry_7_of_draw_0": legacy_pda(&[b"entry", d0.as_ref(), &7u32.to_le_bytes()]).to_string(),
        "player_of_draw_0": { "wallet": w.to_string(), "player": legacy_pda(&[b"player", d0.as_ref(), w.as_ref()]).to_string() },
    });

    // --- v3 seeds / PDAs (draws #2–#6)
    let entry_seeds_v3 = seeds_json(entry_vrf_seed_v3, |i| v3_draw_pda(2 + i as u64));
    let draw_seeds_v3 = draw_seeds_json(draw_vrf_seed_v3, |i| v3_draw_pda(2 + i as u64), [1, 300], "next_ticket");
    let d2 = v3_draw_pda(2);
    let pdas_v3 = json!({
        "config": config_pda().to_string(),
        "draw_2": d2.to_string(),
        "draw_3": v3_draw_pda(3).to_string(),
        "vault_of_draw_2": legacy_pda(&[b"vault3", d2.as_ref()]).to_string(),
        "entry_0_of_draw_2": legacy_pda(&[b"entry3", d2.as_ref(), &0u32.to_le_bytes()]).to_string(),
        "entry_7_of_draw_2": legacy_pda(&[b"entry3", d2.as_ref(), &7u32.to_le_bytes()]).to_string(),
        "player_of_draw_2": { "wallet": w.to_string(), "player": legacy_pda(&[b"player3", d2.as_ref(), w.as_ref()]).to_string() },
        "profile": { "wallet": w.to_string(), "profile": profile_pda(&w).to_string() },
    });

    // --- v4: random ticket assignment over a pool state
    let mut assign_cases = Vec::new();
    let mut add_assign = |label: &str, cap: u32, pre: &[(u16, &str)], count: u16| {
        // `pre`: earlier reveals (count, label) applied to a fresh 0..cap pool, so the pool state is
        // non-trivial; the vector records the pool *before* the assignment under test.
        let mut pool: Vec<u32> = (0..cap).collect();
        let mut remaining = cap;
        for (c, l) in pre {
            assign_tickets(&rnd(l), *c, &mut pool, &mut remaining);
        }
        let pool_before = pool[..remaining as usize].to_vec();
        let r = rnd(label);
        let rolls: Vec<String> = (0..count as u32).map(|i| assign_roll(&r, i).to_string()).collect();
        let tickets = assign_tickets(&r, count, &mut pool, &mut remaining);
        assign_cases.push(json!({
            "randomness": hex(&r),
            "cap": cap,
            "pool_before": pool_before,
            "remaining_before": pool_before.len(),
            "count": count,
            "rolls": rolls,
            "tickets": tickets,
            "pool_after": pool[..remaining as usize].to_vec(),
            "remaining_after": remaining,
        }));
    };
    add_assign("assign-a", 10, &[], 1);
    add_assign("assign-b", 10, &[], 10);
    add_assign("assign-c", 300, &[(30, "assign-pre-1"), (25, "assign-pre-2")], 7);
    add_assign("assign-d", 2000, &[(1000, "assign-pre-3")], 9);
    add_assign("assign-e", 65_535, &[], 5);

    // --- v4: winning position
    let mut pos_cases = Vec::new();
    for (label, n) in [("pos-a", 1u32), ("pos-b", 201), ("pos-c", 2000), ("pos-d", 65_535)] {
        let r = rnd(label);
        pos_cases.push(json!({ "randomness": hex(&r), "next_pos": n, "winning_pos": winning_position(&r, n) }));
    }

    // --- v4 seeds / PDAs (draw ids continue at 7 on devnet)
    let entry_seeds_v4 = seeds_json(entry_vrf_seed, |i| draw_pda(7 + i as u64));
    let draw_seeds_v4 = draw_seeds_json(draw_vrf_seed, |i| draw_pda(7 + i as u64), [1, 2000], "next_pos");
    let d7 = draw_pda(7);
    let pdas_v4 = json!({
        "config": config_pda().to_string(),
        "draw_7": d7.to_string(),
        "draw_8": draw_pda(8).to_string(),
        "vault_of_draw_7": vault_pda(&d7).to_string(),
        "pool_of_draw_7": pool_pda(&d7).to_string(),
        "schedule_of_draw_7": schedule_pda(&d7).to_string(),
        "entry_0_of_draw_7": entry_pda(&d7, 0).to_string(),
        "entry_7_of_draw_7": entry_pda(&d7, 7).to_string(),
        "player_of_draw_7": { "wallet": w.to_string(), "player": player_pda(&d7, &w).to_string() },
        "profile": { "wallet": w.to_string(), "profile": profile_pda(&w).to_string() },
    });

    json!({
        "description": "DrawSol fairness vectors, generated by programs/drawsol/src/fairness.rs. v4 sections: assign, winning_position, *_v4. v2/v3 sections verify the history of draws #0-#6. u64 values are decimal strings; byte arrays are lowercase hex; keys are base58.",
        "program_id": drawsol::ID.to_string(),
        "orao_program_id": orao_solana_vrf::ID.to_string(),
        "functions": {
            "entry_vrf_seed": "sha256('drawsol:v2:entry' || draw || buyer || seq_le_u32 || client_nonce[16])",
            "draw_vrf_seed": "sha256('drawsol:v2:draw' || draw || next_ticket_le_u32 || client_nonce[16])",
            "vrf_request": "PDA(['orao-vrf-randomness-request', seed], ORAO)",
            "ticket_roll": "u64_le(sha256(randomness64 || 'ticket' || ticket_le_u32)[0..8])",
            "x": "(roll * denominator) >> 64",
            "tier": "first i with x < sum(odds[0..=i]) -> i+1, else 0",
            "winning_ticket": "(u64_le(sha256(randomness64 || 'draw')[0..8]) * next_ticket) >> 64"
        },
        "ticket_tier": ticket_cases,
        "winning_ticket": win_cases,
        "entry_seed": entry_seeds,
        "draw_seed": draw_seeds,
        "pdas": pdas,
        "functions_v3": {
            "entry_vrf_seed": "sha256('drawsol:v3:entry' || draw || buyer || seq_le_u32 || client_nonce[16])",
            "draw_vrf_seed": "sha256('drawsol:v3:draw' || draw || next_ticket_le_u32 || client_nonce[16])",
            "pdas": "config ['config']; draw ['draw3', id_le_u64]; vault ['vault3', draw]; entry ['entry3', draw, seq_le_u32]; player ['player3', draw, wallet]; profile ['profile', wallet]",
            "ticket_roll / x / tier / winning_ticket": "unchanged from v2 (tier uses only each tier's odds)"
        },
        "entry_seed_v3": entry_seeds_v3,
        "draw_seed_v3": draw_seeds_v3,
        "pdas_v3": pdas_v3,
        "functions_v4": {
            "entry_vrf_seed": "sha256('drawsol:v4:entry' || draw || buyer || seq_le_u32 || client_nonce[16])",
            "draw_vrf_seed": "sha256('drawsol:v4:draw' || draw || next_pos_le_u32 || client_nonce[16])",
            "assign_roll": "u64_le(sha256(randomness64 || 'assign' || (i / 4)_le_u32)[8*(i % 4) .. 8*(i % 4) + 8]) for the i-th ticket of the entry (i from 0)",
            "assign_index": "assign_roll(i) mod remaining",
            "assign_tickets": "for i in 0..count: j = assign_index(i, remaining); ticket = pool[j]; pool[j] = pool[remaining - 1]; remaining -= 1  (pool = the draw's Pool account numbers[..remaining], before this entry)",
            "schedule": "Schedule account byte[ticket]: 0 = no prize, t+1 = tier t, bit 7 = won",
            "winning_pos": "(u64_le(sha256(randomness64 || 'draw')[0..8]) * next_pos) >> 64; winning_ticket = entry.tickets[winning_pos - entry.first_pos] of the entry with first_pos <= winning_pos < first_pos + count",
            "pdas": "config ['config']; draw ['draw4', id_le_u64]; vault ['vault4', draw]; pool ['pool', draw]; schedule ['schedule', draw]; entry ['entry4', draw, seq_le_u32]; player ['player4', draw, wallet]; profile ['profile', wallet]"
        },
        "assign": assign_cases,
        "winning_position": pos_cases,
        "entry_seed_v4": entry_seeds_v4,
        "draw_seed_v4": draw_seeds_v4,
        "pdas_v4": pdas_v4,
    })
}

#[test]
fn fairness_vectors() {
    let path = fixture("fairness_vectors.json");
    let generated = serde_json::to_string_pretty(&build()).unwrap() + "\n";
    let regen = std::env::var("DRAWSOL_REGEN_VECTORS").map(|v| v == "1").unwrap_or(false);
    match std::fs::read_to_string(&path) {
        Ok(existing) if !regen => assert_eq!(existing, generated, "fairness_vectors.json is stale; rerun with DRAWSOL_REGEN_VECTORS=1"),
        _ => std::fs::write(&path, generated).unwrap(),
    }
}

#[test]
fn fairness_properties() {
    // uniform_index stays in range at the extremes
    assert_eq!(uniform_index(u64::MAX, 1), 0);
    assert_eq!(uniform_index(u64::MAX, u32::MAX), u32::MAX - 1);
    assert_eq!(uniform_index(0, 150), 0);
    assert_eq!(winning_position(&rnd("x"), 1), 0);
    // assignment over a full pool is a permutation; every index is in range
    let r = rnd("perm");
    for cap in [1u32, 2, 7, 300, 2000] {
        let mut pool: Vec<u32> = (0..cap).collect();
        let mut rem = cap;
        let t = assign_tickets(&r, cap as u16, &mut pool, &mut rem);
        let mut sorted = t.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..cap).collect::<Vec<u32>>(), "cap {cap}");
        assert_eq!(rem, 0);
    }
    // the four rolls of one hash differ, and consecutive hashes differ
    let rolls: Vec<u64> = (0..8).map(|i| assign_roll(&r, i)).collect();
    assert_eq!(rolls.iter().collect::<std::collections::HashSet<_>>().len(), 8);
    // assignment is uniform-ish: over many entries of 1 ticket from a 10-number pool each number ≈ 10%
    let mut hits = [0u32; 10];
    for k in 0..20_000u32 {
        let mut pool: Vec<u32> = (0..10).collect();
        let mut rem = 10;
        let t = assign_tickets(&rnd(&format!("u{k}")), 1, &mut pool, &mut rem);
        hits[t[0] as usize] += 1;
    }
    assert!(hits.iter().all(|&h| (1_800..2_200).contains(&h)), "hits = {hits:?}");
    // v2/v3 history helpers still behave
    let tiers = odds(&demo_tiers());
    let r = rnd("hit-rate");
    let hits = (0..100_000u32).filter(|&t| ticket_tier(&r, t, 1000, &tiers) > 0).count();
    assert!((19_000..21_000).contains(&hits), "hits = {hits}");
    assert_eq!(ticket_tier(&r, 0, 0, &tiers), 0);
}
