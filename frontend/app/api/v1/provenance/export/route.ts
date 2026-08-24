/**
 * GET /api/v1/provenance/export  — AI-ready ML provenance export
 *
 * Query params:
 *   format   json | ndjson | csv  (default: json)
 *   productId  (optional) restrict to a single product
 *
 * closes #481
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { listProducts, getTrackingEvents } from '@/lib/services/productReadModel';
import { buildMLExport, toNDJSON, toCSV, ML_EXPORT_SCHEMA_VERSION } from '@/lib/ml/export';

const VALID_FORMATS = ['json', 'ndjson', 'csv'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

export const { GET, OPTIONS } = defineRoute(
  {
    auth: 'public',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
  },
  {
    GET: async (ctx) => {
      const { searchParams } = ctx.req.nextUrl;
      const rawFormat = (searchParams.get('format') ?? 'json').toLowerCase();
      const productIdFilter = searchParams.get('productId') ?? undefined;

      if (!VALID_FORMATS.includes(rawFormat as ExportFormat)) {
        return apiError(
          ctx.req,
          400,
          ErrorCode.VALIDATION_ERROR,
          `format must be one of: ${VALID_FORMATS.join(', ')}`,
        );
      }

      const format = rawFormat as ExportFormat;

      try {
        // Fetch products
        let products = await listProducts();
        if (productIdFilter) {
          products = products.filter((p) => p.id === productIdFilter);
        }

        // Fetch events for each product in parallel
        const eventsMap = new Map<string, Awaited<ReturnType<typeof getTrackingEvents>>>();
        await Promise.all(
          products.map(async (p) => {
            const events = await getTrackingEvents(p.id);
            eventsMap.set(p.id, events);
          }),
        );

        const payload = buildMLExport(products, eventsMap);

        if (format === 'ndjson') {
          const body = toNDJSON(payload);
          return new NextResponse(body, {
            status: 200,
            headers: {
              'Content-Type': 'application/x-ndjson',
              'Content-Disposition': 'attachment; filename="provenance-export.ndjson"',
              'X-Schema-Version': String(ML_EXPORT_SCHEMA_VERSION),
              'X-Record-Count': String(payload.record_count),
            },
          });
        }

        if (format === 'csv') {
          const body = toCSV(payload);
          return new NextResponse(body, {
            status: 200,
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': 'attachment; filename="provenance-export.csv"',
              'X-Schema-Version': String(ML_EXPORT_SCHEMA_VERSION),
              'X-Record-Count': String(payload.record_count),
            },
          });
        }

        // Default: JSON
        return NextResponse.json(payload, {
          status: 200,
          headers: {
            'X-Schema-Version': String(ML_EXPORT_SCHEMA_VERSION),
            'X-Record-Count': String(payload.record_count),
          },
        });
      } catch (err) {
        console.error('[provenance export GET]', err);
        return apiError(ctx.req, 500, ErrorCode.INTERNAL_ERROR, 'Failed to generate export');
      }
    },
  },
);
