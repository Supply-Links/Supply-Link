/**
 * GET /api/v1/products/saved-queries – list saved queries for user
 * POST /api/v1/products/saved-queries – save a new query
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { saveQuery, getSavedQueries } from '@/lib/services/searchService';
import { savedQueryBodySchema } from '@/lib/api/schemas';

export const { GET, POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: savedQueryBodySchema,
  },
  {
    GET: async (ctx) => {
      // Extract user ID from auth context (would come from JWT in production)
      const userId = ctx.req.headers.get('x-user-id') || 'default-user';
      const queries = getSavedQueries(userId);

      return NextResponse.json({ queries }, { status: 200 });
    },
    POST: async (ctx) => {
      const userId = ctx.req.headers.get('x-user-id') || 'default-user';
      const saved = saveQuery(userId, ctx.body.name, ctx.body.query);
      return NextResponse.json(saved, { status: 201 });
    },
  },
);
