import { isConnected, signTransaction } from '@stellar/freighter-api';
import getPublicKey from '@stellar/freighter-api';

export async function getWalletAddress(): Promise<string | null> {
  const connected = await isConnected();
  if (!connected) return null;
  return getPublicKey();
}

export { signTransaction };

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ?? 'CBUWSKT2UGOAXK4ZREVDJV5XHSYB42PZ3CERU2ZFUTUMAZLJEHNZIECA';

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';

/**
 * Stub: call add_authorized_actor on the Soroban contract.
 * Replace body with real StellarSdk contract invocation.
 */
export async function addAuthorizedActor(
  productId: string,
  actor: string,
  callerAddress: string,
): Promise<void> {
  console.log('addAuthorizedActor', { productId, actor, callerAddress });
  // TODO: build + sign + submit Soroban transaction
  await new Promise((r) => setTimeout(r, 1000)); // simulate network delay
}

/**
 * Stub: call remove_authorized_actor on the Soroban contract.
 * Replace body with real StellarSdk contract invocation.
 */
export async function removeAuthorizedActor(
  productId: string,
  actor: string,
  callerAddress: string,
): Promise<void> {
  console.log('removeAuthorizedActor', { productId, actor, callerAddress });
  // TODO: build + sign + submit Soroban transaction
  await new Promise((r) => setTimeout(r, 1000)); // simulate network delay
}
