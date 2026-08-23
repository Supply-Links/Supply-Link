/**
 * Tests for POST /api/v1/products.
 *
 * Guards against regressing to the mock-array TODO tracked in #613: a
 * registered product must be persisted through `getProductRepository()` so
 * it is immediately visible to subsequent reads (and would flow through the
 * Soroban contract when DATA_SOURCE=contract), not silently dropped.
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api/auth', () => ({
  authenticateApiRequest: async () => ({ error: null, apiKey: 'test-key' }),
}));

vi.mock('@/lib/api/rateLimit', () => ({
  applyRateLimit: () => null,
  RATE_LIMIT_PRESETS: { default: {}, publicRead: {} },
}));

vi.mock('@/lib/api/cors', () => ({
  withCors: (_req: NextRequest, res: NextResponse) => res,
  handleOptions: () => new NextResponse(null, { status: 204 }),
}));

vi.mock('@/lib/api/idempotency', () => ({
  withIdempotency: async (
    request: NextRequest,
    handler: (req: NextRequest, rawBody: string) => Promise<NextResponse>,
  ) => handler(request, await request.text()),
}));

import { GET, POST } from '../route';
import { getProductRepository } from '@/lib/data';

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(url, init);
}

describe('POST /api/v1/products', () => {
  it('persists the new product through the repository layer', async () => {
    const req = makeRequest('POST', 'http://localhost/api/v1/products', {
      name: 'Test Widget',
      origin: 'Kenya',
      owner: `G${'A'.repeat(55)}`,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.name).toBe('Test Widget');

    const stored = await getProductRepository().getById(body.id);
    expect(stored).not.toBeNull();
    expect(stored?.name).toBe('Test Widget');
  });

  it('makes a newly registered product visible via GET', async () => {
    const createReq = makeRequest('POST', 'http://localhost/api/v1/products', {
      name: 'Second Widget',
      origin: 'Ghana',
      owner: `G${'A'.repeat(55)}`,
    });
    const createRes = await POST(createReq);
    const created = await createRes.json();

    const listReq = makeRequest('GET', 'http://localhost/api/v1/products');
    const listRes = await GET(listReq);
    const list = await listRes.json();

    expect(list.items.some((p: { id: string }) => p.id === created.id)).toBe(true);
  });
});
