/**
 * GET /api/v1/proof/[stableId]
 *
 * Returns the on-chain signer proof for a tracking event (#402).
 * External auditors can use this to validate signatures without full app trust.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';

export const { GET, OPTIONS } = defineRoute(
  {
    auth: 'public',
    params: z.object({ stableId: z.string() }),
  },
  {
    GET: async (ctx) => {
      const { stableId } = ctx.params;

      if (!stableId) {
        return NextResponse.json({ error: 'stableId required' }, { status: 400 });
      }

      // In production this would call the Soroban RPC directly.
      // For now we return a stub that documents the expected shape.
      return NextResponse.json({
        stableId,
        note: 'Connect to Soroban RPC to retrieve live proof data.',
        fields: ['event_stable_id', 'signer', 'payload_hash', 'timestamp'],
      });
    },
  },
);
