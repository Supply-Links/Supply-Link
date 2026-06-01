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

  // ── Emergency Alert / Recall ──────────────────────────────────────────────

  async issueRecallAlert(
    productId: string,
    issuer: string,
    severity: string,
    title: string,
    description: string,
    channels: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "issue_recall_alert",
      args: [productId, new Address(issuer), severity, title, description, channels],
      callerAddress,
    });
  },

  async resolveRecallAlert(
    productId: string,
    resolver: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "resolve_recall_alert",
      args: [productId, new Address(resolver)],
      callerAddress,
    });
  },

  async getRecallAlert(productId: string, callerAddress: string): Promise<any | null> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_recall_alert",
      args: [productId],
      callerAddress,
    });
    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]) ?? null;
    }
    throw new Error("Failed to get recall alert");
  },

  async getRecallAlertHistory(productId: string, callerAddress: string): Promise<any[]> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_recall_alert_history",
      args: [productId],
      callerAddress,
    });
    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]) || [];
    }
    throw new Error("Failed to get recall alert history");
  },

  // ── Certificate & Revocation Registry ────────────────────────────────────

  async issueCertificate(
    certId: string,
    productId: string,
    issuer: string,
    certType: string,
    metadata: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "issue_certificate",
      args: [certId, productId, new Address(issuer), certType, metadata],
      callerAddress,
    });
  },

  async revokeCertificate(
    certId: string,
    revoker: string,
    reason: string,
    callerAddress: string
  ): Promise<string> {
    return buildSignAndSubmitTransaction({
      method: "revoke_certificate",
      args: [certId, new Address(revoker), reason],
      callerAddress,
    });
  },

  async getCertificate(certId: string, callerAddress: string): Promise<any> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_certificate",
      args: [certId],
      callerAddress,
    });
    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]);
    }
    throw new Error("Failed to get certificate");
  },

  async getProductCertificates(productId: string, callerAddress: string): Promise<any[]> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_product_certificates",
      args: [productId],
      callerAddress,
    });
    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]) || [];
    }
    throw new Error("Failed to get product certificates");
  },

  async getRevocation(certId: string, callerAddress: string): Promise<any | null> {
    const simulated = await buildAndSimulateTransaction({
      method: "get_revocation",
      args: [certId],
      callerAddress,
    });
    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]) ?? null;
    }
    throw new Error("Failed to get revocation");
  },

  async isCertificateValid(certId: string, callerAddress: string): Promise<boolean> {
    const simulated = await buildAndSimulateTransaction({
      method: "is_certificate_valid",
      args: [certId],
      callerAddress,
    });
    if (SorobanRpc.isSimulationSuccess(simulated)) {
      return scValToNative(simulated.results?.[0]) ?? false;
    }
    throw new Error("Failed to check certificate validity");
  },
};
