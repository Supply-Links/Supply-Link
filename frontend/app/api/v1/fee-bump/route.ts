import { NextRequest, NextResponse } from 'next/server';
import { Keypair, TransactionBuilder, Networks, BASE_FEE } from '@stellar/base';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';
import { withIdempotency } from '@/lib/api/idempotency';
import { requirePolicy } from '@/lib/api/policy';
import { AuditEmitter } from '@/lib/api/audit';

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

async function handler(request: NextRequest) {
  const limited = applyRateLimit(request, 'fee-bump', RATE_LIMIT_PRESETS.feeBump);
  if (limited) return limited;

  return withIdempotency(request, async (req, rawBody) => {
    const respond = (body: unknown, init?: ResponseInit) =>
      withCors(req, withCorrelationId(req, NextResponse.json(body, init)));

    let resultBody: any;
    let resultStatus: number = 200;

    try {
      const body = JSON.parse(rawBody);
      const { innerTx } = body;

      if (!innerTx || typeof innerTx !== 'string') {
        resultStatus = 400;
        resultBody = {
          error: ErrorCode.MISSING_FIELDS,
          message: "Missing or invalid 'innerTx' parameter",
        };
        return withCors(req, apiError(req, resultStatus, resultBody.error, resultBody.message));
      }

      const feeBumpSecret = process.env.STELLAR_FEE_BUMP_SECRET;
      if (!feeBumpSecret) {
        resultStatus = 500;
        resultBody = {
          error: ErrorCode.DEPENDENCY_UNAVAILABLE,
          message: 'Fee-bump account not configured',
        };
        return withCors(req, apiError(req, resultStatus, resultBody.error, resultBody.message));
      }

      const feeBumpKeypair = Keypair.fromSecret(feeBumpSecret);

      let innerTransaction;
      try {
        innerTransaction = TransactionBuilder.fromXDR(innerTx, Networks.TESTNET_NETWORK_PASSPHRASE);
      } catch {
        resultStatus = 400;
        resultBody = { error: ErrorCode.INVALID_PAYLOAD, message: 'Invalid transaction XDR' };
        return withCors(req, apiError(req, resultStatus, resultBody.error, resultBody.message));
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

      resultBody = {
        feeBumpTx: feeBumpTx.toXDR(),
        cost: feeBumpFee.toString(),
        message: 'Fee-bump transaction created. Ready to submit to Stellar network.',
      };
      resultStatus = 200;
    } catch (error) {
      console.error('[fee-bump POST]', error);
      resultStatus = 500;
      resultBody = {
        error: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to create fee-bump transaction',
      };
    } finally {
      // Audit log the operation
      AuditEmitter.emit(
        req,
        'fee-bump.create',
        resultStatus,
        rawBody ? JSON.parse(rawBody) : undefined,
        resultBody,
      );
    }

    if (resultStatus === 200) {
      return respond(resultBody);
    } else {
      return withCors(req, apiError(req, resultStatus, resultBody.error, resultBody.message));
    }
  });
}

// Access tier: internal – signs with STELLAR_FEE_BUMP_SECRET; never expose publicly
export const POST = requirePolicy('internal', handler);

