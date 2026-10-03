import { idlErrorName } from "./chain";

/** Human copy for every DrawSol v3 program error (SPEC-v3 §6, Errors). */
const COPY: Record<string, string> = {
  Unauthorized: "Only the operator’s keeper can run this draw in its first minutes after the draw time. After that, anyone can.",
  InvalidParams: "The program rejected these parameters.",
  SalesClosed: "Sales have closed for this draw.",
  SalesStillOpen: "The draw can’t run yet: sales are still open.",
  DrawNotDue: "It isn’t the draw time yet. The draw can be run from its draw time on.",
  SoldOut: "Not enough paid tickets left for that quantity. Lower it and try again.",
  ExceedsPerTx: "That’s more than the per-purchase limit.",
  ExceedsWalletCap: "That would take this wallet past its ticket limit for the draw.",
  FreeCapReached: "All free entries for this draw have been claimed.",
  FreeAlreadyClaimed: "This wallet has already claimed its free entry.",
  WrongStatus: "The draw has moved on since this page loaded. It has refreshed; check the ticket.",
  VrfWrongOwner: "The randomness account isn’t owned by ORAO VRF.",
  VrfWrongAccount: "That isn’t the randomness account recorded for this draw.",
  VrfSeedMismatch: "The randomness seed doesn’t match. Someone may have bought at the same moment; try again.",
  VrfNotFulfilled: "ORAO hasn’t delivered the randomness yet. Give it a few seconds and retry.",
  AlreadyRevealed: "These tickets are already revealed.",
  NoInstantRoll: "These tickets have no instant roll, so there’s nothing to reveal.",
  WrongWinningEntry: "That entry doesn’t hold the winning ticket.",
  NotCancellable: "The draw can only be cancelled 48 hours after its draw time if the randomness never arrived.",
  AlreadyRefunded: "This entry has already been refunded.",
  NothingToRefund: "There’s nothing to refund on this entry: a free entry costs nothing.",
  NothingToWithdraw: "Nothing is withdrawable right now.",
  MathOverflow: "The numbers overflowed; the program refused the transaction.",
  InsufficientCredits: "This wallet doesn’t have that many free tickets any more. Lower the number of credits and try again.",
  SpendLimitExceeded: "That would take this wallet over its play limit for this 30-day period, so the program refused it. Nothing was charged.",
  SelfExcluded: "This wallet is taking a break, so the program won’t sell it tickets or free entries until the break ends.",
  VaultShortfall: "The vault can’t cover this right now. Refunds never pay one player with another’s money, so this one waits until the operator tops the vault up.",
  // Anchor framework errors we can hit in practice
  ConstraintSeeds: "Someone bought at the same moment and took this entry slot. Try again.",
  AccountAlreadyInitialized: "Someone bought at the same moment and took this entry slot. Try again.",
  ConstraintAddress: "An account didn’t match what the program expected. Refresh and try again.",
  AccountNotInitialized: "An account this needs doesn’t exist yet. Refresh and try again.",
};

export interface HumanError {
  message: string;
  code?: string;
  logs?: string[];
}

function fromLogs(logs: string[] | undefined | null): HumanError | null {
  if (!logs) return null;
  for (const l of logs) {
    const m = l.match(/Error Code: (\w+)\. Error Number: (\d+)\. Error Message: (.*?)\.?$/);
    if (m) return { code: m[1], message: COPY[m[1]] ?? m[3] };
  }
  if (logs.some((l) => /insufficient lamports|insufficient funds/i.test(l)))
    return { code: "InsufficientFunds", message: "Not enough SOL in this wallet to cover tickets, rent and fees." };
  if (logs.some((l) => /already in use/i.test(l)))
    return { code: "AlreadyInUse", message: COPY.AccountAlreadyInitialized };
  return null;
}

export function humanize(err: unknown, logs?: string[] | null): HumanError {
  const fromLog = fromLogs(logs);
  if (fromLog) return { ...fromLog, logs: logs ?? undefined };

  const e = err as { message?: string; name?: string; logs?: string[]; error?: { code?: number } } | null;
  const msg = e?.message ?? String(err);
  const nested = fromLogs(e?.logs);
  if (nested) return { ...nested, logs: e?.logs };

  if (e?.name === "WalletSignTransactionError" || /reject|denied|cancel/i.test(msg))
    return { code: "Rejected", message: "You declined in your wallet. Nothing was sent." };
  if (/insufficient (lamports|funds)|Attempt to debit an account but found no record/i.test(msg))
    return { code: "InsufficientFunds", message: "Not enough devnet SOL in this wallet." };
  if (/blockhash not found|block height exceeded|expired/i.test(msg))
    return { code: "Expired", message: "The network didn’t confirm in time. Nothing was charged if it isn’t in your wallet history; try again." };

  const hex = msg.match(/custom program error: 0x([0-9a-f]+)/i);
  if (hex) {
    const code = parseInt(hex[1], 16);
    const name = idlErrorName(code);
    if (name) return { code: name, message: COPY[name] ?? name };
    return { code: String(code), message: `Program error ${code}.` };
  }
  if (/failed to fetch|network|429|timeout/i.test(msg))
    return { code: "Network", message: "Can't reach devnet. Check your connection and retry." };
  return { message: msg.length > 160 ? msg.slice(0, 157) + "…" : msg };
}

/**
 * Human copy for a failed devnet airdrop (connection.requestAirdrop from the visitor's browser).
 * The public faucet rate-limits by IP (429) and sometimes runs dry; say which, plainly.
 */
export function airdropHuman(err: unknown): HumanError {
  const msg = (err as { message?: string } | null)?.message ?? String(err);
  if (/429|too many requests|rate.?limit/i.test(msg))
    return { code: "RateLimited", message: "The devnet faucet is turning away requests from this connection for now (429 Too Many Requests). No SOL was sent." };
  if (/dry|insufficient|faucet has|airdrop limit|limit reached/i.test(msg))
    return { code: "FaucetDry", message: "The devnet faucet has run dry for now. No SOL was sent." };
  if (/blockhash not found|block height exceeded|expired|timeout|timed out/i.test(msg))
    return { code: "Expired", message: "The faucet’s transfer wasn’t confirmed in time. Check your balance in a minute before asking again." };
  if (/failed to fetch|network/i.test(msg)) return { code: "Network", message: "Can’t reach the devnet faucet from this browser right now. No SOL was sent." };
  return { code: "Faucet", message: `The devnet faucet didn’t send any SOL (${msg.length > 90 ? msg.slice(0, 87) + "…" : msg}).` };
}
