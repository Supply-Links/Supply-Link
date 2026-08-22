/**
 * POST /api/v1/certification-registry/issuers  — Register a certification issuer
 * GET  /api/v1/certification-registry/issuers  — List all registered issuers
 *
 * Authentication: x-api-key (partner or internal)
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { certificationIssuerCreateBodySchema } from '@/lib/api/schemas';
import { kvStore } from '@/lib/kv';
import type { CertificationIssuer } from '@/lib/types';

export const runtime = 'nodejs';

const TTL = 10 * 365 * 24 * 60 * 60;

function issuerKey(address: string): string {
  return `cert-registry:issuer:${address}`;
}

const ISSUERS_INDEX_KEY = 'cert-registry:issuers:index';

async function getIssuerIndex(): Promise<string[]> {
  const raw = await kvStore.get(ISSUERS_INDEX_KEY);
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export const { GET, POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: certificationIssuerCreateBodySchema,
  },
  {
    GET: async () => {
      const index = await getIssuerIndex();
      const issuers: CertificationIssuer[] = [];

      for (const addr of index) {
        const raw = await kvStore.get(issuerKey(addr));
        if (raw) issuers.push(JSON.parse(raw) as CertificationIssuer);
      }

      return NextResponse.json(issuers, { status: 200 });
    },
    POST: async (ctx) => {
      const { issuerAddress, name, certTypes } = ctx.body;

      // Check for duplicate active registration
      const existing = await kvStore.get(issuerKey(issuerAddress));
      if (existing) {
        const iss = JSON.parse(existing) as CertificationIssuer;
        if (iss.active) {
          return apiError(ctx.req, 409, ErrorCode.CONFLICT, 'Issuer already registered');
        }
      }

      const issuer: CertificationIssuer = {
        issuerAddress,
        name,
        certTypes,
        registeredAt: Date.now(),
        active: true,
      };

      await kvStore.set(issuerKey(issuerAddress), JSON.stringify(issuer), TTL);

      // Update index
      const index = await getIssuerIndex();
      if (!index.includes(issuerAddress)) {
        index.push(issuerAddress);
        await kvStore.set(ISSUERS_INDEX_KEY, JSON.stringify(index), TTL);
      }

      return NextResponse.json(issuer, { status: 201 });
    },
  },
);
