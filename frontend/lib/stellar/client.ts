import {
  getPublicKey,
  isConnected,
  signTransaction,
} from "@stellar/freighter-api";

export async function getWalletAddress(): Promise<string | null> {
  const connected = await isConnected();
  if (!connected) return null;
  return getPublicKey();
}

export { signTransaction };

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ??
  "CBUWSKT2UGOAXK4ZREVDJV5XHSYB42PZ3CERU2ZFUTUMAZLJEHNZIECA";

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
  "Test SDF Network ; September 2015";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";

/**
 * Stub: call register_product on the Soroban contract.
 * Returns a simulated transaction hash.
 */
export async function registerProduct(
  productId: string,
  name: string,
  origin: string,
  description: string,
  callerAddress: string
): Promise<string> {
  console.log("registerProduct", { productId, name, origin, description, callerAddress });
  // TODO: build + sign + submit Soroban transaction
  await new Promise((r) => setTimeout(r, 1200));
  return `mock_tx_${Date.now()}`;
}

/**
 * Stub: call list_products on the Soroban contract (paginated).
 */
export async function listProducts(
  page = 0,
  pageSize = 20
): Promise<{ products: import("../types").Product[]; total: number }> {
  console.log("listProducts", { page, pageSize });
  await new Promise((r) => setTimeout(r, 800));
  return { products: [], total: 0 };
}

/**
 * Stub: call transfer_ownership on the Soroban contract.
 * Replace body with real StellarSdk contract invocation.
 */
export async function transferOwnership(
  productId: string,
  newOwner: string,
  callerAddress: string
): Promise<void> {
  console.log("transferOwnership", { productId, newOwner, callerAddress });
  // TODO: build + sign + submit Soroban transaction
  await new Promise((r) => setTimeout(r, 1000)); // simulate network delay
}

/**
 * Stub: call add_authorized_actor on the Soroban contract.
 * Replace body with real StellarSdk contract invocation.
 */
export async function addAuthorizedActor(
  productId: string,
  actor: string,
  callerAddress: string
): Promise<void> {
  console.log("addAuthorizedActor", { productId, actor, callerAddress });
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
  callerAddress: string
): Promise<void> {
  console.log("removeAuthorizedActor", { productId, actor, callerAddress });
  // TODO: build + sign + submit Soroban transaction
  await new Promise((r) => setTimeout(r, 1000)); // simulate network delay
}
