/**
 * Tests for GET /api/v1/contract/pause and POST /api/v1/contract/pause
 *
 * Covers the guardian-authorization gap tracked in issue #613: POST must
 * reject callers whose supplied `guardian` address is not a registered
 * upgrade guardian on-chain, even when the API key is valid.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const GUARDIAN = `G${'A'.repeat(55)}`;
const NON_GUARDIAN = `G${'B'.repeat(55)}`;

let guardians: string[] = [GUARDIAN];

vi.mock('@/lib/api/auth', () => ({
  authenticateApiRequest: vi.fn(async (req: NextRequest) => {
    if (req.headers.get('x-api-key') === 'valid-key') return { error: null, apiKey: 'valid-key' };
    const { NextResponse } = await import('next/server');
    return {
      error: NextResponse.json(
        { error: { status: 401, code: 'UNAUTHORIZED', message: 'Invalid', correlationId: 'x' } },
        { status: 401 },
      ),
    };
  }),
}));

vi.mock('@/lib/api/correlation', () => ({
  getCorrelationId: vi.fn(() => 'test-id'),
}));

vi.mock('@/lib/stellar/contract', () => ({
  createContractClient: vi.fn(() => ({
    getUpgradeGuardians: vi.fn(async () => guardians),
  })),
}));

import { GET, POST } from '../route';

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/v1/contract/pause', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'valid-key', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  guardians = [GUARDIAN];
});

describe('POST /api/v1/contract/pause', () => {
  it('returns 401 without a valid API key', async () => {
    const req = makeRequest({ paused: true, guardian: GUARDIAN }, { 'x-api-key': 'wrong' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects a caller whose guardian address is not registered on-chain', async () => {
    const req = makeRequest({ paused: true, guardian: NON_GUARDIAN });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('does not change the pause state when the guardian check fails', async () => {
    const before = await GET();
    const beforeBody = await before.json();

    const req = makeRequest({ paused: true, guardian: NON_GUARDIAN });
    await POST(req);

    const after = await GET();
    const afterBody = await after.json();
    expect(afterBody.paused).toBe(beforeBody.paused);
  });

  it('returns 400 when guardian address is missing', async () => {
    const req = makeRequest({ paused: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts a registered guardian and updates pause state', async () => {
    const req = makeRequest({ paused: true, guardian: GUARDIAN, reason: 'incident response' });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.paused).toBe(true);
    expect(body.pausedBy).toBe(GUARDIAN);
    expect(body.reason).toBe('incident response');
    expect(typeof body.pausedAt).toBe('number');
  });

  it('allows a registered guardian to unpause', async () => {
    await POST(makeRequest({ paused: true, guardian: GUARDIAN }));
    const res = await POST(makeRequest({ paused: false, guardian: GUARDIAN }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.paused).toBe(false);
    expect(body.pausedAt).toBeUndefined();
  });
});
