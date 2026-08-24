/**
 * GET /api/v1/audit/read-access – query the read access audit log
 *
 * Authentication: x-api-key (internal only — audit logs are sensitive)
 * Supports filtering by productId, actorId, operation, and time range.
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import {
  queryReadAccessLogs,
  getReadAuditStats,
} from '@/lib/services/readAccessAudit';
import type { SensitiveOperation } from '@/lib/services/readAccessAudit';

export const { GET, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
  },
  {
    GET: async (ctx) => {
      const { searchParams } = ctx.req.nextUrl;

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
        return apiError(ctx.req, 400, ErrorCode.VALIDATION_ERROR, 'limit must be ≤ 200');
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

      return NextResponse.json(
        {
          logs: result.logs,
          total: result.total,
          limit,
          offset,
          stats,
        },
        { status: 200 },
      );
    },
  },
);
