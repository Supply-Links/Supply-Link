/**
 * GET  /api/v1/auditors        – list all registered auditors
 * POST /api/v1/auditors        – register a new auditor (admin-only)
 *
 * Authentication: x-api-key (internal for POST, partner for GET)
 * Rate limiting: default tier
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { auditorCreateBodySchema, auditorListQuerySchema } from '@/lib/api/schemas';
import { MOCK_AUDITORS } from '@/lib/mock/auditors';
import { getAuditorRepository } from '@/lib/data';
import type { Auditor, PaginatedResponse } from '@/lib/types';

const { GET } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
    query: auditorListQuerySchema,
  },
  {
    GET: async (ctx) => {
      const { offset, limit, active: activeOnly } = ctx.query;

      const all = await getAuditorRepository().list({ activeOnly });
      const items = all.slice(offset, offset + limit);

      const response: PaginatedResponse<Auditor> = {
        items,
        total: all.length,
        offset,
        limit,
      };

      return NextResponse.json(response, { status: 200 });
    },
  },
);

const { POST, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: auditorCreateBodySchema,
  },
  {
    POST: async (ctx) => {
      // Check for duplicate
      const existing = MOCK_AUDITORS.find((a) => a.address === ctx.body.address);
      if (existing) {
        return apiError(ctx.req, 409, ErrorCode.VALIDATION_ERROR, 'Auditor already registered');
      }

      const newAuditor: Auditor = {
        address: ctx.body.address,
        name: ctx.body.name,
        active: true,
        registeredAt: Math.floor(Date.now() / 1000),
      };

      // TODO: Persist via Soroban contract call: register_auditor(address, name)
      MOCK_AUDITORS.push(newAuditor);

      return NextResponse.json(newAuditor, { status: 201 });
    },
  },
);

export { GET, POST, OPTIONS };
