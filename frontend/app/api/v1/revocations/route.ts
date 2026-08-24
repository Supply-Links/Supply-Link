/**
 * GET  /api/v1/revocations        – list revocations (filter by productId, type)
 * POST /api/v1/revocations        – record a new revocation
 *
 * Authentication: x-api-key (partner or internal)
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import {
  revokeCredential,
  listRevocations,
  checkRevocation,
  getRevocationStats,
} from '@/lib/services/revocationRegistry';
import type { RevocationType } from '@/lib/services/revocationRegistry';
import { revocationBodySchema } from '@/lib/api/schemas';

const { GET } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
  },
  {
    GET: async (ctx) => {
      const { searchParams } = ctx.req.nextUrl;
      const productId = searchParams.get('productId') ?? undefined;
      const type = (searchParams.get('type') as RevocationType) ?? undefined;
      const checkId = searchParams.get('check');

      // Single-credential check mode
      if (checkId) {
        const result = checkRevocation(checkId);
        return NextResponse.json(result, { status: 200 });
      }

      const revocations = listRevocations({ productId, type });
      const stats = getRevocationStats();

      return NextResponse.json({ revocations, stats, total: revocations.length }, { status: 200 });
    },
  },
);

const { POST, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: revocationBodySchema,
  },
  {
    POST: async (ctx) => {
      const entry = revokeCredential(ctx.body);
      return NextResponse.json(entry, { status: 201 });
    },
  },
);

export { GET, POST, OPTIONS };
