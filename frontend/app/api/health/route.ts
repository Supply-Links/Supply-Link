import { NextRequest, NextResponse } from 'next/server';
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from '@/lib/stellar/client';
import { version } from '@/package.json';
import { withCors, handleOptions } from '@/lib/api/cors';
import { withCorrelationId } from '@/lib/api/errors';
import { applyRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api/rateLimit';

const startedAt = Date.now();

async function pingRpc(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function OPTIONS(request: NextRequest) {
  return handleOptions(request);
}

export async function GET(request: NextRequest) {
  const limited = applyRateLimit(request, 'health', RATE_LIMIT_PRESETS.health);
  if (limited) return limited;

  const contractReachable = await pingRpc(RPC_URL);

  return withCors(
    request,
    withCorrelationId(
      request,
      NextResponse.json({
        status: 'ok',
        version,
        network: NETWORK_PASSPHRASE,
        contractId: CONTRACT_ID,
        rpcUrl: RPC_URL,
        contractReachable,
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
      }),
    ),
  );
}
