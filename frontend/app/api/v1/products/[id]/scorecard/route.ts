/**
 * GET /api/v1/products/[id]/scorecard
 *
 * Generate a traceability scorecard for compliance reporting.
 * Returns metrics on supply chain completeness and compliance coverage.
 *
 * Authentication: internal tier (x-api-key)
 * Rate limiting: publicRead preset
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { getEventRepository, getProductRepository } from '@/lib/data';
import { calculateTraceabilityScore } from '@/lib/compliance/traceabilityScorecard';

export const runtime = 'nodejs';

export const { GET, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
    params: z.object({ id: z.string() }),
  },
  {
    GET: async (ctx) => {
      const { id: productId } = ctx.params;

      const product = await getProductRepository().getById(productId);
      if (!product) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, `Product '${productId}' not found`);
      }

      const events = await getEventRepository().listByProduct(productId);
      const scorecard = calculateTraceabilityScore(productId, events);

      return NextResponse.json(scorecard, { status: 200 });
    },
  },
);
