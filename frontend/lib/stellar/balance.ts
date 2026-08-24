import { rpc } from '@stellar/stellar-sdk';
import { RPC_URL } from './client';

const server = new rpc.Server(RPC_URL);

const MIN_BALANCE_THRESHOLD = 1; // 1 XLM

interface HorizonBalanceEntry {
  asset_type: string;
  balance: string;
}

/**
 * `rpc.Server#getAccount` returns the Soroban `Account` type, which only
 * exposes sequence-number bookkeeping and has no `balances` field. Some
 * account sources (e.g. Horizon) do attach one, so read it defensively
 * rather than assuming the shape — this keeps the "no balance data" case
 * (the common one) explicit instead of silently trusting an `any` cast.
 */
function extractBalances(account: unknown): HorizonBalanceEntry[] {
  if (
    typeof account !== 'object' ||
    account === null ||
    !('balances' in account) ||
    !Array.isArray((account as { balances: unknown }).balances)
  ) {
    return [];
  }

  return (account as { balances: unknown[] }).balances.filter(
    (b): b is HorizonBalanceEntry =>
      typeof b === 'object' &&
      b !== null &&
      typeof (b as Record<string, unknown>).asset_type === 'string' &&
      typeof (b as Record<string, unknown>).balance === 'string',
  );
}

/**
 * Fetch XLM balance for an account
 * Returns balance in XLM
 */
export async function getXlmBalance(accountAddress: string): Promise<string> {
  try {
    const account = await server.getAccount(accountAddress);
    const nativeBalance = extractBalances(account).find((b) => b.asset_type === 'native');

    if (!nativeBalance) {
      return '0';
    }

    return nativeBalance.balance;
  } catch (error) {
    console.error('Failed to fetch XLM balance:', error);
    throw new Error('Failed to fetch account balance');
  }
}

/**
 * Check if balance is below minimum threshold
 */
export function isBelowMinimumBalance(balanceXlm: string): boolean {
  try {
    const balance = parseFloat(balanceXlm);
    return balance < MIN_BALANCE_THRESHOLD;
  } catch {
    return true;
  }
}

/**
 * Format balance for display
 */
export function formatBalance(balanceXlm: string): string {
  try {
    const balance = parseFloat(balanceXlm);
    if (balance === 0) return '0 XLM';
    if (balance < 0.0001) return '< 0.0001 XLM';
    return `${balance.toFixed(4)} XLM`;
  } catch {
    return '0 XLM';
  }
}
