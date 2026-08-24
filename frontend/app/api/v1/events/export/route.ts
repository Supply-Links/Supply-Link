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
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { getEventRepository, getProductRepository } from '@/lib/data';
import { buildInterchangePayload } from '@/lib/interchange/eventExporter';

const VALID_FORMATS = ['json', 'jsonld'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

export const { GET, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
  },
  {
    GET: async (ctx) => {
      const { searchParams } = ctx.req.nextUrl;
      const productId = searchParams.get('productId');

      if (!productId) {
        return apiError(
          ctx.req,
          400,
          ErrorCode.VALIDATION_ERROR,
          'productId query parameter is required',
        );
      }

      const rawFormat = (searchParams.get('format') ?? 'json').toLowerCase();
      if (!VALID_FORMATS.includes(rawFormat as ExportFormat)) {
        return apiError(
          ctx.req,
          400,
          ErrorCode.VALIDATION_ERROR,
          `format must be one of: ${VALID_FORMATS.join(', ')}`,
        );
      }
      const format = rawFormat as ExportFormat;

      const offsetParam = searchParams.get('offset');
      const limitParam = searchParams.get('limit');
      const offset = offsetParam !== null ? Number(offsetParam) : 0;
      const limit = limitParam !== null ? Number(limitParam) : 100;

      if (!Number.isInteger(offset) || offset < 0) {
        return apiError(
          ctx.req,
          400,
          ErrorCode.VALIDATION_ERROR,
          'offset must be a non-negative integer',
        );
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
        return apiError(
          ctx.req,
          400,
          ErrorCode.VALIDATION_ERROR,
          'limit must be an integer between 1 and 500',
        );
      }

      const product = await getProductRepository().getById(productId);
      if (!product) {
        return apiError(ctx.req, 404, ErrorCode.NOT_FOUND, `Product '${productId}' not found`);
      }

      // Fetch events sorted oldest-first (canonical provenance order)
      const allEvents = (await getEventRepository().listByProduct(productId)).sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      const payload = buildInterchangePayload(product, allEvents, { offset, limit });
      const contentType = format === 'jsonld' ? 'application/ld+json' : 'application/json';

      return NextResponse.json(payload, {
        status: 200,
        headers: { 'Content-Type': contentType },
      });
    },
  },
);
