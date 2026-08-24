/**
 * POST /api/v1/certification-registry/records  — Issue a registry record
 * GET  /api/v1/certification-registry/records  — List records for a product
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import {
  certificationRecordCreateBodySchema,
  certificationRecordsListQuerySchema,
} from '@/lib/api/schemas';
import { kvStore } from '@/lib/kv';
import type { CertificationIssuer, CertificationRegistryRecord } from '@/lib/types';

export const runtime = 'nodejs';

const TTL = 10 * 365 * 24 * 60 * 60;

function recordsKey(productId: string): string {
  return `cert-registry:records:${productId}`;
}

function issuerKey(address: string): string {
  return `cert-registry:issuer:${address}`;
}

async function getRecords(productId: string): Promise<CertificationRegistryRecord[]> {
  const raw = await kvStore.get(recordsKey(productId));
  return raw ? (JSON.parse(raw) as CertificationRegistryRecord[]) : [];
}

const { GET } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    query: certificationRecordsListQuerySchema,
  },
  {
    GET: async (ctx) => {
      const records = await getRecords(ctx.query.productId);
      return NextResponse.json(records, { status: 200 });
    },
  },
);

const { POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: certificationRecordCreateBodySchema,
  },
  {
    POST: async (ctx) => {
      const { productId, issuerAddress, recordId, externalCertId, certType, documentHash } =
        ctx.body;

      // Validate issuer exists and is active
      const issuerRaw = await kvStore.get(issuerKey(issuerAddress));
      if (!issuerRaw) {
        return apiError(ctx.req, 404, ErrorCode.NOT_FOUND, 'Issuer not registered');
      }
      const issuer = JSON.parse(issuerRaw) as CertificationIssuer;
      if (!issuer.active) {
        return apiError(ctx.req, 400, ErrorCode.VALIDATION_ERROR, 'Issuer is not active');
      }
      if (!issuer.certTypes.includes(certType)) {
        return apiError(
          ctx.req,
          400,
          ErrorCode.VALIDATION_ERROR,
          `cert_type '${certType}' not supported by issuer`,
        );
      }

      // Check for duplicate record ID
      const existing = await getRecords(productId);
      if (existing.some((r) => r.id === recordId)) {
        return apiError(
          ctx.req,
          409,
          ErrorCode.CONFLICT,
          `Record with id '${recordId}' already exists`,
        );
      }

      const record: CertificationRegistryRecord = {
        id: recordId,
        productId,
        issuerAddress,
        externalCertId,
        certType,
        documentHash,
        issuedAt: Date.now(),
        revoked: false,
        revokedAt: 0,
      };

      existing.push(record);
      await kvStore.set(recordsKey(productId), JSON.stringify(existing), TTL);

      return NextResponse.json(record, { status: 201 });
    },
  },
);

export { GET, POST, OPTIONS };
