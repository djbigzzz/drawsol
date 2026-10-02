//! Generates / checks `fixtures/fairness_vectors.json`: cross-language test vectors produced by the
//! program's own fairness functions, for `app/src/lib/fairness.ts`.
//!
//! The file is (re)written when missing or when `DRAWSOL_REGEN_VECTORS=1`; otherwise the test asserts
//! that the committed file still matches what the Rust code produces.
//!
//! v3 changed only the VRF seed domains (`drawsol:v3:*`) and the PDA seeds. The v2 sections
//! (`entry_seed`, `draw_seed`, `pdas`) are kept byte-identical for verifying legacy draws #0–#1;
//! the v3 ones are `entry_seed_v3`, `draw_seed_v3`, `pdas_v3`.
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

fn build() -> Value {
    let demo = demo_tiers();
    let prod = [
        IwTier { amount: SOL, odds: 4 },
        IwTier { amount: SOL / 4, odds: 16 },
        IwTier { amount: SOL / 20, odds: 120 },
        IwTier { amount: 15 * SOL / 1000, odds: 400 },
    ];

    // --- per-ticket instant tiers
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
    // A guaranteed winner for each demo tier: search tickets until each tier appears once.
    let r = rnd("ticket-search");
    for want in 1..=3u8 {
        let t = (0u32..100_000).find(|&t| ticket_tier(&r, t, 1000, &odds(&demo)) == want).unwrap();
        add_ticket("ticket-search", t, 1000, &demo);
    }

    // --- grand-draw winning ticket
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

    // --- VRF seeds and ORAO request PDAs (v2: legacy draws)
    let v2_draw_pda = |id: u64| legacy_pda(&[b"draw", &id.to_le_bytes()]);
    let mut entry_seeds = Vec::new();
    for (i, (seq, nonce)) in [(0u32, [0u8; 16]), (1, [0xAB; 16]), (4_000_000_000, *b"0123456789abcdef")].iter().enumerate() {
        let draw = v2_draw_pda(i as u64);
        let buyer = key(&format!("buyer-{i}"));
        let seed = entry_vrf_seed_v2(&draw, &buyer, *seq, nonce);
        entry_seeds.push(json!({
            "draw": draw.to_string(),
            "buyer": buyer.to_string(),
            "seq": seq,
            "client_nonce": hex(nonce),
            "seed": hex(&seed),
            "vrf_request": vrf_request_address(&seed).to_string(),
        }));
    }
    let mut draw_seeds = Vec::new();
    for (i, (n, nonce)) in [(1u32, [7u8; 16]), (150, *b"fedcba9876543210")].iter().enumerate() {
        let draw = v2_draw_pda(i as u64);
        let seed = draw_vrf_seed_v2(&draw, *n, nonce);
        draw_seeds.push(json!({
            "draw": draw.to_string(),
            "next_ticket": n,
            "client_nonce": hex(nonce),
            "seed": hex(&seed),
            "vrf_request": vrf_request_address(&seed).to_string(),
        }));
    }

    // --- program PDAs (for the frontend's address derivation), v2 legacy seeds
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

    // --- v3: seeds with the v3 domains, v3 PDA seeds (draw ids continue at 2 on devnet)
    let mut entry_seeds_v3 = Vec::new();
    for (i, (seq, nonce)) in [(0u32, [0u8; 16]), (1, [0xAB; 16]), (4_000_000_000, *b"0123456789abcdef")].iter().enumerate() {
        let draw = draw_pda(2 + i as u64);
        let buyer = key(&format!("buyer-{i}"));
        let seed = entry_vrf_seed(&draw, &buyer, *seq, nonce);
        entry_seeds_v3.push(json!({
            "draw": draw.to_string(),
            "buyer": buyer.to_string(),
            "seq": seq,
            "client_nonce": hex(nonce),
            "seed": hex(&seed),
            "vrf_request": vrf_request_address(&seed).to_string(),
        }));
    }
    let mut draw_seeds_v3 = Vec::new();
    for (i, (n, nonce)) in [(1u32, [7u8; 16]), (300, *b"fedcba9876543210")].iter().enumerate() {
        let draw = draw_pda(2 + i as u64);
        let seed = draw_vrf_seed(&draw, *n, nonce);
        draw_seeds_v3.push(json!({
            "draw": draw.to_string(),
            "next_ticket": n,
            "client_nonce": hex(nonce),
            "seed": hex(&seed),
            "vrf_request": vrf_request_address(&seed).to_string(),
        }));
    }
    let d2 = draw_pda(2);
    let pdas_v3 = json!({
        "config": config_pda().to_string(),
        "draw_2": d2.to_string(),
        "draw_3": draw_pda(3).to_string(),
        "vault_of_draw_2": vault_pda(&d2).to_string(),
        "entry_0_of_draw_2": entry_pda(&d2, 0).to_string(),
        "entry_7_of_draw_2": entry_pda(&d2, 7).to_string(),
        "player_of_draw_2": { "wallet": w.to_string(), "player": player_pda(&d2, &w).to_string() },
        "profile": { "wallet": w.to_string(), "profile": profile_pda(&w).to_string() },
    });

    json!({
        "description": "DrawSol v2 fairness vectors, generated by programs/drawsol/src/fairness.rs (SPEC §2.3). u64 values are decimal strings; byte arrays are lowercase hex; keys are base58.",
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
    // empirical hit rate of the demo table ≈ 200/1000
    let tiers = odds(&demo_tiers());
    let r = rnd("hit-rate");
    let hits = (0..100_000u32).filter(|&t| ticket_tier(&r, t, 1000, &tiers) > 0).count();
    assert!((19_000..21_000).contains(&hits), "hits = {hits}");
    // denominator 0 never wins
    assert_eq!(ticket_tier(&r, 0, 0, &tiers), 0);
    // v3 devnet nightly table (15 + 60 + 150 per 1000): any instant result ≈ 1 in 4.4
    let v3 = pot_params(T0).iw_tiers.map(|t| t.odds);
    let hits = (0..100_000u32).filter(|&t| ticket_tier(&r, t, 1000, &v3) > 0).count();
    assert!((21_500..23_500).contains(&hits), "v3 hits = {hits}");
}
