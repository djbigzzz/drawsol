//! Shared LiteSVM harness for the DrawSol v2 program.
//!
//! - drawsol is deployed as a real **upgradeable** program (Program + ProgramData accounts written with
//!   `set_account`) so `init_config`'s upgrade-authority check runs exactly as on chain.
//! - The real ORAO VRF program (dumped from devnet) runs `request_v2`; its network-state account is
//!   cloned from devnet. Fulfilment is simulated by overwriting the request account with the
//!   fulfilled `RandomnessV2` layout ORAO's `fulfill_v2` leaves behind.
#![allow(dead_code)]

use anchor_lang::{
    prelude::Pubkey,
    solana_program::{bpf_loader_upgradeable, clock::Clock, instruction::Instruction, system_program},
    AccountDeserialize, Discriminator, InstructionData, ToAccountMetas,
};
use drawsol::{
    instructions::CreateDrawParams,
    state::{Config, Draw, Entry, IwTier, Player},
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
/// Start of simulated time.
pub const T0: i64 = 1_800_000_000;
pub const HOUR: i64 = 3600;
pub const DAY: i64 = 86400;

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
    pda(&[b"draw", &id.to_le_bytes()])
}
pub fn vault_pda(draw: &Pubkey) -> Pubkey {
    pda(&[b"vault", draw.as_ref()])
}
pub fn player_pda(draw: &Pubkey, wallet: &Pubkey) -> Pubkey {
    pda(&[b"player", draw.as_ref(), wallet.as_ref()])
}
pub fn entry_pda(draw: &Pubkey, seq: u32) -> Pubkey {
    pda(&[b"entry", draw.as_ref(), &seq.to_le_bytes()])
}
pub fn programdata_pda(program: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[program.as_ref()], &bpf_loader_upgradeable::ID).0
}

/// Devnet demo preset (SPEC §3): 1 SOL prize, 0.01 SOL tickets, 150 cap, 25/50 limits, 15 free,
/// tiers 0.2 SOL×10, 0.05 SOL×40, 0.01 SOL×150 per 1000, 2 SOL reserve.
pub fn demo_params(closes_at: i64) -> CreateDrawParams {
    CreateDrawParams {
        ticket_price: SOL / 100,
        ticket_cap: 150,
        max_per_tx: 25,
        max_per_wallet: 50,
        free_cap: 15,
        closes_at,
        prize_lamports: SOL,
        iw_reserve_lamports: 2 * SOL,
        iw_denominator: 1000,
        iw_tiers: [
            IwTier { amount: SOL / 5, odds: 10 },
            IwTier { amount: SOL / 20, odds: 40 },
            IwTier { amount: SOL / 100, odds: 150 },
            IwTier { amount: 0, odds: 0 },
        ],
        terms_hash: [7u8; 32],
    }
}

/// Expected reveal result recomputed with the same public functions the program uses.
pub fn expected_reveal(rnd: &[u8; 64], d: &Draw, e: &Entry) -> ([u8; 25], u64) {
    let mut tiers = [0u8; 25];
    let mut total = 0u64;
    for i in 0..e.count as u32 {
        let t = drawsol::fairness::ticket_tier(rnd, e.first_ticket + i, d.iw_denominator, &d.iw_tiers);
        tiers[i as usize] = t;
        if t > 0 {
            total += d.iw_tiers[t as usize - 1].amount;
        }
    }
    (tiers, total)
}

pub struct TxOk {
    pub cu: u64,
    pub logs: Vec<String>,
}

pub struct Env {
    pub svm: LiteSVM,
    /// Upgrade authority of the program and (after init_config) the admin.
    pub admin: Keypair,
    /// Neutral fee payer so balance assertions on participants are exact.
    pub cranker: Keypair,
    pub vrf_config: Pubkey,
    pub treasury: Pubkey,
    pub request_fee: u64,
    nonce: u64,
}

impl Env {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let admin = Keypair::new();
        let cranker = Keypair::new();
        svm.airdrop(&admin.pubkey(), 1_000 * SOL).unwrap();
        svm.airdrop(&cranker.pubkey(), 100 * SOL).unwrap();

        let elf = std::fs::read(format!("{ROOT}/../target/deploy/drawsol.so"))
            .expect("run `anchor build` first (target/deploy/drawsol.so)");
        deploy_upgradeable(&mut svm, drawsol::ID, &elf, Some(admin.pubkey()));
        svm.add_program_from_file(orao_solana_vrf::ID, fixture("orao_vrf.so")).unwrap();

        // ORAO network state, cloned from devnet (getAccountInfo JSON).
        let ns_json = std::fs::read_to_string(fixture("network_state.json")).unwrap();
        let v: serde_json::Value = serde_json::from_str(&ns_json).unwrap();
        let ns_data = base64_decode(v["result"]["value"]["data"][0].as_str().unwrap());
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
            cranker,
            vrf_config,
            treasury,
            request_fee: ns.config.request_fee,
            nonce: 0,
        };
        env.set_time(T0);
        env
    }

    /// Env with Config initialised and draw 0 created from `params`.
    pub fn with_draw(params: CreateDrawParams) -> (Self, Pubkey) {
        let mut env = Env::new();
        env.init_config().unwrap();
        let draw = env.create_draw(params).unwrap();
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

    pub fn balance(&self, k: &Pubkey) -> u64 {
        self.svm.get_account(k).map(|a| a.lamports).unwrap_or(0)
    }
    pub fn rent(&self, len: usize) -> u64 {
        self.svm.minimum_balance_for_rent_exemption(len)
    }
    pub fn vault_rent(&self) -> u64 {
        self.rent(8)
    }
    fn load<T: AccountDeserialize>(&self, k: &Pubkey) -> T {
        let acc = self.svm.get_account(k).unwrap_or_else(|| panic!("account {k} missing"));
        T::try_deserialize(&mut &acc.data[..]).unwrap()
    }
    pub fn config(&self) -> Config {
        self.load(&config_pda())
    }
    pub fn draw(&self, k: &Pubkey) -> Draw {
        self.load(k)
    }
    pub fn entry(&self, k: &Pubkey) -> Entry {
        self.load(k)
    }
    pub fn player(&self, k: &Pubkey) -> Player {
        self.load(k)
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

    // ------------------------------------------------------------------ instruction builders

    pub fn ix_init_config(&self, signer: &Pubkey, program_data: Pubkey) -> Instruction {
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
            data: drawsol::instruction::InitConfig {}.data(),
        }
    }

    pub fn init_config(&mut self) -> Result<TxOk, String> {
        let ix = self.ix_init_config(&self.admin.pubkey(), programdata_pda(&drawsol::ID));
        let admin = self.admin.insecure_clone();
        self.send(&[ix], &[&admin])
    }

    pub fn ix_create_draw(&self, signer: &Pubkey, id: u64, params: CreateDrawParams) -> Instruction {
        let draw = draw_pda(id);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::CreateDraw {
                config: config_pda(),
                draw,
                vault: vault_pda(&draw),
                admin: *signer,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::CreateDraw { params }.data(),
        }
    }

    pub fn create_draw(&mut self, params: CreateDrawParams) -> Result<Pubkey, String> {
        let id = self.config().next_draw_id;
        let ix = self.ix_create_draw(&self.admin.pubkey(), id, params);
        let admin = self.admin.insecure_clone();
        self.send(&[ix], &[&admin])?;
        Ok(draw_pda(id))
    }

    /// Returns (instruction, entry, vrf_request) for the next entry of `draw`.
    pub fn ix_buy(&mut self, draw: &Pubkey, buyer: &Pubkey, quantity: u16) -> (Instruction, Pubkey, Pubkey) {
        let nonce = self.next_nonce();
        let seq = self.draw(draw).entry_count;
        let seed = drawsol::fairness::entry_vrf_seed(draw, buyer, seq, &nonce);
        let req = drawsol::fairness::vrf_request_address(&seed);
        let ix = self.ix_buy_raw(draw, buyer, seq, quantity, nonce, req);
        (ix, entry_pda(draw, seq), req)
    }

    pub fn ix_buy_raw(
        &self,
        draw: &Pubkey,
        buyer: &Pubkey,
        seq: u32,
        quantity: u16,
        client_nonce: [u8; 16],
        vrf_request: Pubkey,
    ) -> Instruction {
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::BuyTickets {
                draw: *draw,
                vault: vault_pda(draw),
                entry: entry_pda(draw, seq),
                player: player_pda(draw, buyer),
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

    /// Buys and returns (entry, vrf_request).
    pub fn buy(&mut self, draw: &Pubkey, buyer: &Keypair, quantity: u16) -> Result<(Pubkey, Pubkey), String> {
        let (ix, entry, req) = self.ix_buy(draw, &buyer.pubkey(), quantity);
        self.send(&[ix], &[buyer])?;
        Ok((entry, req))
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
        let c = self.cranker.insecure_clone();
        self.send(&[ix], &[&c])
    }

    pub fn ix_claim_free(&self, draw: &Pubkey, buyer: &Pubkey) -> (Instruction, Pubkey) {
        let seq = self.draw(draw).entry_count;
        let entry = entry_pda(draw, seq);
        let ix = Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::ClaimFreeEntry {
                draw: *draw,
                entry,
                player: player_pda(draw, buyer),
                buyer: *buyer,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::ClaimFreeEntry {}.data(),
        };
        (ix, entry)
    }

    pub fn claim_free(&mut self, draw: &Pubkey, buyer: &Keypair) -> Result<Pubkey, String> {
        let (ix, entry) = self.ix_claim_free(draw, &buyer.pubkey());
        self.send(&[ix], &[buyer])?;
        Ok(entry)
    }

    /// Returns (instruction, vrf_request) for request_draw paid by the cranker.
    pub fn ix_request_draw(&mut self, draw: &Pubkey) -> (Instruction, Pubkey) {
        let nonce = self.next_nonce();
        let d = self.draw(draw);
        let seed = drawsol::fairness::draw_vrf_seed(draw, d.next_ticket, &nonce);
        let req = drawsol::fairness::vrf_request_address(&seed);
        (self.ix_request_draw_raw(draw, nonce, req), req)
    }

    pub fn ix_request_draw_raw(&self, draw: &Pubkey, client_nonce: [u8; 16], vrf_request: Pubkey) -> Instruction {
        let d = self.draw(draw);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::RequestDraw {
                draw: *draw,
                vault: vault_pda(draw),
                authority: d.authority,
                payer: self.cranker.pubkey(),
                vrf_request,
                vrf_config: self.vrf_config,
                vrf_treasury: self.treasury,
                vrf: orao_solana_vrf::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: drawsol::instruction::RequestDraw { client_nonce }.data(),
        }
    }

    pub fn request_draw(&mut self, draw: &Pubkey) -> Result<Pubkey, String> {
        let (ix, req) = self.ix_request_draw(draw);
        let c = self.cranker.insecure_clone();
        self.send(&[ix], &[&c])?;
        Ok(req)
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
        let c = self.cranker.insecure_clone();
        self.send(&[ix], &[&c])
    }

    pub fn cancel(&mut self, draw: &Pubkey) -> Result<TxOk, String> {
        let ix = Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::CancelDraw { draw: *draw }.to_account_metas(None),
            data: drawsol::instruction::CancelDraw {}.data(),
        };
        let c = self.cranker.insecure_clone();
        self.send(&[ix], &[&c])
    }

    pub fn ix_refund(&self, draw: &Pubkey, entry: &Pubkey) -> Instruction {
        let e = self.entry(entry);
        Instruction {
            program_id: drawsol::ID,
            accounts: drawsol::accounts::ClaimRefund {
                draw: *draw,
                vault: vault_pda(draw),
                entry: *entry,
                owner: e.owner,
            }
            .to_account_metas(None),
            data: drawsol::instruction::ClaimRefund {}.data(),
        }
    }

    pub fn refund(&mut self, draw: &Pubkey, entry: &Pubkey) -> Result<TxOk, String> {
        let ix = self.ix_refund(draw, entry);
        let c = self.cranker.insecure_clone();
        self.send(&[ix], &[&c])
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

/// Anchor error by name, e.g. `anchor_err("SoldOut")`.
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

/// Deterministic search for randomness whose recomputed instant result satisfies `pred(total)`.
pub fn find_randomness(d: &Draw, e: &Entry, pred: impl Fn(u64) -> bool) -> [u8; 64] {
    for k in 0u32..10_000 {
        let mut rnd = [0u8; 64];
        rnd[..4].copy_from_slice(&k.to_le_bytes());
        rnd[4..].fill(0xA5);
        if pred(expected_reveal(&rnd, d, e).1) {
            return rnd;
        }
    }
    panic!("no randomness found");
}
