//! Shared LiteSVM harness for the DrawSol v4 program.
//!
//! - drawsol is deployed as a real **upgradeable** program (Program + ProgramData accounts written with
//!   `set_account`) so `init_config`'s upgrade-authority check runs exactly as on chain.
//! - The real ORAO VRF program (dumped from devnet) runs `request_v2`; its network-state account is
//!   cloned from devnet. Fulfilment is simulated by overwriting the request account with the
//!   fulfilled `RandomnessV2` layout ORAO's `fulfill_v2` leaves behind.
//! - `reveal_entry` transactions carry a `SetComputeUnitLimit(1_400_000)` instruction, exactly as a
//!   client must for large entries (LiteSVM otherwise applies the 200k default).
#![allow(dead_code)]

use anchor_lang::{
    prelude::Pubkey,
    solana_program::{bpf_loader_upgradeable, clock::Clock, instruction::Instruction, system_instruction, system_program},
    AccountDeserialize, Discriminator, InstructionData, ToAccountMetas,
};
use drawsol::{
    constants::*,
    instructions::{CreateDrawParams, ScheduleEntry, TierParams},
    state::{Config, DrawV4, EntryV4, PlayerV4, Profile},
};
use litesvm::LiteSVM;
use orao_solana_vrf::state::{NetworkState, RandomnessV2};
use solana_account::Account;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

pub const ROOT: &str = env!("CARGO_MANIFEST_DIR");
pub const SOL: u64 = 1_000_000_000;
pub const CENT: u64 = SOL / 100;
/// Start of simulated time.
pub const T0: i64 = 1_800_000_000;
pub const MIN: i64 = 60;
pub const HOUR: i64 = 3600;
pub const DAY: i64 = 86400;
pub const CLOSE: i64 = T0 + 2 * HOUR;
/// Compute-unit limit a client requests for `reveal_entry` (and every other transaction here).
pub const CU_LIMIT: u32 = 1_400_000;
pub const COMPUTE_BUDGET_ID: Pubkey = Pubkey::new_from_array([
    3, 6, 70, 111, 229, 33, 23, 50, 255, 236, 173, 186, 114, 195, 155, 231, 188, 140, 229, 187, 197, 247, 18, 107, 44, 67,
    155, 58, 64, 0, 0, 0,
]);

pub fn fixture(name: &str) -> String {
    format!("{ROOT}/fixtures/{name}")
}

pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &drawsol::ID).0
}
pub fn config_pda() -> Pubkey {
    pda(&[b"config"])
}
pub fn draw_pda(id: u64) -> Pubkey {
    pda(&[b"draw4", &id.to_le_bytes()])
}
pub fn vault_pda(draw: &Pubkey) -> Pubkey {
    pda(&[b"vault4", draw.as_ref()])
}
pub fn pool_pda(draw: &Pubkey) -> Pubkey {
    pda(&[b"pool", draw.as_ref()])
}
pub fn schedule_pda(draw: &Pubkey) -> Pubkey {
    pda(&[b"schedule", draw.as_ref()])
}
pub fn player_pda(draw: &Pubkey, wallet: &Pubkey) -> Pubkey {
    pda(&[b"player4", draw.as_ref(), wallet.as_ref()])
}
pub fn entry_pda(draw: &Pubkey, seq: u32) -> Pubkey {
    pda(&[b"entry4", draw.as_ref(), &seq.to_le_bytes()])
}
pub fn profile_pda(wallet: &Pubkey) -> Pubkey {
    pda(&[b"profile", wallet.as_ref()])
}
pub fn legacy_v3_draw_pda(id: u64) -> Pubkey {
    pda(&[b"draw3", &id.to_le_bytes()])
}
pub fn legacy_v3_vault_pda(draw: &Pubkey) -> Pubkey {
    pda(&[b"vault3", draw.as_ref()])
}
pub fn programdata_pda(program: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[program.as_ref()], &bpf_loader_upgradeable::ID).0
}

pub const NO_TIER: TierParams = TierParams { amount: 0, count: 0 };
pub fn tier(amount: u64, count: u16) -> TierParams {
    TierParams { amount, count }
}
pub fn tiers(list: &[TierParams]) -> [TierParams; 8] {
    let mut t = [NO_TIER; 8];
    t[..list.len()].copy_from_slice(list);
    t
}

/// Test preset: 0.01 SOL tickets, cap 300, min 200, end prize 0.7 SOL (= 200 × 0.01 × 35% exactly),
/// house 5500 / pot 3500 / instant 1000, max 100 per tx, 200 per wallet, free cap 15, grace 30 min.
/// Schedule budget 0.3 SOL (= 10% × 300 × 0.01): 0.1 SOL × 1, 0.02 SOL × 5, 0.005 SOL × 20 (26 numbers).
pub fn params(closes_at: i64) -> CreateDrawParams {
    CreateDrawParams {
        ticket_price: CENT,
        ticket_cap: 300,
        max_per_tx: 100,
        max_per_wallet: 200,
        free_cap: 15,
        closes_at,
        draw_at: closes_at,
        public_grace_secs: 30 * MIN as u32,
        house_bps: 5500,
        pot_bps: 3500,
        instant_bps: 1000,
        end_prize_lamports: 70 * CENT,
        min_tickets: 200,
        tiers: tiers(&[tier(10 * CENT, 1), tier(2 * CENT, 5), tier(CENT / 2, 20)]),
        terms_hash: [7u8; 32],
    }
}

/// Params for a large draw: cap `cap`, 1000 per tx, 2000 per wallet, min = cap / 2, prices as the preset.
/// Schedule: 0.5 SOL × 1, 0.05 × 10, 0.01 × 50 (61 numbers, 1.5 SOL) — within 10% × cap × 0.01 for cap ≥ 1500.
pub fn big_params(closes_at: i64, cap: u32) -> CreateDrawParams {
    let mut p = params(closes_at);
    p.ticket_cap = cap;
    p.max_per_tx = 1000;
    p.max_per_wallet = 2000;
    p.min_tickets = cap / 2;
    p.end_prize_lamports = (cap as u64 / 2) * CENT * 35 / 100;
    p.tiers = tiers(&[tier(50 * CENT, 1), tier(5 * CENT, 10), tier(CENT, 50)]);
    p
}

pub fn schedule_total(p: &CreateDrawParams) -> u64 {
    p.tiers.iter().map(|t| t.amount * t.count as u64).sum()
}

/// Deterministic pseudo-random permutation of 0..n (sha256-driven Fisher–Yates) for picking schedules.
pub fn seeded_shuffle(n: u32, seed: &str) -> Vec<u32> {
    use anchor_lang::solana_program::hash::hashv;
    let mut v: Vec<u32> = (0..n).collect();
    for i in (1..n as usize).rev() {
        let h = hashv(&[seed.as_bytes(), &(i as u32).to_le_bytes()]).to_bytes();
        let r = u64::from_le_bytes(h[..8].try_into().unwrap());
        let j = (r % (i as u64 + 1)) as usize;
        v.swap(i, j);
    }
    v
}

/// A schedule for `p`: the first Σ count numbers of a seeded shuffle, tier by tier.
pub fn default_schedule(p: &CreateDrawParams) -> Vec<ScheduleEntry> {
    let order = seeded_shuffle(p.ticket_cap, "schedule");
    let mut out = Vec::new();
    let mut k = 0;
    for (t, tp) in p.tiers.iter().enumerate() {
        for _ in 0..tp.count {
            out.push(ScheduleEntry { ticket: order[k], tier: t as u8 });
            k += 1;
        }
    }
    out
}

/// Expected reveal recomputed with the program's public fairness functions over the current pool
/// and schedule: (tickets, prizes, owed lamports).
pub fn expected_reveal(rnd: &[u8; 64], d: &DrawV4, count: u16, pool: &[u32], remaining: u32, schedule: &[u8]) -> (Vec<u32>, Vec<u8>, u64) {
    let mut pool = pool.to_vec();
    let mut rem = remaining;
    let tickets = drawsol::fairness::assign_tickets(rnd, count, &mut pool, &mut rem);
    let mut prizes = Vec::new();
    let mut owed = 0u64;
    for &t in &tickets {
        let s = schedule[t as usize];
        let tier = s & SCHEDULE_TIER_MASK;
        prizes.push(tier);
        if tier > 0 {
            assert_eq!(s & SCHEDULE_WON_BIT, 0, "ticket {t} already won");
            owed += d.tiers[tier as usize - 1].amount;
        }
    }
    (tickets, prizes, owed)
}

/// Deterministic search for randomness whose recomputed reveal satisfies `pred(tickets, prizes, owed)`.
pub fn find_randomness(d: &DrawV4, count: u16, pool: &[u32], remaining: u32, schedule: &[u8], pred: impl Fn(&[u32], &[u8], u64) -> bool) -> [u8; 64] {
    for k in 0u32..200_000 {
        let mut rnd = [0u8; 64];
        rnd[..4].copy_from_slice(&k.to_le_bytes());
        rnd[4..].fill(0xA5);
        let (t, p, o) = expected_reveal(&rnd, d, count, pool, remaining, schedule);
        if pred(&t, &p, o) {
            return rnd;
        }
    }
    panic!("no randomness found");
}

/// Randomness whose winning position satisfies `pred`.
pub fn find_draw_randomness(next_pos: u32, pred: impl Fn(u32) -> bool) -> [u8; 64] {
    for k in 0u32..100_000 {
        let mut rnd = [0u8; 64];
        rnd[..4].copy_from_slice(&k.to_le_bytes());
        rnd[4..].fill(0x5A);
        if pred(drawsol::fairness::winning_position(&rnd, next_pos)) {
            return rnd;
        }
    }
    panic!("no draw randomness found");
}

pub struct TxOk {
    pub cu: u64,
    pub logs: Vec<String>,
}

pub struct Bought {
    pub entry: Pubkey,
    pub req: Pubkey,
    pub seq: u32,
}

pub struct Env {
    pub svm: LiteSVM,
    /// Upgrade authority of the program and (after init_config) the admin = every draw's authority.
    pub admin: Keypair,
    pub keeper: Keypair,
    /// Neutral fee payer so balance assertions on participants are exact.
    pub cranker: Keypair,
    pub vrf_config: Pubkey,
    pub treasury: Pubkey,
    pub request_fee: u64,
    nonce: u64,
}

impl Env {
    /// Program deployed, Config NOT initialised.
    pub fn bare() -> Self {
        let mut svm = LiteSVM::new();
        let admin = Keypair::new();
        let keeper = Keypair::new();
        let cranker = Keypair::new();
        svm.airdrop(&admin.pubkey(), 1_000 * SOL).unwrap();
        svm.airdrop(&keeper.pubkey(), 10 * SOL).unwrap();
        svm.airdrop(&cranker.pubkey(), 100 * SOL).unwrap();

        let elf = std::fs::read(format!("{ROOT}/../target/deploy/drawsol.so"))
            .expect("run `anchor build` first (target/deploy/drawsol.so)");
        deploy_upgradeable(&mut svm, drawsol::ID, &elf, Some(admin.pubkey()));
        svm.add_program_from_file(orao_solana_vrf::ID, fixture("orao_vrf.so")).unwrap();

        // ORAO network state, cloned from devnet (getAccountInfo JSON).
        let ns_data = rpc_fixture_data("network_state.json");
        let ns = NetworkState::try_deserialize(&mut &ns_data[..]).unwrap();
        let vrf_config = orao_solana_vrf::network_state_account_address(&orao_solana_vrf::ID);
        let lamports = svm.minimum_balance_for_rent_exemption(ns_data.len());
        svm.set_account(
            vrf_config,
            Account { lamports, data: ns_data, owner: orao_solana_vrf::ID, executable: false, rent_epoch: 0 },
        )
        .unwrap();
        let treasury = ns.config.treasury;
        svm.airdrop(&treasury, SOL).unwrap();

        let mut env = Env {
            svm,
            admin,
            keeper,
            cranker,
            vrf_config,
            treasury,
            request_fee: ns.config.request_fee,
            nonce: 0,
        };
        env.set_time(T0);
        env
    }

    /// Program deployed and Config initialised with `keeper`.
    pub fn new() -> Self {
        let mut env = Env::bare();
        env.init_config().unwrap();
        env
    }

    /// Config initialised and one draw fully set up and Open with `default_schedule(&p)`.
    pub fn with_draw(p: CreateDrawParams) -> (Self, Pubkey) {
        let mut env = Env::new();
        let draw = env.setup_draw(p).unwrap();
        (env, draw)
    }

    /// create → init_pool (chunks) → set_schedule (batches) → open, all by the admin.
    pub fn setup_draw(&mut self, p: CreateDrawParams) -> Result<Pubkey, String> {
        let schedule = default_schedule(&p);
        self.setup_draw_with(p, &schedule)
    }

    pub fn setup_draw_with(&mut self, p: CreateDrawParams, schedule: &[ScheduleEntry]) -> Result<Pubkey, String> {
        let draw = self.create(p.clone())?;
        self.init_pool_all(&draw)?;
        self.set_schedule_all(&draw, schedule)?;
        self.open(&draw)?;
        Ok(draw)
    }

    // ------------------------------------------------------------------ plumbing

    pub fn set_time(&mut self, unix_timestamp: i64) {
        let mut c: Clock = self.svm.get_sysvar();
        c.unix_timestamp = unix_timestamp;
        c.slot += 1;
        self.svm.set_sysvar(&c);
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn user(&mut self, sol: u64) -> Keypair {
        let k = Keypair::new();
        self.svm.airdrop(&k.pubkey(), sol * SOL).unwrap();
        k
    }

    pub fn next_nonce(&mut self) -> [u8; 16] {
        self.nonce += 1;
        let mut n = [0u8; 16];
        n[..8].copy_from_slice(&self.nonce.to_le_bytes());
        n
    }

    /// `SetComputeUnitLimit(limit)` — what a client prepends for large reveals.
    pub fn cu_limit_ix(limit: u32) -> Instruction {
        let mut data = vec![2u8];
        data.extend_from_slice(&limit.to_le_bytes());
        Instruction { program_id: COMPUTE_BUDGET_ID, accounts: vec![], data }
    }

    /// Sends one transaction. `signers[0]` is the fee payer.
    pub fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> Result<TxOk, String> {
        let tx = Transaction::new(
            signers,
            Message::new(ixs, Some(&signers[0].pubkey())),
            self.svm.latest_blockhash(),
        );
        let r = self.svm.send_transaction(tx);
        self.svm.expire_blockhash();
        match r {
            Ok(m) => Ok(TxOk { cu: m.compute_units_consumed, logs: m.logs }),
            Err(e) => Err(format!("{:?}\n{}", e.err, e.meta.logs.join("\n"))),
        }
    }

    /// Sends `ix` paid for by the neutral cranker.
    pub fn crank(&mut self, ix: Instruction) -> Result<TxOk, String> {
        let c = self.cranker.insecure_clone();
        self.send(&[ix], &[&c])
    }

    /// Plain SOL transfer (e.g. topping up a vault).
    pub fn transfer(&mut self, from: &Keypair, to: &Pubkey, lamports: u64) {
        let ix = system_instruction::transfer(&from.pubkey(), to, lamports);
        self.send(&[ix], &[from]).unwrap();
    }

    pub fn balance(&self, k: &Pubkey) -> u64 {
        self.svm.get_account(k).map(|a| a.lamports).unwrap_or(0)
    }
    pub fn rent(&self, len: usize) -> u64 {
        self.svm.minimum_balance_for_rent_exemption(len)
    }
    pub fn vault_rent(&self) -> u64 {
        self.rent(8)
    }
    /// Vault balance above rent.
    pub fn vault_free(&self, draw: &Pubkey) -> u64 {
        self.balance(&vault_pda(draw)) - self.vault_rent()
    }
    pub fn load<T: AccountDeserialize>(&self, k: &Pubkey) -> T {
        let acc = self.svm.get_account(k).unwrap_or_else(|| panic!("account {k} missing"));
        T::try_deserialize(&mut &acc.data[..]).unwrap()
    }
    pub fn config(&self) -> Config {
        self.load(&config_pda())
    }
    pub fn draw(&self, k: &Pubkey) -> DrawV4 {
        self.load(k)
    }
    pub fn entry(&self, k: &Pubkey) -> EntryV4 {
        self.load(k)
    }
    pub fn player(&self, draw: &Pubkey, wallet: &Pubkey) -> PlayerV4 {
        self.load(&player_pda(draw, wallet))
    }
    pub fn profile(&self, wallet: &Pubkey) -> Profile {
        self.load(&profile_pda(wallet))
    }
    /// Raw Pool account: (remaining, numbers[..cap]).
    pub fn pool(&self, draw: &Pubkey) -> (u32, Vec<u32>) {
        let cap = self.draw(draw).ticket_cap;
        let acc = self.svm.get_account(&pool_pda(draw)).expect("pool");
        assert_eq!(&acc.data[..8], drawsol::state::Pool::DISCRIMINATOR);
        let remaining = drawsol::side::pool_remaining(&acc.data);
        let n = ((acc.data.len() - POOL_NUMBERS_OFFSET) / 4).min(cap as usize) as u32;
        (remaining, drawsol::side::pool_numbers(&acc.data, n))
    }
    /// Raw Schedule bytes (cap of them; shorter while the account is still growing).
    pub fn schedule(&self, draw: &Pubkey) -> Vec<u8> {
        let cap = self.draw(draw).ticket_cap as usize;
        let acc = self.svm.get_account(&schedule_pda(draw)).expect("schedule");
        assert_eq!(&acc.data[..8], drawsol::state::Schedule::DISCRIMINATOR);
        acc.data[SCHEDULE_BYTES_OFFSET..].iter().copied().take(cap).collect()
    }
    pub fn schedule_hash(&self, draw: &Pubkey) -> [u8; 32] {
        anchor_lang::solana_program::hash::hashv(&[&self.schedule(draw)]).to_bytes()
    }

    /// Overwrites a pending ORAO request with its fulfilled form (what FulfillV2 leaves on chain).
    /// Layout (137 bytes): disc[8] | tag u8 = 1 | client Pubkey | seed [u8;32] | randomness [u8;64]
    pub fn fulfill(&mut self, req: &Pubkey, randomness: [u8; 64]) {
        let acc = self.svm.get_account(req).expect("request exists");
        assert_eq!(&acc.data[..8], RandomnessV2::DISCRIMINATOR);
        assert_eq!(acc.data[8], 0, "request should be pending");
        let mut data = Vec::with_capacity(137);
        data.extend_from_slice(RandomnessV2::DISCRIMINATOR);
        data.push(1);
        data.extend_from_slice(&acc.data[9..73]); // client + seed
        data.extend_from_slice(&randomness);
        self.write_orao_account(*req, data, orao_solana_vrf::ID);
    }

    /// Writes an arbitrary fulfilled RandomnessV2 account (used to forge bad accounts in tests).
    pub fn forge_fulfilled(&mut self, at: Pubkey, client: Pubkey, seed: [u8; 32], rnd: [u8; 64], owner: Pubkey) {
        let mut data = Vec::with_capacity(137);
        data.extend_from_slice(RandomnessV2::DISCRIMINATOR);
        data.push(1);
        data.extend_from_slice(client.as_ref());
        data.extend_from_slice(&seed);
        data.extend_from_slice(&rnd);
        self.write_orao_account(at, data, owner);
    }

    fn write_orao_account(&mut self, at: Pubkey, data: Vec<u8>, owner: Pubkey) {
        let lamports = self.rent(data.len());
        self.svm
            .set_account(at, Account { lamports, data, owner, executable: false, rent_epoch: 0 })
            .unwrap();
    }

    // ------------------------------------------------------------------ config

    pub fn ix_init_config(&self, signer: &Pubkey, program_data: Pubkey, keeper: Pubkey) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::InitConfig {
                config: config_pda(),
                admin: *signer,
                program: drawsol::ID,
                program_data,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::InitConfig { keeper }.data(),
        }
    }

    pub fn init_config(&mut self) -> Result<TxOk, String> {
        let ix = self.ix_init_config(&self.admin.pubkey(), programdata_pda(&drawsol::ID), self.keeper.pubkey());
        let admin = self.admin.insecure_clone();
        self.send(&[ix], &[&admin])
    }

    pub fn ix_set_keeper(&self, signer: &Pubkey, keeper: Pubkey) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::SetKeeper { config: config_pda(), admin: *signer }.to_account_metas(None),
            data: drawsol::instruction::SetKeeper { keeper }.data(),
        }
    }

    // ------------------------------------------------------------------ setup (Draft)

    pub fn ix_create(&self, creator: &Pubkey, id: u64, params: CreateDrawParams) -> Instruction {
        let draw = draw_pda(id);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::CreateDraw {
                config: config_pda(),
                draw,
                vault: vault_pda(&draw),
                pool: pool_pda(&draw),
                schedule: schedule_pda(&draw),
                creator: *creator,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::CreateDraw { params }.data(),
        }
    }

    pub fn create_as(&mut self, creator: &Keypair, params: CreateDrawParams) -> Result<Pubkey, String> {
        let id = self.config().next_draw_id;
        let ix = self.ix_create(&creator.pubkey(), id, params);
        self.send(&[ix], &[creator])?;
        Ok(draw_pda(id))
    }

    pub fn create(&mut self, params: CreateDrawParams) -> Result<Pubkey, String> {
        let admin = self.admin.insecure_clone();
        self.create_as(&admin, params)
    }

    pub fn ix_init_pool(&self, payer: &Pubkey, draw: &Pubkey, from: u32, to: u32) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::InitPool {
                config: config_pda(),
                draw: *draw,
                pool: pool_pda(draw),
                schedule: schedule_pda(draw),
                payer: *payer,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::InitPool { from, to }.data(),
        }
    }

    pub fn init_pool_as(&mut self, payer: &Keypair, draw: &Pubkey, from: u32, to: u32) -> Result<TxOk, String> {
        let ix = self.ix_init_pool(&payer.pubkey(), draw, from, to);
        self.send(&[ix], &[payer])
    }

    pub fn init_pool(&mut self, draw: &Pubkey, from: u32, to: u32) -> Result<TxOk, String> {
        let admin = self.admin.insecure_clone();
        self.init_pool_as(&admin, draw, from, to)
    }

    /// Fills the whole pool in chunks of POOL_CHUNK_MAX.
    pub fn init_pool_all(&mut self, draw: &Pubkey) -> Result<(), String> {
        let cap = self.draw(draw).ticket_cap;
        let mut from = self.pool(draw).0;
        while from < cap {
            let to = (from + POOL_CHUNK_MAX).min(cap);
            self.init_pool(draw, from, to)?;
            from = to;
        }
        Ok(())
    }

    pub fn ix_set_schedule(&self, signer: &Pubkey, draw: &Pubkey, entries: Vec<ScheduleEntry>) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::SetSchedule {
                config: config_pda(),
                draw: *draw,
                schedule: schedule_pda(draw),
                signer: *signer,
            }
            .to_account_metas(None),
            data: drawsol::instruction::SetSchedule { entries }.data(),
        }
    }

    pub fn set_schedule_as(&mut self, signer: &Keypair, draw: &Pubkey, entries: &[ScheduleEntry]) -> Result<TxOk, String> {
        let ix = self.ix_set_schedule(&signer.pubkey(), draw, entries.to_vec());
        self.send(&[ix], &[signer])
    }

    pub fn set_schedule(&mut self, draw: &Pubkey, entries: &[ScheduleEntry]) -> Result<TxOk, String> {
        let admin = self.admin.insecure_clone();
        self.set_schedule_as(&admin, draw, entries)
    }

    /// Registers the schedule in batches of SCHEDULE_BATCH_MAX.
    pub fn set_schedule_all(&mut self, draw: &Pubkey, entries: &[ScheduleEntry]) -> Result<(), String> {
        for chunk in entries.chunks(SCHEDULE_BATCH_MAX) {
            self.set_schedule(draw, chunk)?;
        }
        Ok(())
    }

    pub fn ix_open(&self, authority: &Pubkey, draw: &Pubkey) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::OpenDraw {
                draw: *draw,
                vault: vault_pda(draw),
                pool: pool_pda(draw),
                schedule: schedule_pda(draw),
                authority: *authority,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::OpenDraw {}.data(),
        }
    }

    pub fn open_as(&mut self, authority: &Keypair, draw: &Pubkey) -> Result<TxOk, String> {
        let ix = self.ix_open(&authority.pubkey(), draw);
        self.send(&[ix], &[authority])
    }

    pub fn open(&mut self, draw: &Pubkey) -> Result<TxOk, String> {
        let admin = self.admin.insecure_clone();
        self.open_as(&admin, draw)
    }

    // ------------------------------------------------------------------ play

    /// Builds buy_tickets for the next entry. Returns (instruction, entry, vrf_request).
    pub fn ix_buy(&mut self, draw: &Pubkey, buyer: &Pubkey, quantity: u16) -> (Instruction, Pubkey, Pubkey) {
        let nonce = self.next_nonce();
        let seq = self.draw(draw).entry_count;
        let req = drawsol::fairness::vrf_request_address(&drawsol::fairness::entry_vrf_seed(draw, buyer, seq, &nonce));
        let ix = self.ix_buy_raw(draw, buyer, seq, quantity, nonce, req);
        (ix, entry_pda(draw, seq), req)
    }

    pub fn ix_buy_raw(&self, draw: &Pubkey, buyer: &Pubkey, seq: u32, quantity: u16, client_nonce: [u8; 16], vrf_request: Pubkey) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::BuyTickets {
                draw: *draw,
                vault: vault_pda(draw),
                entry: entry_pda(draw, seq),
                player: player_pda(draw, buyer),
                profile: profile_pda(buyer),
                buyer: *buyer,
                vrf_request,
                vrf_config: self.vrf_config,
                vrf_treasury: self.treasury,
                vrf: orao_solana_vrf::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::BuyTickets { quantity, client_nonce }.data(),
        }
    }

    pub fn buy(&mut self, draw: &Pubkey, buyer: &Keypair, quantity: u16) -> Result<Bought, String> {
        let seq = self.draw(draw).entry_count;
        let (ix, entry, req) = self.ix_buy(draw, &buyer.pubkey(), quantity);
        self.send(&[ix], &[buyer])?;
        Ok(Bought { entry, req, seq })
    }

    pub fn ix_claim_free(&mut self, draw: &Pubkey, buyer: &Pubkey) -> (Instruction, Pubkey, Pubkey) {
        let nonce = self.next_nonce();
        let seq = self.draw(draw).entry_count;
        let req = drawsol::fairness::vrf_request_address(&drawsol::fairness::entry_vrf_seed(draw, buyer, seq, &nonce));
        let entry = entry_pda(draw, seq);
        let ix = Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::ClaimFreeEntry {
                draw: *draw,
                entry,
                player: player_pda(draw, buyer),
                profile: profile_pda(buyer),
                buyer: *buyer,
                vrf_request: req,
                vrf_config: self.vrf_config,
                vrf_treasury: self.treasury,
                vrf: orao_solana_vrf::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::ClaimFreeEntry { client_nonce: nonce }.data(),
        };
        (ix, entry, req)
    }

    pub fn claim_free(&mut self, draw: &Pubkey, buyer: &Keypair) -> Result<Bought, String> {
        let seq = self.draw(draw).entry_count;
        let (ix, entry, req) = self.ix_claim_free(draw, &buyer.pubkey());
        self.send(&[ix], &[buyer])?;
        Ok(Bought { entry, req, seq })
    }

    pub fn ix_reveal_with(&self, draw: &Pubkey, entry: &Pubkey, vrf_request: Pubkey) -> Instruction {
        let e = self.entry(entry);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::RevealEntry {
                draw: *draw,
                vault: vault_pda(draw),
                pool: pool_pda(draw),
                schedule: schedule_pda(draw),
                entry: *entry,
                player: player_pda(draw, &e.owner),
                owner: e.owner,
                vrf_request,
            }
            .to_account_metas(None),
            data: drawsol::instruction::RevealEntry {}.data(),
        }
    }

    /// Sends a reveal (plus the compute-budget instruction a client sends) paid for by the cranker.
    pub fn crank_reveal(&mut self, ix: Instruction) -> Result<TxOk, String> {
        let c = self.cranker.insecure_clone();
        self.send(&[Env::cu_limit_ix(CU_LIMIT), ix], &[&c])
    }

    pub fn reveal(&mut self, draw: &Pubkey, entry: &Pubkey) -> Result<TxOk, String> {
        let req = self.entry(entry).vrf_request;
        let ix = self.ix_reveal_with(draw, entry, req);
        self.crank_reveal(ix)
    }

    /// Recomputes the reveal of `entry` under `rnd` from the current pool / schedule.
    pub fn expected(&self, draw: &Pubkey, entry: &Pubkey, rnd: &[u8; 64]) -> (Vec<u32>, Vec<u8>, u64) {
        let d = self.draw(draw);
        let e = self.entry(entry);
        let (rem, pool) = self.pool(draw);
        expected_reveal(rnd, &d, e.count, &pool, rem, &self.schedule(draw))
    }

    /// Randomness for `entry` whose recomputed reveal satisfies `pred`.
    pub fn find_rnd(&self, draw: &Pubkey, entry: &Pubkey, pred: impl Fn(&[u32], &[u8], u64) -> bool) -> [u8; 64] {
        let d = self.draw(draw);
        let e = self.entry(entry);
        let (rem, pool) = self.pool(draw);
        find_randomness(&d, e.count, &pool, rem, &self.schedule(draw), pred)
    }

    /// Fulfils the entry's request with `rnd` and reveals it.
    pub fn fulfill_and_reveal(&mut self, draw: &Pubkey, b: &Bought, rnd: [u8; 64]) -> TxOk {
        self.fulfill(&b.req, rnd);
        self.reveal(draw, &b.entry).unwrap()
    }

    // ------------------------------------------------------------------ draw lifecycle

    /// request_draw signed/paid by `payer`. Returns (instruction, vrf_request).
    pub fn ix_request_draw(&mut self, draw: &Pubkey, payer: &Pubkey) -> (Instruction, Pubkey) {
        let nonce = self.next_nonce();
        let d = self.draw(draw);
        let seed = drawsol::fairness::draw_vrf_seed(draw, d.next_pos, &nonce);
        let req = drawsol::fairness::vrf_request_address(&seed);
        (self.ix_request_draw_raw(draw, payer, nonce, Some(req)), req)
    }

    pub fn ix_request_draw_raw(&self, draw: &Pubkey, payer: &Pubkey, client_nonce: [u8; 16], vrf_request: Option<Pubkey>) -> Instruction {
        let d = self.draw(draw);
        let with = vrf_request.is_some();
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::RequestDraw {
                config: config_pda(),
                draw: *draw,
                vault: vault_pda(draw),
                authority: d.authority,
                payer: *payer,
                vrf_request,
                vrf_config: with.then_some(self.vrf_config),
                vrf_treasury: with.then_some(self.treasury),
                vrf: with.then_some(orao_solana_vrf::ID),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::RequestDraw { client_nonce }.data(),
        }
    }

    pub fn request_draw_as(&mut self, draw: &Pubkey, payer: &Keypair) -> Result<Pubkey, String> {
        let (ix, req) = self.ix_request_draw(draw, &payer.pubkey());
        self.send(&[ix], &[payer])?;
        Ok(req)
    }

    /// request_draw by the keeper.
    pub fn request_draw(&mut self, draw: &Pubkey) -> Result<Pubkey, String> {
        let k = self.keeper.insecure_clone();
        self.request_draw_as(draw, &k)
    }

    /// request_draw by the keeper with no ORAO accounts (the no-tickets cancel path).
    pub fn request_draw_cancel(&mut self, draw: &Pubkey) -> Result<TxOk, String> {
        let k = self.keeper.insecure_clone();
        let ix = self.ix_request_draw_raw(draw, &k.pubkey(), [0u8; 16], None);
        self.send(&[ix], &[&k])
    }

    pub fn ix_settle(&self, draw: &Pubkey, winning_entry: &Pubkey, winner: &Pubkey) -> Instruction {
        let d = self.draw(draw);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::SettleDraw {
                draw: *draw,
                vault: vault_pda(draw),
                vrf_request: d.draw_vrf_request,
                winning_entry: *winning_entry,
                winner: *winner,
                authority: d.authority,
            }
            .to_account_metas(None),
            data: drawsol::instruction::SettleDraw {}.data(),
        }
    }

    pub fn settle(&mut self, draw: &Pubkey, winning_entry: &Pubkey) -> Result<TxOk, String> {
        let owner = self.entry(winning_entry).owner;
        let ix = self.ix_settle(draw, winning_entry, &owner);
        self.crank(ix)
    }

    /// Entry of `draw` that holds position `pos`.
    pub fn entry_holding(&self, draw: &Pubkey, pos: u32) -> Pubkey {
        let d = self.draw(draw);
        (0..d.entry_count)
            .map(|s| entry_pda(draw, s))
            .find(|e| self.entry(e).holds_pos(pos))
            .expect("some entry holds the position")
    }

    /// Fulfils the draw request with `rnd` and settles with the right entry. Returns (entry, pos).
    pub fn fulfill_and_settle(&mut self, draw: &Pubkey, rnd: [u8; 64]) -> (Pubkey, u32) {
        let d = self.draw(draw);
        self.fulfill(&d.draw_vrf_request, rnd);
        let pos = drawsol::fairness::winning_position(&rnd, d.next_pos);
        let e = self.entry_holding(draw, pos);
        self.settle(draw, &e).unwrap();
        (e, pos)
    }

    pub fn ix_cancel(&self, draw: &Pubkey, signer: &Pubkey) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::CancelDraw { draw: *draw, signer: *signer }.to_account_metas(None),
            data: drawsol::instruction::CancelDraw {}.data(),
        }
    }

    /// cancel_draw by the neutral cranker.
    pub fn cancel(&mut self, draw: &Pubkey) -> Result<TxOk, String> {
        let ix = self.ix_cancel(draw, &self.cranker.pubkey());
        self.crank(ix)
    }

    pub fn cancel_as(&mut self, draw: &Pubkey, signer: &Keypair) -> Result<TxOk, String> {
        let ix = self.ix_cancel(draw, &signer.pubkey());
        self.send(&[ix], &[signer])
    }

    pub fn ix_refund(&self, draw: &Pubkey, entry: &Pubkey) -> Instruction {
        let e = self.entry(entry);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::ClaimRefund { draw: *draw, vault: vault_pda(draw), entry: *entry, owner: e.owner }
                .to_account_metas(None),
            data: drawsol::instruction::ClaimRefund {}.data(),
        }
    }

    /// Refund sent by the cranker; returns the owner's balance delta.
    pub fn refund(&mut self, draw: &Pubkey, entry: &Pubkey) -> Result<u64, String> {
        let owner = self.entry(entry).owner;
        let before = self.balance(&owner);
        let ix = self.ix_refund(draw, entry);
        self.crank(ix)?;
        Ok(self.balance(&owner) - before)
    }

    pub fn ix_withdraw(&self, draw: &Pubkey, authority: &Pubkey) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::Withdraw { draw: *draw, vault: vault_pda(draw), authority: *authority }
                .to_account_metas(None),
            data: drawsol::instruction::Withdraw {}.data(),
        }
    }

    /// Withdraw signed by the admin with the cranker paying fees; returns the admin's balance delta.
    pub fn withdraw(&mut self, draw: &Pubkey) -> Result<u64, String> {
        let admin = self.admin.insecure_clone();
        let c = self.cranker.insecure_clone();
        let before = self.balance(&admin.pubkey());
        let ix = self.ix_withdraw(draw, &admin.pubkey());
        self.send(&[ix], &[&c, &admin])?;
        Ok(self.balance(&admin.pubkey()) - before)
    }

    // ------------------------------------------------------------------ profile

    pub fn ix_profile(&self, wallet: &Pubkey, data: Vec<u8>) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::UpdateProfile {
                profile: profile_pda(wallet),
                wallet: *wallet,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data,
        }
    }

    pub fn set_limit(&mut self, wallet: &Keypair, lamports: u64) -> Result<TxOk, String> {
        let ix = self.ix_profile(&wallet.pubkey(), drawsol::instruction::SetLimit { lamports }.data());
        self.send(&[ix], &[wallet])
    }

    pub fn self_exclude(&mut self, wallet: &Keypair, until: i64) -> Result<TxOk, String> {
        let ix = self.ix_profile(&wallet.pubkey(), drawsol::instruction::SelfExclude { until }.data());
        self.send(&[ix], &[wallet])
    }

    // ------------------------------------------------------------------ legacy

    pub fn ix_legacy_close_v3(&self, admin: &Pubkey, draw_id: u64) -> Instruction {
        let d = legacy_v3_draw_pda(draw_id);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::LegacyCloseV3 {
                config: config_pda(),
                admin: *admin,
                legacy_draw: d,
                legacy_vault: legacy_v3_vault_pda(&d),
            }
            .to_account_metas(None),
            data: drawsol::instruction::LegacyCloseV3 { draw_id }.data(),
        }
    }

    pub fn set_program_account(&mut self, at: Pubkey, data: Vec<u8>, lamports: u64) {
        self.svm
            .set_account(at, Account { lamports, data, owner: drawsol::ID, executable: false, rent_epoch: 0 })
            .unwrap();
    }
}

/// Raw account data of a getAccountInfo JSON fixture (`{"result":{"value":{"data":[b64,"base64"],...}}}`).
pub fn rpc_fixture_data(name: &str) -> Vec<u8> {
    let json = std::fs::read_to_string(fixture(name)).unwrap();
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    base64_decode(v["result"]["value"]["data"][0].as_str().unwrap())
}

/// A `solana account <pubkey> --output json` dump: (data, lamports, pubkey).
pub fn cli_fixture(name: &str) -> (Vec<u8>, u64, Pubkey) {
    let json = std::fs::read_to_string(fixture(name)).unwrap();
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    let data = base64_decode(v["account"]["data"][0].as_str().unwrap());
    let lamports = v["account"]["lamports"].as_u64().unwrap();
    let pubkey: Pubkey = v["pubkey"].as_str().unwrap().parse().unwrap();
    (data, lamports, pubkey)
}

/// Writes an upgradeable-loader Program + ProgramData pair (as `solana program deploy` would).
pub fn deploy_upgradeable(svm: &mut LiteSVM, program_id: Pubkey, elf: &[u8], authority: Option<Pubkey>) {
    let programdata = programdata_pda(&program_id);
    svm.set_account(programdata, programdata_account(svm, elf, authority)).unwrap();
    let mut pdata = vec![2u8, 0, 0, 0]; // UpgradeableLoaderState::Program
    pdata.extend_from_slice(programdata.as_ref());
    let lamports = svm.minimum_balance_for_rent_exemption(pdata.len());
    svm.set_account(
        program_id,
        Account { lamports, data: pdata, owner: bpf_loader_upgradeable::ID, executable: true, rent_epoch: 0 },
    )
    .unwrap();
}

/// UpgradeableLoaderState::ProgramData { slot, upgrade_authority_address } (45-byte header) + ELF.
pub fn programdata_account(svm: &LiteSVM, elf: &[u8], authority: Option<Pubkey>) -> Account {
    let mut data = vec![3u8, 0, 0, 0];
    data.extend_from_slice(&0u64.to_le_bytes());
    match authority {
        Some(a) => {
            data.push(1);
            data.extend_from_slice(a.as_ref());
        }
        None => data.extend_from_slice(&[0u8; 33]),
    }
    data.extend_from_slice(elf);
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    Account { lamports, data, owner: bpf_loader_upgradeable::ID, executable: false, rent_epoch: 0 }
}

#[track_caller]
pub fn expect_err<T>(r: Result<T, String>, needle: &str) {
    match r {
        Ok(_) => panic!("expected failure containing `{needle}`, but the transaction succeeded"),
        Err(e) => assert!(e.contains(needle), "expected `{needle}` in error:\n{e}"),
    }
}

/// Anchor error by name, e.g. `code("SoldOut")`.
pub fn code(name: &str) -> String {
    format!("Error Code: {name}.")
}

pub fn base64_decode(s: &str) -> Vec<u8> {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let (mut buf, mut bits) = (0u32, 0);
    for c in s.bytes().filter(|&c| c != b'=') {
        buf = (buf << 6) | T.iter().position(|&x| x == c).unwrap() as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
        }
    }
    out
}
