import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";
import { signTransaction } from "./client";
import { NETWORK_PASSPHRASE, RPC_URL, CONTRACT_ID, getNetwork } from "./client";

const server = new SorobanRpc.Server(RPC_URL);

interface ContractInvocationParams {
  method: string;
  args: any[];
  callerAddress: string;
}

async function buildAndSimulateTransaction(
  params: ContractInvocationParams
): Promise<SorobanRpc.SimulateTransactionResponse> {
  const account = await server.getAccount(params.callerAddress);
  const contract = new Contract(CONTRACT_ID);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(params.method, ...params.args.map((arg) => nativeToScVal(arg)))
    )
    .setTimeout(30)
    .build();

  return server.simulateTransaction(tx);
}

async function buildSignAndSubmitTransaction(
  params: ContractInvocationParams
): Promise<string> {
  const account = await server.getAccount(params.callerAddress);
  const contract = new Contract(CONTRACT_ID);

  let tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(params.method, ...params.args.map((arg) => nativeToScVal(arg)))
    )
    .setTimeout(30)
    .build();

  // Simulate to get auth and resource fees
  const simulated = await server.simulateTransaction(tx);

  if (SorobanRpc.isSimulationSuccess(simulated)) {
    tx = SorobanRpc.assembleTransaction(tx, simulated).build();
  } else {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }

  // Sign with Freighter
  const signed = await signTransaction(tx.toXDR(), NETWORK_PASSPHRASE);
  const signedTx = TransactionBuilder.fromXDR(signed, NETWORK_PASSPHRASE);

  // Submit
  const result = await server.sendTransaction(signedTx);
  return result.hash;
}

export const contractClient = {
  async registerProduct(
    productId: string,
    name: string,
    origin: string,
    owner: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "register_product",
      args: [productId, name, origin, new Address(owner)],
      callerAddress,
    });
  },

  async addTrackingEvent(
    productId: string,
    location: string,
    eventType: string,
    metadata: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "add_tracking_event",
      args: [productId, location, eventType, metadata],
      callerAddress,
    });
  },

  async getProduct(productId: string, callerAddress: string): Promise<any> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_product",
      args: [productId],
      callerAddress,
    });

    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]);
    }
    throw new Error("Failed to get product");
  },

  async getTrackingEvents(productId: string, callerAddress: string): Promise<any[]> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_tracking_events",
      args: [productId],
      callerAddress,
    });

    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]) || [];
    }
    throw new Error("Failed to get tracking events");
  },

  async transferOwnership(
    productId: string,
    newOwner: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "transfer_ownership",
      args: [productId, new Address(newOwner)],
      callerAddress,
    });
  },

  async addAuthorizedActor(
    productId: string,
    actor: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "add_authorized_actor",
      args: [productId, new Address(actor)],
      callerAddress,
    });
  },

  async removeAuthorizedActor(
    productId: string,
    actor: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "remove_authorized_actor",
      args: [productId, new Address(actor)],
      callerAddress,
    });
  },

  async listProducts(page: number = 0, pageSize: number = 20, callerAddress: string): Promise<any[]> {
    const simulated = await buildAndSimulateTransaction({
      method: "list_products",
      args: [page, pageSize],
      callerAddress,
    });

    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]) || [];
    }
    throw new Error("Failed to list products");
  },

  async getProductCount(callerAddress: string): Promise<number> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_product_count",
      args: [],
      callerAddress,
    });

    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]) || 0;
    }
    throw new Error("Failed to get product count");
  },

  // ── Insurance coverage ──────────────────────────────────────────────────────

  /**
   * Call add_insurance_coverage on the Soroban contract.
   * Only the product owner or an authorized actor may call this.
   * Returns the transaction hash.
   */
  async addInsuranceCoverage(
    productId: string,
    callerAddress: string,
    policyId: string,
    provider: string,
    coverageType: string,
    validFrom: string,
    validUntil: string,
    insuredValue: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "add_insurance_coverage",
      args: [
        productId,
        new Address(callerAddress),
        policyId,
        provider,
        coverageType,
        validFrom,
        validUntil,
        insuredValue,
      ],
      callerAddress,
    });
  },

  /**
   * Call get_insurance on the Soroban contract.
   * Also logs the read access on-chain with the given purpose.
   * Returns the InsuranceCoverage or null if none recorded.
   */
  async getInsurance(
    productId: string,
    callerAddress: string,
    purpose: string
  ): Promise<import("../types").InsuranceCoverage | null> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_insurance",
      args: [productId, new Address(callerAddress), purpose],
      callerAddress,
    });

    if (SorobanRpc.isSimulationSuccess(simulated)) {
      const raw = scValToNative(simulated.results?.[0]);
      if (!raw) return null;
      // Map snake_case contract fields to camelCase TypeScript interface
      return {
        policyId: raw.policy_id,
        provider: raw.provider,
        coverageType: raw.coverage_type,
        validFrom: raw.valid_from,
        validUntil: raw.valid_until,
        insuredValue: raw.insured_value,
        recordedBy: raw.recorded_by,
        timestamp: Number(raw.timestamp) * 1000, // ledger seconds → ms
      };
    }
    throw new Error("Failed to get insurance coverage");
  },

  /**
   * Call add_claim_proof on the Soroban contract.
   * Only the product owner or an authorized actor may call this.
   * Returns the transaction hash.
   */
  async addClaimProof(
    productId: string,
    callerAddress: string,
    claimId: string,
    documentRef: string,
    description: string,
    status: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "add_claim_proof",
      args: [
        productId,
        new Address(callerAddress),
        claimId,
        documentRef,
        description,
        status,
      ],
      callerAddress,
    });
  },

  /**
   * Call get_claim_proofs on the Soroban contract.
   * Also logs the read access on-chain with the given purpose.
   * Returns an array of ClaimProof objects.
   */
  async getClaimProofs(
    productId: string,
    callerAddress: string,
    purpose: string
  ): Promise<import("../types").ClaimProof[]> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_claim_proofs",
      args: [productId, new Address(callerAddress), purpose],
      callerAddress,
    });

    if (SorobanRpc.isSimulationSuccess(simulated)) {
      const raw: any[] = scValToNative(simulated.results?.[0]) || [];
      return raw.map((r) => ({
        claimId: r.claim_id,
        documentRef: r.document_ref,
        description: r.description,
        status: r.status,
        submittedBy: r.submitted_by,
        timestamp: Number(r.timestamp) * 1000,
      }));
    }
    throw new Error("Failed to get claim proofs");
  },

  // ── Read-access audit logging ───────────────────────────────────────────────

  /**
   * Call log_read_access on the Soroban contract.
   * Records that callerAddress accessed productId for the given purpose.
   * Returns the transaction hash.
   */
  async logReadAccess(
    productId: string,
    callerAddress: string,
    purpose: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "log_read_access",
      args: [productId, new Address(callerAddress), purpose],
      callerAddress,
    });
  },

  /**
   * Call get_read_logs on the Soroban contract.
   * Only the product owner may retrieve the full audit trail.
   * Returns an array of ReadAccessLog objects.
   */
  async getReadLogs(
    productId: string,
    callerAddress: string
  ): Promise<import("../types").ReadAccessLog[]> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_read_logs",
      args: [productId, new Address(callerAddress)],
      callerAddress,
    });

    if (SorobanRpc.isSimulationSuccess(simulated)) {
      const raw: any[] = scValToNative(simulated.results?.[0]) || [];
      return raw.map((r) => ({
        productId: r.product_id,
        accessor: r.accessor,
        timestamp: Number(r.timestamp) * 1000,
        purpose: r.purpose,
      }));
    }
    throw new Error("Failed to get read logs");
  },
};
