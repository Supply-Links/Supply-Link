/**
 * POST /api/v1/products/search – search and filter products
 *
 * Request body:
 * {
 *   "text": "coffee",
 *   "filters": {
 *     "category": "agricultural",
 *     "status": "active"
 *   },
 *   "offset": 0,
 *   "limit": 50
 * }
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { searchProducts } from '@/lib/services/searchService';
import { getAllProducts } from '@/lib/mock/products';
import { productSearchBodySchema } from '@/lib/api/schemas';

export const { POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: productSearchBodySchema,
  },
  {
    POST: async (ctx) => {
      const result = searchProducts(getAllProducts(), ctx.body);
      return NextResponse.json(result, { status: 200 });
    },
  },
);
