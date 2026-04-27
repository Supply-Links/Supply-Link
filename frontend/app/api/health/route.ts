import { NextRequest, NextResponse } from 'next/server';
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from '@/lib/stellar/client';
import { version } from '@/package.json';
import { withCors, handleOptions } from '@/lib/api/cors';
import { apiError, withCorrelationId, ErrorCode } from '@/lib/api/errors';

const startedAt = Date.now();

// In-memory rate limiter: max 10 requests per IP per 60 seconds
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return false;
}

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
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (isRateLimited(ip)) {
    return withCors(
      request,
      apiError(request, 429, ErrorCode.RATE_LIMITED, 'Too many requests', { 'Retry-After': '60' }),
    );
  }

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
