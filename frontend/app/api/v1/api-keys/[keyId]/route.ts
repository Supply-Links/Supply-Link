/**
 * GET    /api/v1/api-keys/[keyId]  — Get key details + usage metrics
 * DELETE /api/v1/api-keys/[keyId]  — Revoke a key
 *
 * Authentication: internal tier API key required
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { getApiKeyRecord, revokeApiKey, getApiKeyUsage } from '@/lib/api/apiKeyRegistry';

export const runtime = 'nodejs';

export const { GET, DELETE, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.default,
    params: z.object({ keyId: z.string() }),
  },
  {
    GET: async (ctx) => {
      const { keyId } = ctx.params;

      const record = await getApiKeyRecord(keyId);
      if (!record) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, 'API key not found');
      }

      const usage = await getApiKeyUsage(keyId);

      return NextResponse.json(
        {
          keyId: record.keyId,
          name: record.name,
          tier: record.tier,
          owner: record.owner,
          description: record.description,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          revoked: record.revoked,
          revokedAt: record.revokedAt,
          usage: usage
            ? {
                totalRequests: usage.totalRequests,
                windowRequests: usage.windowRequests,
                lastUsedAt: usage.lastUsedAt,
                endpointCounts: usage.endpointCounts,
              }
            : null,
        },
        { status: 200 },
      );
    },
    DELETE: async (ctx) => {
      const { keyId } = ctx.params;

      const record = await getApiKeyRecord(keyId);
      if (!record) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, 'API key not found');
      }

      await revokeApiKey(keyId);

      return NextResponse.json(
        { keyId, revoked: true, revokedAt: Date.now(), message: 'API key revoked successfully' },
        { status: 200 },
      );
    },
  },
);
