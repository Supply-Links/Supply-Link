/**
 * GET    /api/v1/alerts/[id]              – get a single alert
 * PATCH  /api/v1/alerts/[id]              – acknowledge or resolve an alert
 * DELETE /api/v1/alerts/[id]              – cancel an alert
 *
 * Authentication: x-api-key (partner or internal)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { alertPatchBodySchema } from '@/lib/api/schemas';
import {
  getAlert,
  acknowledgeAlert,
  resolveAlert,
  cancelAlert,
} from '@/lib/services/emergencyAlerts';

const paramsSchema = z.object({ id: z.string() });

const { GET } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
    params: paramsSchema,
  },
  {
    GET: async (ctx) => {
      const alert = getAlert(ctx.params.id);

      if (!alert) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, `Alert not found: ${ctx.params.id}`);
      }

      return NextResponse.json(alert, { status: 200 });
    },
  },
);

const { PATCH } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.default,
    params: paramsSchema,
    body: alertPatchBodySchema,
  },
  {
    PATCH: async (ctx) => {
      let updated;
      if (ctx.body.action === 'acknowledge') {
        updated = acknowledgeAlert(ctx.params.id, ctx.body.acknowledgedBy ?? 'unknown');
      } else {
        updated = resolveAlert(ctx.params.id);
      }

      if (!updated) {
        return apiError(
          ctx.req,
          404,
          ErrorCode.VALIDATION_ERROR,
          `Alert not found or already resolved: ${ctx.params.id}`,
        );
      }

      return NextResponse.json(updated, { status: 200 });
    },
  },
);

const { DELETE, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.default,
    params: paramsSchema,
  },
  {
    DELETE: async (ctx) => {
      const cancelled = cancelAlert(ctx.params.id);

      if (!cancelled) {
        return apiError(ctx.req, 404, ErrorCode.VALIDATION_ERROR, `Alert not found: ${ctx.params.id}`);
      }

      return NextResponse.json({ ok: true, id: ctx.params.id }, { status: 200 });
    },
  },
);

export { GET, PATCH, DELETE, OPTIONS };
