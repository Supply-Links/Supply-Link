/**
 * GET  /api/v1/contract/pause  — return current pause state
 * POST /api/v1/contract/pause  — set pause state (guardian only)
 */

import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/api/handler';
import { contractPauseBodySchema } from '@/lib/api/schemas';

// In production this would read from / write to the Soroban contract via RPC.
// For now we use a module-level variable as a lightweight stand-in that
// survives the process lifetime (suitable for dev/test; replace with KV or
// contract call in production).
let pauseState = {
  paused: false,
  pausedBy: undefined as string | undefined,
  pausedAt: undefined as number | undefined,
  reason: undefined as string | undefined,
};

export const { GET, POST, OPTIONS } = defineRoute(
  {
    auth: 'public',
    body: contractPauseBodySchema,
  },
  {
    GET: async () => {
      return NextResponse.json(pauseState);
    },
    POST: async (ctx) => {
      // TODO: verify caller is an authorized guardian via Soroban auth check.
      pauseState = {
        paused: ctx.body.paused,
        pausedBy: 'guardian', // replace with verified caller address
        pausedAt: ctx.body.paused ? Math.floor(Date.now() / 1000) : undefined,
        reason: ctx.body.reason,
      };

      return NextResponse.json(pauseState);
    },
  },
);
