/**
 * POST /api/v1/attestations  — Add an attestation to a product
 * GET  /api/v1/attestations  — List attestations (by productId or issuerAddress)
 *
 * Authentication: public (GET), auditor tier or higher (POST)
 * Rate limiting: publicRead (GET), default (POST)
 * Idempotency: POST requests via Idempotency-Key header
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { attestationCreateBodySchema, attestationListQuerySchema } from '@/lib/api/schemas';
import {
  addAttestation,
  listAttestationsForProduct,
  listAttestationsByIssuer,
} from '@/lib/attestations';

export const runtime = 'nodejs';

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET is public — no auth required
const { GET } = defineRoute(
  {
    auth: 'public',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
    query: attestationListQuerySchema,
  },
  {
    GET: async (ctx) => {
      // attestationListQuerySchema.refine() guarantees at least one is set.
      const { productId, issuerAddress } = ctx.query;

      const attestations = productId
        ? await listAttestationsForProduct(productId)
        : await listAttestationsByIssuer(issuerAddress!);

      return NextResponse.json({ attestations, total: attestations.length }, { status: 200 });
    },
  },
);

// POST requires auditor auth + idempotency
const { POST, OPTIONS } = defineRoute(
  {
    auth: 'auditor',
    rateLimit: RATE_LIMIT_PRESETS.default,
    idempotent: true,
    body: attestationCreateBodySchema,
  },
  {
    POST: async (ctx) => {
      const record = await addAttestation(ctx.body);
      return NextResponse.json(record, { status: 201 });
    },
  },
);

  recordRequest('GET /api/v1/attestations', response.status, Date.now() - start);
  return response;
}
