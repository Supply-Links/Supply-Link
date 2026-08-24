/**
 * POST /api/v1/regulator/certifications  — issue a regulator certification
 * GET  /api/v1/regulator/certifications  — list certifications (filter by productId or issuer)
 *
 * closes #482
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { regulatorCertificationBodySchema } from '@/lib/api/schemas';
import {
  issueCertification,
  listCertifications,
  listByIssuer,
  effectiveStatus,
} from '@/lib/regulator/certifications';

const { GET } = defineRoute(
  {
    auth: 'public',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
  },
  {
    GET: async (ctx) => {
      const { searchParams } = ctx.req.nextUrl;
      const productId = searchParams.get('productId') ?? undefined;
      const issuer = searchParams.get('issuer') ?? undefined;

      const certs = issuer ? listByIssuer(issuer) : listCertifications(productId);

      // Resolve effective status for each cert
      const enriched = certs.map((c) => ({ ...c, effectiveStatus: effectiveStatus(c) }));

      return NextResponse.json(
        { certifications: enriched, total: enriched.length },
        { status: 200 },
      );
    },
  },
);

const { POST, OPTIONS } = defineRoute(
  {
    auth: 'public',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: regulatorCertificationBodySchema,
  },
  {
    POST: async (ctx) => {
      const { productId, productName, issuerAddress, issuerAuthority, certType, scope, validityDays } =
        ctx.body;

      const cert = issueCertification({
        productId,
        productName,
        issuerAddress,
        issuerAuthority,
        certType,
        scope,
        validityDays,
      });

      console.log('[regulator cert] issued', { id: cert.id, productId, issuerAuthority });

      return NextResponse.json({ certification: cert }, { status: 201 });
    },
  },
);

export { GET, POST, OPTIONS };
