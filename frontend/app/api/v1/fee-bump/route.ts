import { NextRequest, NextResponse } from "next/server";
import { Keypair, TransactionBuilder, Networks, BASE_FEE } from "@stellar/base";

/**
 * POST /api/v1/fee-bump
 *
 * Wraps a user's transaction in a fee-bump transaction paid by the app's account.
 * This enables gasless verification for consumers who don't have XLM.
 *
 * Request body:
 * {
 *   "innerTx": "base64-encoded transaction envelope"
 * }
 *
 * Response:
 * {
 *   "feeBumpTx": "base64-encoded fee-bump transaction envelope",
 *   "cost": "1000" (stroops)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { innerTx } = body;

    if (!innerTx || typeof innerTx !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'innerTx' parameter" },
        { status: 400 }
      );
    }

    // Get the fee-bump account from environment
    const feeBumpSecret = process.env.STELLAR_FEE_BUMP_SECRET;
    if (!feeBumpSecret) {
      return NextResponse.json(
        { error: "Fee-bump account not configured" },
        { status: 500 }
      );
    }

    const feeBumpKeypair = Keypair.fromSecret(feeBumpSecret);

    // Parse the inner transaction
    let innerTransaction;
    try {
      innerTransaction = TransactionBuilder.fromXDR(innerTx, Networks.TESTNET_NETWORK_PASSPHRASE);
    } catch {
      return NextResponse.json(
        { error: "Invalid transaction XDR" },
        { status: 400 }
      );
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

    return NextResponse.json({
      feeBumpTx: feeBumpTx.toXDR(),
      cost: feeBumpFee.toString(),
      message: "Fee-bump transaction created. Ready to submit to Stellar network.",
    });
  } catch (error) {
    console.error("Fee-bump error:", error);
    return NextResponse.json(
      { error: "Failed to create fee-bump transaction" },
      { status: 500 }
    );
  }
}
