/**
 * GET  /api/v1/contract/pause  — return current pause state
 * POST /api/v1/contract/pause  — set pause state (guardian only)
 *
 * Authentication: x-api-key (internal) plus an on-chain guardian check —
 * the caller must additionally supply the Stellar address of a registered
 * upgrade guardian (see `register_upgrade_guardian` in the Soroban
 * contract), and that address is verified against the contract's guardian
 * registry before the pause state is changed. This closes the gap tracked
 * in issue #613: previously any caller with a valid API key could flip the
 * pause switch with no on-chain authorization check at all.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiError, ErrorCode } from '@/lib/api/errors';
import { authenticateApiRequest } from '@/lib/api/auth';
import { contractPauseBodySchema } from '@/lib/api/schemas';
import { handleValidationError, parseJsonBody } from '@/lib/api/validation';
import { createContractClient } from '@/lib/stellar/contract';

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

export async function GET() {
  return NextResponse.json(pauseState);
}

async function isAuthorizedGuardian(guardian: string): Promise<boolean> {
  const guardians = await createContractClient().getUpgradeGuardians();
  return guardians.includes(guardian);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request, 'internal');
  if (auth.error) {
    return auth.error;
  }

  try {
    const body = parseJsonBody(request, await request.text(), contractPauseBodySchema);

    const isGuardian = await isAuthorizedGuardian(body.guardian);
    if (!isGuardian) {
      return apiError(
        request,
        403,
        ErrorCode.FORBIDDEN,
        `Address is not an authorized guardian: ${body.guardian}`,
      );
    }

    pauseState = {
      paused: body.paused,
      pausedBy: body.guardian,
      pausedAt: body.paused ? Math.floor(Date.now() / 1000) : undefined,
      reason: body.reason,
    };

    return NextResponse.json(pauseState);
  } catch (error) {
    return (
      handleValidationError(request, error) ??
      apiError(request, 500, ErrorCode.INTERNAL_ERROR, 'Failed to update pause state')
    );
  }
}
