/**
 * GET  /api/v1/insurance        – list coverage for a product
 * POST /api/v1/insurance        – add insurance coverage to a product
 *
 * Authentication: x-api-key (partner or internal)
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { insuranceCoverageBodySchema, insuranceListQuerySchema } from '@/lib/api/schemas';
import {
  addCoverage,
  listCoverageForProduct,
  verifyCoverage,
} from '@/lib/services/insuranceCoverage';
import { recordReadAccess, anonymousActor } from '@/lib/services/readAccessAudit';

const { GET } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
    query: insuranceListQuerySchema,
  },
  {
    GET: async (ctx) => {
      // Audit the read access
      recordReadAccess({
        operation: 'insurance.read',
        productIds: [ctx.query.productId],
        actor: anonymousActor(),
        requestPath: ctx.req.nextUrl.pathname,
        responseStatus: 200,
        correlationId: ctx.correlationId,
      });

      const coverages = listCoverageForProduct(ctx.query.productId);
      const verification = verifyCoverage(ctx.query.productId);

      return NextResponse.json(
        { coverages, verification, total: coverages.length },
        { status: 200 },
      );
    },
  },
);

const { POST, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: insuranceCoverageBodySchema,
  },
  {
    POST: async (ctx) => {
      const coverage = addCoverage(ctx.body);
      return NextResponse.json(coverage, { status: 201 });
    },
  },
);

export { GET, POST, OPTIONS };
