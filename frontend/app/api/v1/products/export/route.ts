/**
 * POST /api/v1/products/export – export product timeline for regulatory reporting
 *
 * Request body:
 * {
 *   "productIds": ["prod-001"],
 *   "format": "json" | "csv"
 * }
 *
 * Response: File download (application/json or text/csv)
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { generateTimelineExport, generateBatchExport } from '@/lib/services/exportService';
import { getProductById, MOCK_EVENTS } from '@/lib/mock/products';
import { productExportBodySchema } from '@/lib/api/schemas';

export const { POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: productExportBodySchema,
  },
  {
    POST: async (ctx) => {
      const format = ctx.body.format;
      const products = ctx.body.productIds
        .map((id) => getProductById(id))
        .filter((p) => p !== undefined);

      if (products.length === 0) {
        return apiError(ctx.req, 400, ErrorCode.VALIDATION_ERROR, 'No valid products found');
      }

      let content: string;
      let filename: string;

      if (products.length === 1) {
        const exp = generateTimelineExport(products[0], MOCK_EVENTS, format);
        content =
          format === 'json'
            ? JSON.stringify(exp, null, 2)
            : generateBatchExport(products, MOCK_EVENTS, format);
        filename = `timeline-${products[0].id}-${Date.now()}.${format}`;
      } else {
        content = generateBatchExport(products, MOCK_EVENTS, format);
        filename = `timeline-batch-${Date.now()}.${format}`;
      }

      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': format === 'json' ? 'application/json' : 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    },
  },
);
