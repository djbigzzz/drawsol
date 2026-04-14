import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PROGRAM_ID, DRAW_NUMBER, DRAW_STATE_SEED, VAULT_SEED, PRIZE_ESCROW_SEED, TICKET_SEED, PENDING_PAYOUT_SEED } from "./constants";

// Minimal IDL for client use - enough to interact with the program
// Using `any` type to avoid IDL format version mismatches between Anchor TS types
const IDL: any = {
  address: "Ezd47gH9g4jheYrN8M7svheSszkjpPXXvW3NHc2V4Emg",
  version: "0.1.0",
  name: "drawsol",
  instructions: [
    {
      name: "initializeDraw",
      accounts: [
        { name: "drawState", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "prizeEscrow", isMut: true, isSigner: false },
        { name: "usdcMint", isMut: false, isSigner: false },
        { name: "operator", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
        { name: "rent", isMut: false, isSigner: false },
      ],
      args: [
        { name: "drawNumber", type: "u8" },
        { name: "ticketCap", type: "u32" },
        { name: "skillAnswerHash", type: { array: ["u8", 32] } },
      ],
    },
    {
      name: "buyTickets",
      accounts: [
        { name: "drawState", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "ticket", isMut: true, isSigner: false },
        { name: "buyer", isMut: true, isSigner: true },
        { name: "buyerTokenAccount", isMut: true, isSigner: false },
        { name: "usdcMint", isMut: false, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "quantity", type: "u32" },
        { name: "skillAnswerHash", type: { array: ["u8", 32] } },
        { name: "solPriceUsd", type: "u64" },
      ],
    },
    {
      name: "vrfCallback",
      accounts: [
        { name: "drawState", isMut: true, isSigner: false },
        { name: "ticket", isMut: true, isSigner: false },
        { name: "pendingPayout", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "slotNumber", type: "u32" },
        { name: "randomness", type: { array: ["u8", 32] } },
      ],
    },
    {
      name: "triggerGrandDraw",
      accounts: [
        { name: "drawState", isMut: true, isSigner: false },
        { name: "prizeEscrow", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "settleDraw",
      accounts: [
        { name: "drawState", isMut: true, isSigner: false },
        { name: "prizeEscrow", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "winningTicket", isMut: false, isSigner: false },
        { name: "winner", isMut: true, isSigner: false },
        { name: "operatorWallet", isMut: true, isSigner: false },
        { name: "operatorTokenAccount", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "randomness", type: { array: ["u8", 32] } }],
    },
    {
      name: "processPayout",
      accounts: [
        { name: "drawState", isMut: false, isSigner: false },
        { name: "pendingPayout", isMut: true, isSigner: false },
        { name: "vault", isMut: true, isSigner: false },
        { name: "winnerTokenAccount", isMut: true, isSigner: false },
        { name: "payer", isMut: true, isSigner: true },
        { name: "tokenProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "claimFreeEntry",
      accounts: [
        { name: "drawState", isMut: true, isSigner: false },
        { name: "freeEntryMarker", isMut: true, isSigner: false },
        { name: "ticket", isMut: true, isSigner: false },
        { name: "claimer", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "DrawState",
      type: {
        kind: "struct",
        fields: [
          { name: "ticketCap", type: "u32" },
          { name: "ticketsSold", type: "u32" },
          { name: "usdcCollected", type: "u64" },
          { name: "solPriceUsd", type: "u64" },
          { name: "thresholdUsdc", type: "u64" },
          { name: "status", type: { defined: "DrawStatus" } },
          { name: "operator", type: "publicKey" },
          { name: "winner", type: { option: "publicKey" } },
          { name: "drawNumber", type: "u8" },
          { name: "vaultBump", type: "u8" },
          { name: "escrowBump", type: "u8" },
          { name: "bump", type: "u8" },
          { name: "skillAnswerHash", type: { array: ["u8", 32] } },
          { name: "usdcMint", type: "publicKey" },
        ],
      },
    },
    {
      name: "Ticket",
      type: {
        kind: "struct",
        fields: [
          { name: "owner", type: "publicKey" },
          { name: "slotNumber", type: "u32" },
          { name: "timestamp", type: "i64" },
          { name: "freeEntry", type: "bool" },
          { name: "instantWinAmount", type: "u64" },
          { name: "instantWinResolved", type: "bool" },
          { name: "drawNumber", type: "u8" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "PendingPayout",
      type: {
        kind: "struct",
        fields: [
          { name: "winner", type: "publicKey" },
          { name: "amount", type: "u64" },
          { name: "dueTimestamp", type: "i64" },
          { name: "paid", type: "bool" },
          { name: "drawNumber", type: "u8" },
          { name: "slotNumber", type: "u32" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  types: [
    {
      name: "DrawStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Open" },
          { name: "ThresholdMet" },
          { name: "Drawing" },
          { name: "Settled" },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: "DrawNotOpen", msg: "Draw is not in Open status" },
    { code: 6001, name: "DrawNotThresholdMet", msg: "Draw is not in ThresholdMet status" },
    { code: 6002, name: "DrawNotDrawing", msg: "Draw is not in Drawing status" },
    { code: 6003, name: "TicketsSoldOut", msg: "All tickets have been sold" },
    { code: 6004, name: "InvalidQuantity", msg: "Invalid ticket quantity (1-100)" },
    { code: 6005, name: "ExceedsTicketCap", msg: "Purchase would exceed ticket cap" },
    { code: 6006, name: "IncorrectSkillAnswer", msg: "Incorrect skill answer" },
    { code: 6007, name: "InsufficientPayment", msg: "Insufficient USDC payment" },
    { code: 6008, name: "PayoutNotDue", msg: "Payout not yet due" },
    { code: 6009, name: "PayoutAlreadyPaid", msg: "Payout already processed" },
    { code: 6010, name: "FreeEntryAlreadyClaimed", msg: "Free entry already claimed" },
    { code: 6011, name: "InvalidCaptchaProof", msg: "Invalid CAPTCHA proof" },
    { code: 6012, name: "UnauthorizedOperator", msg: "Unauthorized operator" },
    { code: 6013, name: "ArithmeticOverflow", msg: "Arithmetic overflow" },
    { code: 6014, name: "InvalidVrfResult", msg: "Invalid VRF result" },
    { code: 6015, name: "ThresholdNotMet", msg: "Threshold not met" },
    { code: 6016, name: "InvalidPriceFeed", msg: "Invalid price feed" },
  ],
};

export function getProgram(provider: AnchorProvider) {
  return new Program(IDL, provider);
}

export function getDrawStatePda(drawNumber: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(DRAW_STATE_SEED), Buffer.from([drawNumber])],
    PROGRAM_ID
  );
}

export function getVaultPda(drawNumber: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED), Buffer.from([drawNumber])],
    PROGRAM_ID
  );
}

export function getPrizeEscrowPda(drawNumber: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PRIZE_ESCROW_SEED), Buffer.from([drawNumber])],
    PROGRAM_ID
  );
}

export function getTicketPda(
  drawNumber: number,
  slotNumber: number
): [PublicKey, number] {
  const slotBytes = Buffer.alloc(4);
  slotBytes.writeUInt32LE(slotNumber);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(TICKET_SEED), Buffer.from([drawNumber]), slotBytes],
    PROGRAM_ID
  );
}

export function getPendingPayoutPda(
  drawNumber: number,
  slotNumber: number
): [PublicKey, number] {
  const slotBytes = Buffer.alloc(4);
  slotBytes.writeUInt32LE(slotNumber);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PENDING_PAYOUT_SEED), Buffer.from([drawNumber]), slotBytes],
    PROGRAM_ID
  );
}

export { IDL };
