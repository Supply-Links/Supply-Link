/**
 * POST /api/v1/api-keys   — Issue a new API key
 * GET  /api/v1/api-keys   — List all API keys (admin only)
 *
 * Authentication: internal tier API key required (x-api-key header)
 * Rate limiting: default preset
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiKeyIssueBodySchema } from '@/lib/api/schemas';
import {
  issueApiKey,
  listApiKeys,
  getApiKeyUsage,
  type ApiKeyTier,
} from '@/lib/api/apiKeyRegistry';

export const runtime = 'nodejs';

export const { GET, POST, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: apiKeyIssueBodySchema,
    idempotent: true,
  },
  {
    GET: async () => {
      const records = await listApiKeys();

      // Attach usage metrics to each record
      const keysWithUsage = await Promise.all(
        records.map(async (record) => {
          const usage = await getApiKeyUsage(record.keyId);
          return {
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
          };
        }),
      );

      return NextResponse.json({ keys: keysWithUsage, total: keysWithUsage.length }, { status: 200 });
    },
    POST: async (ctx) => {
      const { name, tier, owner, description, expiresInDays } = ctx.body;

      const { record, plaintext } = await issueApiKey({
        name,
        tier: tier as ApiKeyTier,
        owner,
        description,
        expiresInDays,
      });

      // Return the plaintext key ONCE — it cannot be retrieved again
      return NextResponse.json(
        {
          keyId: record.keyId,
          key: plaintext,
          name: record.name,
          tier: record.tier,
          owner: record.owner,
          description: record.description,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          message: 'Store this key securely — it will not be shown again.',
        },
        { status: 201 },
      );
    },
  },
);
