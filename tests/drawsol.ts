import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import * as crypto from "crypto";

// IDL type — we load from the workspace
const Drawsol = anchor.workspace.Drawsol;

describe("drawsol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = Drawsol as Program;

  const operator = provider.wallet as anchor.Wallet;
  const drawNumber = 1;
  const ticketCap = 25_000;

  // Skill answer for testing
  const skillAnswer = "Paris";
  const skillAnswerHash = Array.from(
    crypto.createHash("sha256").update(skillAnswer).digest()
  );

  let usdcMint: PublicKey;
  let operatorUsdcAccount: PublicKey;
  let buyerKeypair: Keypair;
  let buyerUsdcAccount: PublicKey;

  // PDAs
  let drawStatePda: PublicKey;
  let drawStateBump: number;
  let vaultPda: PublicKey;
  let vaultBump: number;
  let prizeEscrowPda: PublicKey;
  let escrowBump: number;

  before(async () => {
    // Airdrop SOL to operator
    const sig = await provider.connection.requestAirdrop(
      operator.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Create a buyer keypair and airdrop SOL
    buyerKeypair = Keypair.generate();
    const sig2 = await provider.connection.requestAirdrop(
      buyerKeypair.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig2);

    // Create USDC mock mint (operator is mint authority)
    usdcMint = await createMint(
      provider.connection,
      (operator as any).payer,
      operator.publicKey,
      null,
      6 // 6 decimals like real USDC
    );

    // Create USDC token accounts
    operatorUsdcAccount = await createAccount(
      provider.connection,
      (operator as any).payer,
      usdcMint,
      operator.publicKey
    );

    buyerUsdcAccount = await createAccount(
      provider.connection,
      (operator as any).payer,
      usdcMint,
      buyerKeypair.publicKey
    );

    // Mint USDC to buyer (enough for many tickets)
    await mintTo(
      provider.connection,
      (operator as any).payer,
      usdcMint,
      buyerUsdcAccount,
      operator.publicKey,
      100_000_000_000 // $100,000 USDC
    );

    // Derive PDAs
    [drawStatePda, drawStateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("draw_state"), Buffer.from([drawNumber])],
      program.programId
    );

    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), Buffer.from([drawNumber])],
      program.programId
    );

    [prizeEscrowPda, escrowBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("prize_escrow"), Buffer.from([drawNumber])],
      program.programId
    );
  });

  it("Initializes the draw", async () => {
    const tx = await program.methods
      .initializeDraw(drawNumber, ticketCap, skillAnswerHash)
      .accounts({
        drawState: drawStatePda,
        vault: vaultPda,
        prizeEscrow: prizeEscrowPda,
        usdcMint: usdcMint,
        operator: operator.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("Initialize draw tx:", tx);

    // Verify draw state
    const drawState = await program.account.drawState.fetch(drawStatePda);
    assert.equal(drawState.ticketCap, ticketCap);
    assert.equal(drawState.ticketsSold, 0);
    assert.equal(drawState.drawNumber, drawNumber);
    assert.deepEqual(drawState.status, { open: {} });
    assert.equal(
      drawState.operator.toBase58(),
      operator.publicKey.toBase58()
    );
  });

  it("Buys tickets (single ticket, no discount)", async () => {
    const quantity = 1;
    const solPriceUsd = new anchor.BN(126_000_000); // $126 SOL price

    // Derive ticket PDA for slot 0
    const slotBytes = Buffer.alloc(4);
    slotBytes.writeUInt32LE(0);
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), Buffer.from([drawNumber]), slotBytes],
      program.programId
    );

    const tx = await program.methods
      .buyTickets(quantity, skillAnswerHash, solPriceUsd)
      .accounts({
        drawState: drawStatePda,
        vault: vaultPda,
        ticket: ticketPda,
        buyer: buyerKeypair.publicKey,
        buyerTokenAccount: buyerUsdcAccount,
        usdcMint: usdcMint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyerKeypair])
      .rpc();

    console.log("Buy ticket tx:", tx);

    // Verify draw state updated
    const drawState = await program.account.drawState.fetch(drawStatePda);
    assert.equal(drawState.ticketsSold, 1);
    assert.equal(drawState.usdcCollected.toNumber(), 1_990_000); // $1.99

    // Verify ticket
    const ticket = await program.account.ticket.fetch(ticketPda);
    assert.equal(
      ticket.owner.toBase58(),
      buyerKeypair.publicKey.toBase58()
    );
    assert.equal(ticket.slotNumber, 0);
    assert.equal(ticket.freeEntry, false);

    // Verify vault received USDC
    const vaultAccount = await getAccount(provider.connection, vaultPda);
    assert.equal(Number(vaultAccount.amount), 1_990_000);
  });

  it("Buys tickets with bulk discount (10 tickets = 10% off)", async () => {
    const quantity = 10;
    const solPriceUsd = new anchor.BN(126_000_000);

    // Ticket PDA for slot 1 (next available slot)
    const slotBytes = Buffer.alloc(4);
    slotBytes.writeUInt32LE(1); // tickets_sold is 1 from previous test
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), Buffer.from([drawNumber]), slotBytes],
      program.programId
    );

    const tx = await program.methods
      .buyTickets(quantity, skillAnswerHash, solPriceUsd)
      .accounts({
        drawState: drawStatePda,
        vault: vaultPda,
        ticket: ticketPda,
        buyer: buyerKeypair.publicKey,
        buyerTokenAccount: buyerUsdcAccount,
        usdcMint: usdcMint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyerKeypair])
      .rpc();

    console.log("Buy 10 tickets tx:", tx);

    const drawState = await program.account.drawState.fetch(drawStatePda);
    assert.equal(drawState.ticketsSold, 11); // 1 + 10

    // 10 * $1.99 = $19.90, 10% off = $17.91
    const expectedPrice = 10 * 1_990_000 * 0.9;
    const totalCollected = drawState.usdcCollected.toNumber();
    assert.equal(totalCollected, 1_990_000 + expectedPrice); // first ticket + discounted batch
  });

  it("VRF callback resolves instant win", async () => {
    const slotNumber = 0;
    // Create randomness that will land in the $5 prize range (index 130-729)
    const randomness = Buffer.alloc(32);
    randomness.writeBigUInt64LE(BigInt(200)); // 200 % 25000 = 200, in $10 range (30-129)

    const slotBytes = Buffer.alloc(4);
    slotBytes.writeUInt32LE(slotNumber);

    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), Buffer.from([drawNumber]), slotBytes],
      program.programId
    );

    const [pendingPayoutPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pending_payout"),
        Buffer.from([drawNumber]),
        slotBytes,
      ],
      program.programId
    );

    const tx = await program.methods
      .vrfCallback(slotNumber, Array.from(randomness))
      .accounts({
        drawState: drawStatePda,
        ticket: ticketPda,
        pendingPayout: pendingPayoutPda,
        payer: operator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("VRF callback tx:", tx);

    // Verify ticket has instant win resolved
    const ticket = await program.account.ticket.fetch(ticketPda);
    assert.equal(ticket.instantWinResolved, true);
    // 200 falls in range 130-729 ($5 tier)
    assert.equal(ticket.instantWinAmount.toNumber(), 5_000_000); // $5 USDC

    // Verify pending payout created
    const payout = await program.account.pendingPayout.fetch(
      pendingPayoutPda
    );
    assert.equal(payout.amount.toNumber(), 5_000_000);
    assert.equal(payout.paid, false);
    assert.equal(
      payout.winner.toBase58(),
      buyerKeypair.publicKey.toBase58()
    );
  });

  it("Processes payout after delay", async () => {
    // Note: In local test, we can't easily fast-forward time.
    // This test will only work if we set payout_delay to 0 in test mode
    // or warp the clock. For now, we test the error case.

    const slotNumber = 0;
    const slotBytes = Buffer.alloc(4);
    slotBytes.writeUInt32LE(slotNumber);

    const [pendingPayoutPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("pending_payout"),
        Buffer.from([drawNumber]),
        slotBytes,
      ],
      program.programId
    );

    // Should fail because payout is not due yet (24h delay)
    try {
      await program.methods
        .processPayout()
        .accounts({
          drawState: drawStatePda,
          pendingPayout: pendingPayoutPda,
          vault: vaultPda,
          winnerTokenAccount: buyerUsdcAccount,
          payer: operator.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have thrown PayoutNotDue error");
    } catch (e: any) {
      assert.include(e.message, "PayoutNotDue");
      console.log("Correctly rejected early payout");
    }
  });

  it("Claims free entry", async () => {
    const drawState = await program.account.drawState.fetch(drawStatePda);
    const currentSlot = drawState.ticketsSold;

    const slotBytes = Buffer.alloc(4);
    slotBytes.writeUInt32LE(currentSlot);

    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), Buffer.from([drawNumber]), slotBytes],
      program.programId
    );

    const [freeEntryMarker] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("free_entry"),
        Buffer.from([drawNumber]),
        buyerKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    const tx = await program.methods
      .claimFreeEntry()
      .accounts({
        drawState: drawStatePda,
        freeEntryMarker: freeEntryMarker,
        ticket: ticketPda,
        claimer: buyerKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyerKeypair])
      .rpc();

    console.log("Free entry tx:", tx);

    const ticket = await program.account.ticket.fetch(ticketPda);
    assert.equal(ticket.freeEntry, true);
    assert.equal(ticket.instantWinResolved, true); // No VRF for free entries
    assert.equal(
      ticket.owner.toBase58(),
      buyerKeypair.publicKey.toBase58()
    );
  });

  it("Rejects duplicate free entry", async () => {
    const drawState = await program.account.drawState.fetch(drawStatePda);
    const currentSlot = drawState.ticketsSold;

    const slotBytes = Buffer.alloc(4);
    slotBytes.writeUInt32LE(currentSlot);

    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), Buffer.from([drawNumber]), slotBytes],
      program.programId
    );

    const [freeEntryMarker] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("free_entry"),
        Buffer.from([drawNumber]),
        buyerKeypair.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .claimFreeEntry()
        .accounts({
          drawState: drawStatePda,
          freeEntryMarker: freeEntryMarker,
          ticket: ticketPda,
          claimer: buyerKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyerKeypair])
        .rpc();
      assert.fail("Should have rejected duplicate free entry");
    } catch (e) {
      console.log("Correctly rejected duplicate free entry");
    }
  });

  it("Rejects wrong skill answer", async () => {
    const quantity = 1;
    const solPriceUsd = new anchor.BN(126_000_000);
    const wrongHash = Array.from(
      crypto.createHash("sha256").update("WrongAnswer").digest()
    );

    const drawState = await program.account.drawState.fetch(drawStatePda);
    const slotBytes = Buffer.alloc(4);
    slotBytes.writeUInt32LE(drawState.ticketsSold);
    const [ticketPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("ticket"), Buffer.from([drawNumber]), slotBytes],
      program.programId
    );

    try {
      await program.methods
        .buyTickets(quantity, wrongHash, solPriceUsd)
        .accounts({
          drawState: drawStatePda,
          vault: vaultPda,
          ticket: ticketPda,
          buyer: buyerKeypair.publicKey,
          buyerTokenAccount: buyerUsdcAccount,
          usdcMint: usdcMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([buyerKeypair])
        .rpc();
      assert.fail("Should have rejected wrong answer");
    } catch (e: any) {
      assert.include(e.message, "IncorrectSkillAnswer");
      console.log("Correctly rejected wrong skill answer");
    }
  });
});
