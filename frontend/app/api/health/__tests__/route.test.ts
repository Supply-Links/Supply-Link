import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the stellar client so tests don't make real network calls
vi.mock('@/lib/stellar/client', () => ({
  CONTRACT_ID: 'CTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  RPC_URL: 'https://soroban-testnet.stellar.org',
}));

// Mock package.json version
vi.mock('@/package.json', () => ({ version: '0.1.0' }));

// Mock fetch to control contractReachable
const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/health');
}

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns status ok with all required fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { GET } = await import('../route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.1.0');
    expect(body.contractId).toBe('CTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE');
    expect(body.network).toBe('Test SDF Network ; September 2015');
    expect(body.rpcUrl).toBe('https://soroban-testnet.stellar.org');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns contractReachable: true when RPC responds ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { GET } = await import('../route');
    const body = await (await GET(makeRequest())).json();

    expect(body.contractReachable).toBe(true);
  });

  it('returns contractReachable: false when RPC fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));

    // Re-import to get fresh module (fetch mock changes)
    vi.resetModules();
    vi.mock('@/lib/stellar/client', () => ({
      CONTRACT_ID: 'CTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
      NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
      RPC_URL: 'https://soroban-testnet.stellar.org',
    }));
    vi.mock('@/package.json', () => ({ version: '0.1.0' }));

    const { GET } = await import('../route');
    const body = await (await GET(makeRequest())).json();

    expect(body.contractReachable).toBe(false);
  });

  it('timestamp is a valid ISO 8601 string', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { GET } = await import('../route');
    const body = await (await GET(makeRequest())).json();

    expect(() => new Date(body.timestamp)).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('uptime is a non-negative integer', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { GET } = await import('../route');
    const body = await (await GET(makeRequest())).json();

    expect(body.uptime).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.uptime)).toBe(true);
  });
});
