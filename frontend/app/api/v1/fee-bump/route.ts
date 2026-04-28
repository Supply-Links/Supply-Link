import { NextRequest, NextResponse } from 'next/server';
import { Keypair, TransactionBuilder, Networks, BASE_FEE } from '@stellar/stellar-sdk';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { withIdempotency } from '@/lib/api/idempotency';
import { requirePolicy } from '@/lib/api/policy';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';
import { feeBumpBodySchema } from '@/lib/api/schemas';
import { handleValidationError, parseJsonBody } from '@/lib/api/validation';

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

async function handler(request: NextRequest) {
  const limited = applyRateLimit(request, 'fee-bump', RATE_LIMIT_PRESETS.feeBump);
  if (limited) return limited;

  return withIdempotency(request, async (req, rawBody) => {
    const respond = (body: unknown, init?: ResponseInit) =>
      withCors(req, withCorrelationId(req, NextResponse.json(body, init)));

    try {
      const { innerTx } = parseJsonBody(req, rawBody, feeBumpBodySchema);

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
        innerTransaction = TransactionBuilder.fromXDR(innerTx, Networks.TESTNET);
      } catch {
        return withCors(
          req,
          apiError(req, 400, ErrorCode.INVALID_PAYLOAD, 'Invalid transaction XDR'),
        );
      }

      const operationCount = innerTransaction.operations.length;
      const feeBumpFee = (BigInt(BASE_FEE) * BigInt(1 + operationCount)).toString();
      const feeBumpTx = TransactionBuilder.buildFeeBumpTransaction(
        feeBumpKeypair,
        feeBumpFee,
        innerTransaction,
        Networks.TESTNET,
      );

      feeBumpTx.sign(feeBumpKeypair);

      return respond({
        feeBumpTx: feeBumpTx.toXDR(),
        cost: feeBumpFee,
        message: 'Fee-bump transaction created. Ready to submit to Stellar network.',
      });
    } catch (error) {
      const validation = handleValidationError(req, error);
      if (validation) return withCors(req, validation);
      console.error('[fee-bump POST]', error);
      return withCors(
        req,
        apiError(req, 500, ErrorCode.INTERNAL_ERROR, 'Failed to create fee-bump transaction'),
      );
    }
  });
}

export const POST = requirePolicy('internal', handler);
