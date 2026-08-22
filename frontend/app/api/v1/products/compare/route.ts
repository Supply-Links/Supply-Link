/**
 * POST /api/v1/products/compare – compare multiple products across supply chain
 *
 * Request body:
 * {
 *   "productIds": ["prod-001", "prod-002"]
 * }
 *
 * Response:
 * {
 *   "products": [
 *     {
 *       "productId": "prod-001",
 *       "name": "Organic Coffee",
 *       "metrics": { ... },
 *       "commonActors": [...],
 *       "commonLocations": [...]
 *     }
 *   ],
 *   "networkTrustSignals": {
 *     "sharedActors": { "actor1": 2, ... },
 *     "sharedLocations": { "location1": 2, ... },
 *     "trustPathStrength": 75.5
 *   }
 * }
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { productCompareBodySchema } from '@/lib/api/schemas';
import { compareProducts } from '@/lib/services/comparisonService';
import { getProductById } from '@/lib/mock/products';
import { MOCK_EVENTS } from '@/lib/mock/events';

export const { POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: productCompareBodySchema,
  },
  {
    POST: async (ctx) => {
      const productIds = ctx.body.productIds;
      const products = productIds.map((id) => getProductById(id)).filter((p) => p !== undefined);

      if (products.length < 2) {
        return apiError(
          ctx.req,
          400,
          ErrorCode.VALIDATION_ERROR,
          'At least 2 valid products required',
        );
      }

      const result = compareProducts(products, MOCK_EVENTS);
      return NextResponse.json(
        {
          products: result.products,
          networkTrustSignals: {
            sharedActors: Object.fromEntries(result.networkTrustSignals.sharedActors),
            sharedLocations: Object.fromEntries(result.networkTrustSignals.sharedLocations),
            trustPathStrength: result.networkTrustSignals.trustPathStrength,
          },
        },
        { status: 200 },
      );
    },
  },
);
