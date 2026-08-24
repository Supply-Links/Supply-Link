/**
 * GET /api/v1/events/export?productId=<id>
 *
 * Export a product's full event history in the Supply-Link interchange format.
 *
 * Query params:
 *   productId  (required) — product to export
 *   offset     (optional) — pagination offset, default 0
 *   limit      (optional) — max events per page, default 100, max 500
 *   format     (optional) — "json" (default) | "jsonld"
 *                           Both return JSON; "jsonld" sets Content-Type to
 *                           application/ld+json for semantic consumers.
 *
 * Authentication: partner tier or higher (registry-based API key)
 * Rate limiting: publicRead preset
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { getEventRepository, getProductRepository } from '@/lib/data';
import { buildInterchangePayload } from '@/lib/interchange/eventExporter';

export const runtime = 'nodejs';

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();

      const product = await getProductRepository().getById(productId);
      if (!product) {
        return apiError(ctx.req, 404, ErrorCode.NOT_FOUND, `Product '${productId}' not found`);
      }

      // Fetch events sorted oldest-first (canonical provenance order)
      const allEvents = (await getEventRepository().listByProduct(productId)).sort(
        (a, b) => a.timestamp - b.timestamp,
      );

  const { searchParams } = request.nextUrl;
  const productId = searchParams.get('productId');

  if (!productId) {
    const res = withCors(
      request,
      apiError(request, 400, ErrorCode.VALIDATION_ERROR, 'productId query parameter is required'),
    );
    recordRequest('GET /api/v1/events/export', 400, Date.now() - start);
    return res;
  }

      return NextResponse.json(payload, {
        status: 200,
        headers: { 'Content-Type': contentType },
      });
    },
  },
);
