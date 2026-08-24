/**
 * GET /api/v1/products/[id] – get product details with ownership history
 *
 * Authentication: public (no auth required)
 * Rate limiting: publicRead preset
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { getProductRepository } from '@/lib/data';

export const { GET, OPTIONS } = defineRoute(
  {
    auth: 'public',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
    params: z.object({ id: z.string() }),
  },
  {
    GET: async (ctx) => {
      const { id } = ctx.params;

      if (!id || typeof id !== 'string') {
        return apiError(ctx.req, 400, ErrorCode.VALIDATION_ERROR, 'Invalid product ID');
      }

      const product = await getProductRepository().getById(id);
      if (!product) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, `Product not found: ${id}`);
      }

      return NextResponse.json(product, { status: 200 });
    },
  },
);
