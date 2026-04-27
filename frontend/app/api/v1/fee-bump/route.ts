import { NextRequest, NextResponse } from 'next/server';
import { Keypair, TransactionBuilder, Networks, BASE_FEE } from '@stellar/base';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';
import { withIdempotency } from '@/lib/api/idempotency';

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function POST(request: NextRequest) {
  const limited = applyRateLimit(request, 'fee-bump', RATE_LIMIT_PRESETS.feeBump);
  if (limited) return limited;

  return withIdempotency(request, async (req, rawBody) => {
    const respond = (body: unknown, init?: ResponseInit) =>
      withCors(req, withCorrelationId(req, NextResponse.json(body, init)));

    try {
      const body = JSON.parse(rawBody);
      const { innerTx } = body;

      if (!innerTx || typeof innerTx !== 'string') {
        return withCors(
          req,
          apiError(req, 400, ErrorCode.MISSING_FIELDS, "Missing or invalid 'innerTx' parameter"),
        );
      }

      const feeBumpSecret = process.env.STELLAR_FEE_BUMP_SECRET;
      if (!feeBumpSecret) {
        return withCors(
          req,
          apiError(req, 500, ErrorCode.DEPENDENCY_UNAVAILABLE, 'Fee-bump account not configured'),
        );
      }

      const feeBumpKeypair = Keypair.fromSecret(feeBumpSecret);

      let innerTransaction;
      try {
        innerTransaction = TransactionBuilder.fromXDR(innerTx, Networks.TESTNET_NETWORK_PASSPHRASE);
      } catch {
        return withCors(
          req,
          apiError(req, 400, ErrorCode.INVALID_PAYLOAD, 'Invalid transaction XDR'),
        );
      }

      const operationCount = innerTransaction.operations.length;
      const feeBumpFee = BASE_FEE * (1 + operationCount);

      const feeBumpTx = new TransactionBuilder(await feeBumpKeypair.publicKey(), {
        fee: feeBumpFee.toString(),
        networkPassphrase: Networks.TESTNET_NETWORK_PASSPHRASE,
      })
        .setBaseFee(BASE_FEE)
        .addOperation(innerTransaction.operations[0])
        .build();

      feeBumpTx.sign(feeBumpKeypair);

      return respond({
        feeBumpTx: feeBumpTx.toXDR(),
        cost: feeBumpFee.toString(),
        message: 'Fee-bump transaction created. Ready to submit to Stellar network.',
      });
    } catch (error) {
      console.error('[fee-bump POST]', error);
      return withCors(
        req,
        apiError(req, 500, ErrorCode.INTERNAL_ERROR, 'Failed to create fee-bump transaction'),
      );
    }
  });
}
