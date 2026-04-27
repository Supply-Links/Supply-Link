import { NextRequest, NextResponse } from "next/server";
import { Keypair, TransactionBuilder, Networks, BASE_FEE } from "@stellar/base";
import { withCors, handleOptions } from "@/lib/api/cors";
import { requireSecret, SecretMissingError, SecretInvalidError, redactSecrets } from "@/lib/secrets";

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  const respond = (body: unknown, init?: ResponseInit) =>
    withCors(request, NextResponse.json(body, init));

  try {
    const body = await request.json();
    const { innerTx } = body;

    if (!innerTx || typeof innerTx !== "string") {
      return respond({ error: "Missing or invalid 'innerTx' parameter" }, { status: 400 });
    }

    // Validated accessor — throws SecretMissingError / SecretInvalidError
    // without leaking the value into the error message
    let feeBumpKeypair: Keypair;
    try {
      feeBumpKeypair = Keypair.fromSecret(requireSecret("STELLAR_FEE_BUMP_SECRET"));
    } catch (e) {
      if (e instanceof SecretMissingError || e instanceof SecretInvalidError) {
        // Safe: e.message never contains the secret value
        console.error("Fee-bump secret error:", e.message);
        return respond({ error: "Fee-bump account not configured" }, { status: 503 });
      }
      throw e;
    }

    let innerTransaction;
    try {
      innerTransaction = TransactionBuilder.fromXDR(innerTx, Networks.TESTNET_NETWORK_PASSPHRASE);
    } catch {
      return respond({ error: "Invalid transaction XDR" }, { status: 400 });
    }

    const operationCount = innerTransaction.operations.length;
    const feeBumpFee = BASE_FEE * (1 + operationCount);

    const feeBumpTx = new TransactionBuilder(
      await feeBumpKeypair.publicKey(),
      {
        fee: feeBumpFee.toString(),
        networkPassphrase: Networks.TESTNET_NETWORK_PASSPHRASE,
      }
    )
      .setBaseFee(BASE_FEE)
      .addOperation(innerTransaction.operations[0])
      .build();

    feeBumpTx.sign(feeBumpKeypair);

    return respond({
      feeBumpTx: feeBumpTx.toXDR(),
      cost: feeBumpFee.toString(),
      message: "Fee-bump transaction created. Ready to submit to Stellar network.",
    });
  } catch (error) {
    // Redact any secret values that may have leaked into the error string
    const safeMessage = redactSecrets(String(error));
    console.error("Fee-bump error:", safeMessage);
    return respond({ error: "Failed to create fee-bump transaction" }, { status: 500 });
  }
}
