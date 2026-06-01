/**
 * GET /api/v1/audit/read-access – query the read access audit log
 *
 * Authentication: x-api-key (internal only — audit logs are sensitive)
 * Supports filtering by productId, actorId, operation, and time range.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';
import { authenticateApiRequest } from '@/lib/api/auth';
import { recordRequest } from '@/lib/api/metrics';
import {
  queryReadAccessLogs,
  getReadAuditStats,
} from '@/lib/services/readAccessAudit';
import type { SensitiveOperation } from '@/lib/services/readAccessAudit';

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  const limited = applyRateLimit(
    request,
    'GET /api/v1/audit/read-access',
    RATE_LIMIT_PRESETS.publicRead,
    RATE_LIMIT_PRESETS.authenticated,
  );
  if (limited) {
    recordRequest('GET /api/v1/audit/read-access', 429, Date.now() - start);
    return limited;
  }

  // Audit logs are internal-only
  const auth = await authenticateApiRequest(request, 'internal');
  if (auth.error) {
    recordRequest('GET /api/v1/audit/read-access', 401, Date.now() - start);
    return auth.error;
  }

  const { searchParams } = request.nextUrl;

  const productId = searchParams.get('productId') ?? undefined;
  const actorId = searchParams.get('actorId') ?? undefined;
  const operation = (searchParams.get('operation') as SensitiveOperation) ?? undefined;
  const fromTimestamp = searchParams.get('from')
    ? parseInt(searchParams.get('from')!, 10)
    : undefined;
  const toTimestamp = searchParams.get('to')
    ? parseInt(searchParams.get('to')!, 10)
    : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

  if (limit > 200) {
    return withCors(
      request,
      apiError(request, 400, ErrorCode.VALIDATION_ERROR, 'limit must be ≤ 200'),
    );
  }

  const result = queryReadAccessLogs({
    productId,
    actorId,
    operation,
    fromTimestamp,
    toTimestamp,
    limit,
    offset,
  });

  const stats = getReadAuditStats();

  recordRequest('GET /api/v1/audit/read-access', 200, Date.now() - start);
  return withCors(
    request,
    withCorrelationId(
      request,
      NextResponse.json(
        {
          logs: result.logs,
          total: result.total,
          limit,
          offset,
          stats,
        },
        { status: 200 },
      ),
    ),
  );
}
