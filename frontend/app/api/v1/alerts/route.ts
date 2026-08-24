/**
 * GET  /api/v1/alerts        – list emergency alerts (optionally filtered by productId)
 * POST /api/v1/alerts        – create a new emergency alert
 *
 * Authentication: x-api-key (partner or internal)
 */

import { NextResponse } from 'next/server';
import { defineRoute, RATE_LIMIT_PRESETS } from '@/lib/api/handler';
import { alertsListQuerySchema, createAlertBodySchema } from '@/lib/api/schemas';
import {
  createAlert,
  listAlerts,
  listActiveAlerts,
  getAlertStats,
} from '@/lib/services/emergencyAlerts';
import type { AlertSeverity, AlertChannel } from '@/lib/services/emergencyAlerts';
import { notifyWebhooksOfProductEvent } from '@/lib/webhooks/processor';

const { GET } = defineRoute(
  {
    auth: 'partner',
    rateLimit: RATE_LIMIT_PRESETS.publicRead,
    query: alertsListQuerySchema,
  },
  {
    GET: async (ctx) => {
      const alerts = ctx.query.active
        ? listActiveAlerts(ctx.query.productId)
        : listAlerts(ctx.query.productId);
      const stats = getAlertStats();

      return NextResponse.json({ alerts, stats, total: alerts.length }, { status: 200 });
    },
  },
);

const { POST, OPTIONS } = defineRoute(
  {
    auth: 'internal',
    rateLimit: RATE_LIMIT_PRESETS.default,
    body: createAlertBodySchema,
  },
  {
    POST: async (ctx) => {
      const alert = createAlert(ctx.body);

      // Fan out to webhook subscribers if webhook channel is enabled
      if (ctx.body.distribution.channels.includes('webhook')) {
        void notifyWebhooksOfProductEvent('product_updated', ctx.body.productId, {
          alertId: alert.id,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
        }).catch((err) => console.error('[alerts] webhook delivery failed:', err));
      }

      return NextResponse.json(alert, { status: 201 });
    },
  },
);

export { GET, POST, OPTIONS };
