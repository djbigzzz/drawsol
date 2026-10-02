//! Shared LiteSVM harness for the DrawSol v3 program.
//!
//! - drawsol is deployed as a real **upgradeable** program (Program + ProgramData accounts written with
//!   `set_account`) so `init_config`'s upgrade-authority check runs exactly as on chain.
//! - The real ORAO VRF program (dumped from devnet) runs `request_v2`; its network-state account is
//!   cloned from devnet. Fulfilment is simulated by overwriting the request account with the
//!   fulfilled `RandomnessV2` layout ORAO's `fulfill_v2` leaves behind.
#![allow(dead_code)]

use anchor_lang::{
    prelude::Pubkey,
    solana_program::{bpf_loader_upgradeable, clock::Clock, instruction::Instruction, system_instruction, system_program},
    AccountDeserialize, Discriminator, InstructionData, ToAccountMetas,
};
use drawsol::{
    constants::*,
    instructions::{CommonDrawParams, HeadlineDrawParams, PotDrawParams},
    state::{Config, DrawV3, EntryV3, IwTierV3, PlayerV3, Profile},
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
    pda(&[b"draw3", &id.to_le_bytes()])
}
pub fn vault_pda(draw: &Pubkey) -> Pubkey {
    pda(&[b"vault3", draw.as_ref()])
}
pub fn player_pda(draw: &Pubkey, wallet: &Pubkey) -> Pubkey {
    pda(&[b"player3", draw.as_ref(), wallet.as_ref()])
}
pub fn entry_pda(draw: &Pubkey, seq: u32) -> Pubkey {
    pda(&[b"entry3", draw.as_ref(), &seq.to_le_bytes()])
}
pub fn profile_pda(wallet: &Pubkey) -> Pubkey {
    pda(&[b"profile", wallet.as_ref()])
}
pub fn legacy_draw_pda(id: u64) -> Pubkey {
    pda(&[b"draw", &id.to_le_bytes()])
}
pub fn legacy_vault_pda(draw: &Pubkey) -> Pubkey {
    pda(&[b"vault", draw.as_ref()])
}
pub fn programdata_pda(program: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[program.as_ref()], &bpf_loader_upgradeable::ID).0
}

pub fn sol_share(odds: u32, bps: u32) -> IwTierV3 {
    IwTierV3 { odds, kind: TIER_SOL_SHARE, value: bps }
}
pub fn credits_tier(odds: u32, credits: u32) -> IwTierV3 {
    IwTierV3 { odds, kind: TIER_CREDITS, value: credits }
}
pub const NO_TIER: IwTierV3 = IwTierV3 { odds: 0, kind: 0, value: 0 };

pub fn common(closes_at: i64, cap: u32) -> CommonDrawParams {
    CommonDrawParams {
        ticket_price: CENT,
        ticket_cap: cap,
        max_per_tx: 25,
        max_per_wallet: 50,
        free_cap: 15,
        closes_at,
        draw_at: closes_at,
        public_grace_secs: 30 * MIN as u32,
        house_bps: 5500,
        terms_hash: [7u8; 32],
    }
}

/// SPEC-v3 §3 devnet nightly pot draw: 0.01 SOL, cap 300, 5500/3500/1000, 25/50, free 15, grace 30 min,
/// tiers /1000: 15 × 20% of snapshot, 60 × 4%, 150 × 1 credit.
pub fn pot_params(closes_at: i64) -> PotDrawParams {
    PotDrawParams {
        common: common(closes_at, 300),
        pot_bps: 3500,
        instant_bps: 1000,
        iw_denominator: 1000,
        iw_tiers: [sol_share(15, 2000), sol_share(60, 400), credits_tier(150, 1), NO_TIER],
    }
}

/// SPEC-v3 §3 devnet weekly headline draw: prize 1 SOL, 0.01 SOL, cap 230, min 120, margin 20%.
pub fn headline_params(closes_at: i64) -> HeadlineDrawParams {
    HeadlineDrawParams { common: common(closes_at, 230), prize_lamports: SOL, min_tickets: 120, floor_margin_bps: 2000 }
}

/// Expected reveal recomputed with the program's public fairness function: (tiers, owed SOL, credits).
pub fn expected_reveal(rnd: &[u8; 64], d: &DrawV3, e: &EntryV3) -> ([u8; 25], u64, u32) {
    let mut tiers = [0u8; 25];
    let (mut owed, mut credits) = (0u64, 0u32);
    for i in 0..e.count as u32 {
        let t = drawsol::fairness::ticket_tier(rnd, e.first_ticket + i, d.iw_denominator, &d.tier_odds());
        tiers[i as usize] = t;
        if t > 0 {
            let tier = d.iw_tiers[t as usize - 1];
            match tier.kind {
                TIER_SOL_SHARE => owed += (e.pool_snapshot as u128 * tier.value as u128 / 10_000) as u64,
                TIER_CREDITS => credits += tier.value,
                _ => {}
            }
        }
    }
    (tiers, owed, credits)
}

/// Deterministic search for randomness whose recomputed instant result satisfies `pred(owed, credits)`.
pub fn find_randomness(d: &DrawV3, e: &EntryV3, pred: impl Fn(u64, u32) -> bool) -> [u8; 64] {
    for k in 0u32..200_000 {
        let mut rnd = [0u8; 64];
        rnd[..4].copy_from_slice(&k.to_le_bytes());
        rnd[4..].fill(0xA5);
        let (_, owed, credits) = expected_reveal(&rnd, d, e);
        if pred(owed, credits) {
            return rnd;
        }
    }
    panic!("no randomness found");
}

/// Randomness whose grand-draw winning ticket satisfies `pred`.
pub fn find_draw_randomness(next_ticket: u32, pred: impl Fn(u32) -> bool) -> [u8; 64] {
    for k in 0u32..100_000 {
        let mut rnd = [0u8; 64];
        rnd[..4].copy_from_slice(&k.to_le_bytes());
        rnd[4..].fill(0x5A);
        if pred(drawsol::fairness::winning_ticket(&rnd, next_ticket)) {
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
    /// ORAO request (None for entries without an instant roll)
    pub req: Option<Pubkey>,
}

pub struct Env {
    pub svm: LiteSVM,
    /// Upgrade authority of the program and (after init_config) the admin.
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

    pub fn with_pot(params: PotDrawParams) -> (Self, Pubkey) {
        let mut env = Env::new();
        let draw = env.create_pot(params).unwrap();
        (env, draw)
    }

    pub fn with_headline(params: HeadlineDrawParams) -> (Self, Pubkey) {
        let mut env = Env::new();
        let draw = env.create_headline(params).unwrap();
        (env, draw)
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
    pub fn draw(&self, k: &Pubkey) -> DrawV3 {
        self.load(k)
    }
    pub fn entry(&self, k: &Pubkey) -> EntryV3 {
        self.load(k)
    }
    pub fn player(&self, draw: &Pubkey, wallet: &Pubkey) -> PlayerV3 {
        self.load(&player_pda(draw, wallet))
    }
    pub fn profile(&self, wallet: &Pubkey) -> Profile {
        self.load(&profile_pda(wallet))
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

    pub fn ix_migrate_config(&self, signer: &Pubkey, keeper: Pubkey) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::MigrateConfig {
                config: config_pda(),
                admin: *signer,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::MigrateConfig { keeper }.data(),
        }
    }

    pub fn ix_set_keeper(&self, signer: &Pubkey, keeper: Pubkey) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::SetKeeper { config: config_pda(), admin: *signer }.to_account_metas(None),
            data: drawsol::instruction::SetKeeper { keeper }.data(),
        }
    }

    // ------------------------------------------------------------------ creation

    pub fn ix_create_pot(&self, creator: &Pubkey, id: u64, params: PotDrawParams) -> Instruction {
        let draw = draw_pda(id);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::CreatePotDraw {
                config: config_pda(),
                draw,
                vault: vault_pda(&draw),
                creator: *creator,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::CreatePotDraw { params }.data(),
        }
    }

    pub fn create_pot_as(&mut self, creator: &Keypair, params: PotDrawParams) -> Result<Pubkey, String> {
        let id = self.config().next_draw_id;
        let ix = self.ix_create_pot(&creator.pubkey(), id, params);
        self.send(&[ix], &[creator])?;
        Ok(draw_pda(id))
    }

    pub fn create_pot(&mut self, params: PotDrawParams) -> Result<Pubkey, String> {
        let admin = self.admin.insecure_clone();
        self.create_pot_as(&admin, params)
    }

    pub fn ix_create_headline(&self, admin: &Pubkey, id: u64, params: HeadlineDrawParams) -> Instruction {
        let draw = draw_pda(id);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::CreateHeadlineDraw {
                config: config_pda(),
                draw,
                vault: vault_pda(&draw),
                admin: *admin,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::CreateHeadlineDraw { params }.data(),
        }
    }

    pub fn create_headline(&mut self, params: HeadlineDrawParams) -> Result<Pubkey, String> {
        let id = self.config().next_draw_id;
        let ix = self.ix_create_headline(&self.admin.pubkey(), id, params);
        let admin = self.admin.insecure_clone();
        self.send(&[ix], &[&admin])?;
        Ok(draw_pda(id))
    }

    // ------------------------------------------------------------------ play

    /// Builds buy_tickets for the next entry; ORAO accounts only when the draw rolls.
    /// Returns (instruction, entry, vrf_request).
    pub fn ix_buy(&mut self, draw: &Pubkey, buyer: &Pubkey, quantity: u16, use_credits: u16) -> (Instruction, Pubkey, Option<Pubkey>) {
        let nonce = self.next_nonce();
        let d = self.draw(draw);
        let seq = d.entry_count;
        let req = d.needs_roll().then(|| {
            drawsol::fairness::vrf_request_address(&drawsol::fairness::entry_vrf_seed(draw, buyer, seq, &nonce))
        });
        let ix = self.ix_buy_raw(draw, buyer, seq, quantity, use_credits, nonce, req, req.is_some());
        (ix, entry_pda(draw, seq), req)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn ix_buy_raw(
        &self,
        draw: &Pubkey,
        buyer: &Pubkey,
        seq: u32,
        quantity: u16,
        use_credits: u16,
        client_nonce: [u8; 16],
        vrf_request: Option<Pubkey>,
        with_orao: bool,
    ) -> Instruction {
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
                vrf_config: with_orao.then_some(self.vrf_config),
                vrf_treasury: with_orao.then_some(self.treasury),
                vrf: with_orao.then_some(orao_solana_vrf::ID),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::BuyTickets { quantity, use_credits, client_nonce }.data(),
        }
    }

    pub fn buy_credits(&mut self, draw: &Pubkey, buyer: &Keypair, quantity: u16, use_credits: u16) -> Result<Bought, String> {
        let (ix, entry, req) = self.ix_buy(draw, &buyer.pubkey(), quantity, use_credits);
        self.send(&[ix], &[buyer])?;
        Ok(Bought { entry, req })
    }

    pub fn buy(&mut self, draw: &Pubkey, buyer: &Keypair, quantity: u16) -> Result<Bought, String> {
        self.buy_credits(draw, buyer, quantity, 0)
    }

    pub fn ix_claim_free(&mut self, draw: &Pubkey, buyer: &Pubkey) -> (Instruction, Pubkey, Option<Pubkey>) {
        let nonce = self.next_nonce();
        let d = self.draw(draw);
        let seq = d.entry_count;
        let req = d.needs_roll().then(|| {
            drawsol::fairness::vrf_request_address(&drawsol::fairness::entry_vrf_seed(draw, buyer, seq, &nonce))
        });
        let with = req.is_some();
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
                vrf_config: with.then_some(self.vrf_config),
                vrf_treasury: with.then_some(self.treasury),
                vrf: with.then_some(orao_solana_vrf::ID),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::ClaimFreeEntry { client_nonce: nonce }.data(),
        };
        (ix, entry, req)
    }

    pub fn claim_free(&mut self, draw: &Pubkey, buyer: &Keypair) -> Result<Bought, String> {
        let (ix, entry, req) = self.ix_claim_free(draw, &buyer.pubkey());
        self.send(&[ix], &[buyer])?;
        Ok(Bought { entry, req })
    }

    pub fn ix_reveal_with(&self, draw: &Pubkey, entry: &Pubkey, vrf_request: Pubkey) -> Instruction {
        let e = self.entry(entry);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::RevealEntry {
                draw: *draw,
                vault: vault_pda(draw),
                entry: *entry,
                player: player_pda(draw, &e.owner),
                profile: profile_pda(&e.owner),
                owner: e.owner,
                vrf_request,
            }
            .to_account_metas(None),
            data: drawsol::instruction::RevealEntry {}.data(),
        }
    }

    pub fn reveal(&mut self, draw: &Pubkey, entry: &Pubkey) -> Result<TxOk, String> {
        let req = self.entry(entry).vrf_request;
        let ix = self.ix_reveal_with(draw, entry, req);
        self.crank(ix)
    }

    /// Fulfils the entry's request with `rnd` and reveals it.
    pub fn fulfill_and_reveal(&mut self, draw: &Pubkey, b: &Bought, rnd: [u8; 64]) -> TxOk {
        self.fulfill(&b.req.expect("entry has a roll"), rnd);
        self.reveal(draw, &b.entry).unwrap()
    }

    // ------------------------------------------------------------------ draw lifecycle

    /// request_draw signed/paid by `payer`. Returns (instruction, vrf_request).
    pub fn ix_request_draw(&mut self, draw: &Pubkey, payer: &Pubkey) -> (Instruction, Pubkey) {
        let nonce = self.next_nonce();
        let d = self.draw(draw);
        let seed = drawsol::fairness::draw_vrf_seed(draw, d.next_ticket, &nonce);
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

    /// Entry of `draw` that holds `ticket`.
    pub fn entry_holding(&self, draw: &Pubkey, ticket: u32) -> Pubkey {
        let d = self.draw(draw);
        (0..d.entry_count)
            .map(|s| entry_pda(draw, s))
            .find(|e| self.entry(e).contains(ticket))
            .expect("some entry holds the ticket")
    }

    /// Fulfils the draw request with `rnd` and settles with the right entry. Returns the winning entry.
    pub fn fulfill_and_settle(&mut self, draw: &Pubkey, rnd: [u8; 64]) -> Pubkey {
        let d = self.draw(draw);
        self.fulfill(&d.draw_vrf_request, rnd);
        let w = drawsol::fairness::winning_ticket(&rnd, d.next_ticket);
        let e = self.entry_holding(draw, w);
        self.settle(draw, &e).unwrap();
        e
    }

    pub fn cancel(&mut self, draw: &Pubkey) -> Result<TxOk, String> {
        let ix = Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::CancelDraw { draw: *draw }.to_account_metas(None),
            data: drawsol::instruction::CancelDraw {}.data(),
        };
        self.crank(ix)
    }

    pub fn ix_refund(&self, draw: &Pubkey, entry: &Pubkey) -> Instruction {
        let e = self.entry(entry);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::ClaimRefund {
                draw: *draw,
                vault: vault_pda(draw),
                entry: *entry,
                profile: profile_pda(&e.owner),
                owner: e.owner,
            }
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

    pub fn ix_legacy_close(&self, admin: &Pubkey, draw_id: u64) -> Instruction {
        let d = legacy_draw_pda(draw_id);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::LegacyCloseV2 {
                config: config_pda(),
                admin: *admin,
                legacy_draw: d,
                legacy_vault: legacy_vault_pda(&d),
            }
            .to_account_metas(None),
            data: drawsol::instruction::LegacyCloseV2 { draw_id }.data(),
        }
    }

    pub fn set_program_account(&mut self, at: Pubkey, data: Vec<u8>, lamports: u64) {
        self.svm
            .set_account(at, Account { lamports, data, owner: drawsol::ID, executable: false, rent_epoch: 0 })
            .unwrap();
    }
}

/// Raw account data of a getAccountInfo JSON fixture.
pub fn rpc_fixture_data(name: &str) -> Vec<u8> {
    let json = std::fs::read_to_string(fixture(name)).unwrap();
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    base64_decode(v["result"]["value"]["data"][0].as_str().unwrap())
}

pub fn rpc_fixture_lamports(name: &str) -> u64 {
    let json = std::fs::read_to_string(fixture(name)).unwrap();
    let v: serde_json::Value = serde_json::from_str(&json).unwrap();
    v["result"]["value"]["lamports"].as_u64().unwrap()
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

impl Env {
    /// Gives `wallet` `n` extra credits by rewriting its Profile (creating it first if needed).
    pub fn grant_credits(&mut self, wallet: &Keypair, n: u32) {
        use anchor_lang::AccountSerialize;
        let key = profile_pda(&wallet.pubkey());
        if self.svm.get_account(&key).is_none() {
            self.set_limit(wallet, 0).unwrap(); // init_if_needed, no-op otherwise
        }
        let mut p = self.profile(&wallet.pubkey());
        p.credits += n;
        let mut data = Vec::new();
        p.try_serialize(&mut data).unwrap();
        let mut acc = self.svm.get_account(&key).unwrap();
        assert_eq!(acc.data.len(), data.len());
        acc.data = data;
        self.svm.set_account(key, acc).unwrap();
    }
}
