import { NextRequest, NextResponse } from "next/server";
import { Keypair, TransactionBuilder, Networks, BASE_FEE } from "@stellar/base";
import { withCors, handleOptions } from "@/lib/api/cors";

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

    // Get the fee-bump account from environment
    const feeBumpSecret = process.env.STELLAR_FEE_BUMP_SECRET;
    if (!feeBumpSecret) {
      return respond({ error: "Fee-bump account not configured" }, { status: 500 });
    }

    const feeBumpKeypair = Keypair.fromSecret(feeBumpSecret);

    // Parse the inner transaction
    let innerTransaction;
    try {
      innerTransaction = TransactionBuilder.fromXDR(innerTx, Networks.TESTNET_NETWORK_PASSPHRASE);
    } catch {
      return respond({ error: "Invalid transaction XDR" }, { status: 400 });
    }

    // Create fee-bump transaction
    // Fee: base fee (100 stroops) * (1 + number of operations)
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

    // Sign with fee-bump account
    feeBumpTx.sign(feeBumpKeypair);

    return respond({
      feeBumpTx: feeBumpTx.toXDR(),
      cost: feeBumpFee.toString(),
      message: "Fee-bump transaction created. Ready to submit to Stellar network.",
    });
  } catch (error) {
    console.error("Fee-bump error:", error);
    return respond({ error: "Failed to create fee-bump transaction" }, { status: 500 });
  }
}
