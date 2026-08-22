/**
 * GET /api/v1/snapshots/[productId]
 *
 * Returns the audit snapshot history for a product (#400).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';

export const { GET, OPTIONS } = defineRoute(
  {
    auth: 'public',
    params: z.object({ productId: z.string() }),
  },
  {
    GET: async (ctx) => {
      const { productId } = ctx.params;

      if (!productId) {
        return NextResponse.json({ error: 'productId required' }, { status: 400 });
      }

      // In production this calls get_snapshots via Soroban RPC.
      return NextResponse.json({
        productId,
        snapshots: [],
        note: 'Connect to Soroban RPC to retrieve live snapshot data.',
      });
    },
  },
);
