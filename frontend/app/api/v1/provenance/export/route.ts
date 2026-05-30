/**
 * GET /api/v1/provenance/export  — AI-ready ML provenance export
 *
 * Query params:
 *   format   json | ndjson | csv  (default: json)
 *   productId  (optional) restrict to a single product
 *
 * closes #481
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';
import { recordRequest } from '@/lib/api/metrics';
import { listProducts, getTrackingEvents } from '@/lib/services/productReadModel';
import { buildMLExport, toNDJSON, toCSV, ML_EXPORT_SCHEMA_VERSION } from '@/lib/ml/export';

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

const VALID_FORMATS = ['json', 'ndjson', 'csv'] as const;
type ExportFormat = (typeof VALID_FORMATS)[number];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  const limited = applyRateLimit(
    request,
    'GET /api/v1/provenance/export',
    RATE_LIMIT_PRESETS.publicRead,
  );
  if (limited) {
    recordRequest('GET /api/v1/provenance/export', 429, Date.now() - start);
    return limited;
  }

  const { searchParams } = request.nextUrl;
  const rawFormat = (searchParams.get('format') ?? 'json').toLowerCase();
  const productIdFilter = searchParams.get('productId') ?? undefined;

  if (!VALID_FORMATS.includes(rawFormat as ExportFormat)) {
    return withCors(
      request,
      apiError(
        request,
        400,
        ErrorCode.VALIDATION_ERROR,
        `format must be one of: ${VALID_FORMATS.join(', ')}`,
      ),
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
      const res = new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Content-Disposition': 'attachment; filename="provenance-export.ndjson"',
          'X-Schema-Version': String(ML_EXPORT_SCHEMA_VERSION),
          'X-Record-Count': String(payload.record_count),
        },
      });
      recordRequest('GET /api/v1/provenance/export', 200, Date.now() - start);
      return withCors(request, res);
    }

    if (format === 'csv') {
      const body = toCSV(payload);
      const res = new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="provenance-export.csv"',
          'X-Schema-Version': String(ML_EXPORT_SCHEMA_VERSION),
          'X-Record-Count': String(payload.record_count),
        },
      });
      recordRequest('GET /api/v1/provenance/export', 200, Date.now() - start);
      return withCors(request, res);
    }

    // Default: JSON
    const res = NextResponse.json(payload, {
      status: 200,
      headers: {
        'X-Schema-Version': String(ML_EXPORT_SCHEMA_VERSION),
        'X-Record-Count': String(payload.record_count),
      },
    });
    recordRequest('GET /api/v1/provenance/export', 200, Date.now() - start);
    return withCors(request, withCorrelationId(request, res));
  } catch (err) {
    console.error('[provenance export GET]', err);
    recordRequest('GET /api/v1/provenance/export', 500, Date.now() - start);
    return withCors(
      request,
      apiError(request, 500, ErrorCode.INTERNAL_ERROR, 'Failed to generate export'),
    );
  }
}
