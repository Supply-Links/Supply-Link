/**
 * POST /api/v1/transfer-preflight
 *
 * Server-side pre-transfer compliance check. Returns whether a transfer
 * is allowed and the full list of violations/warnings.
 *
 * Body: { productId, newOwner, walletAddress? }
 *
 * Authentication: partner tier or higher
 * Rate limiting: default preset
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { getProductRepository } from '@/lib/data';
import { checkTransferCompliance } from '@/lib/transferCompliance';
import { transferPreflightBodySchema } from '@/lib/api/schemas';
import type { TransferPreflightBody } from '@/lib/api/schemas';

export const runtime = 'nodejs';

export const { POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: transferPreflightBodySchema,
  },
  {
    POST: async (ctx) => {
      const { productId, newOwner, walletAddress, hasPendingEscrow } = ctx.body;

      const product = await getProductRepository().getById(productId);
      if (!product) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, `Product '${productId}' not found`);
      }

      const result = checkTransferCompliance({
        product,
        newOwner,
        walletAddress: walletAddress ?? null,
        hasPendingEscrow,
      });

      return NextResponse.json(
        {
          productId,
          newOwner,
          allowed: result.allowed,
          violations: result.violations,
          blockers: result.blockers,
          warnings: result.warnings,
        },
        { status: 200 },
      );
    },
  },
);
