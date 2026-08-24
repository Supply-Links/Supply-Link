/**
 * POST /api/v1/insurance/premium – calculate real-time premium quote
 * GET  /api/v1/insurance/premium – list available providers
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { insurancePremiumBodySchema } from '@/lib/api/schemas';
import {
  assessRisk,
  calculatePremium,
  listProviders,
  getProvider,
} from '@/lib/services/insuranceCoverage';

const { GET } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
  },
  {
    GET: async () => {
      const providers = listProviders();
      return NextResponse.json({ providers, total: providers.length }, { status: 200 });
    },
  },
);

const { POST, OPTIONS } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: insurancePremiumBodySchema,
  },
  {
    POST: async (ctx) => {
      const providerConfig = getProvider(ctx.body.provider);
      if (!providerConfig) {
        return apiError(
          ctx.req,
          404,
          ErrorCode.VALIDATION_ERROR,
          `Unknown provider: ${ctx.body.provider}`,
        );
      }

      const risk = assessRisk({
        productId: ctx.body.productId,
        productValue: ctx.body.productValue,
        hasRecallHistory: ctx.body.hasRecallHistory,
        transitRiskScore: ctx.body.transitRiskScore,
        certificationCount: ctx.body.certificationCount,
        storageRiskScore: ctx.body.storageRiskScore,
      });

      const quote = calculatePremium({
        productId: ctx.body.productId,
        provider: ctx.body.provider,
        coverageType: ctx.body.coverageType,
        coverageAmount: ctx.body.coverageAmount,
        currency: ctx.body.currency,
        riskAssessment: risk,
      });

      return NextResponse.json({ quote, riskAssessment: risk }, { status: 200 });
    },
  },
);

export { GET, POST, OPTIONS };
