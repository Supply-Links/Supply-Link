/**
 * Tests for provenance proof generation and verification (#477).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  generateProvenanceProof,
  verifyProvenanceProof,
  encodeProof,
  decodeProof,
  PROOF_SCHEMA_VERSION,
} from '@/lib/provenance/proofs';
import type { TrackingEvent } from '@/lib/types';

vi.mock('@/lib/api/cors', () => ({
  withCors: (_req: NextRequest, res: Response) => res,
  handleOptions: () => new Response(null, { status: 204 }),
}));
vi.mock('@/lib/api/rateLimit', () => ({
  applyRateLimit: vi.fn(() => null),
  RATE_LIMIT_PRESETS: { publicRead: {}, default: {} },
}));
vi.mock('@/lib/api/metrics', () => ({ recordRequest: vi.fn() }));
vi.mock('@/lib/services/productReadModel', () => ({
  getTrackingEvents: vi.fn(async () => SAMPLE_EVENTS),
}));
vi.mock('@/lib/stellar/contract', () => ({
  contractClient: { getProvenanceRoot: vi.fn(async () => new Uint8Array(32)) },
}));

const SAMPLE_EVENTS: TrackingEvent[] = [
  {
    productId: 'prod-test',
    eventType: 'HARVEST',
    location: 'Farm A',
    actor: 'GACTOR1',
    timestamp: 1000,
    metadata: '{}',
  },
  {
    productId: 'prod-test',
    eventType: 'SHIPPING',
    location: 'Port B',
    actor: 'GACTOR2',
    timestamp: 2000,
    metadata: '{}',
  },
];

describe('generateProvenanceProof', () => {
  it('produces a proof with correct structure', async () => {
    const proof = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, 'abc123');
    expect(proof.version).toBe(PROOF_SCHEMA_VERSION);
    expect(proof.productId).toBe('prod-test');
    expect(proof.provenanceRoot).toBe('abc123');
    expect(proof.eventHashes).toHaveLength(2);
    expect(proof.chainHash).toBeTruthy();
    expect(proof.signature).toBeTruthy();
    expect(proof.eventCount).toBe(2);
  });

  it('produces deterministic hashes for the same events', async () => {
    const p1 = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, 'root');
    const p2 = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, 'root');
    expect(p1.chainHash).toBe(p2.chainHash);
    expect(p1.eventHashes).toEqual(p2.eventHashes);
  });

  it('produces different chain hashes for different event orders', async () => {
    const reversed = [...SAMPLE_EVENTS].reverse();
    const p1 = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, 'root');
    const p2 = await generateProvenanceProof('prod-test', reversed, 'root');
    expect(p1.chainHash).not.toBe(p2.chainHash);
  });
});

describe('verifyProvenanceProof', () => {
  it('returns valid=true for a correct proof', async () => {
    const proof = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, 'root-abc');
    const result = await verifyProvenanceProof(proof, SAMPLE_EVENTS, 'root-abc');
    expect(result.valid).toBe(true);
    expect(result.chainIntact).toBe(true);
    expect(result.rootMatch).toBe(true);
    expect(result.signatureValid).toBe(true);
  });

  it('detects tampered event data', async () => {
    const proof = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, 'root-abc');
    const tampered: TrackingEvent[] = [
      { ...SAMPLE_EVENTS[0], location: 'TAMPERED' },
      SAMPLE_EVENTS[1],
    ];
    const result = await verifyProvenanceProof(proof, tampered, 'root-abc');
    expect(result.valid).toBe(false);
    expect(result.chainIntact).toBe(false);
  });

  it('detects on-chain root mismatch', async () => {
    const proof = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, 'root-abc');
    const result = await verifyProvenanceProof(proof, SAMPLE_EVENTS, 'different-root');
    expect(result.valid).toBe(false);
    expect(result.rootMatch).toBe(false);
  });
});

describe('encodeProof / decodeProof', () => {
  it('round-trips a proof through base64', async () => {
    const proof = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, 'root');
    const encoded = encodeProof(proof);
    const decoded = decodeProof(encoded);
    expect(decoded).toEqual(proof);
  });

  it('returns null for invalid base64', () => {
    expect(decodeProof('!!!not-base64!!!')).toBeNull();
  });
});

describe('GET /api/v1/provenance/[productId]/proof', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a proof for a valid product', async () => {
    const { GET } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/prod-test/proof');
    const res = await GET(req, { params: Promise.resolve({ productId: 'prod-test' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.proof.productId).toBe('prod-test');
    expect(body.proof.eventHashes).toHaveLength(2);
  });
});

describe('POST /api/v1/provenance/[productId]/proof', () => {
  beforeEach(() => vi.clearAllMocks());

  it('verifies a valid encoded proof', async () => {
    const proof = await generateProvenanceProof('prod-test', SAMPLE_EVENTS, '0'.repeat(64));
    const encoded = encodeProof(proof);

    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/prod-test/proof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ encodedProof: encoded }),
    });
    const res = await POST(req, { params: Promise.resolve({ productId: 'prod-test' }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.result).toBeDefined();
  });

  it('rejects missing encodedProof', async () => {
    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/prod-test/proof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ productId: 'prod-test' }) });
    expect(res.status).toBe(400);
  });

  it('rejects productId mismatch', async () => {
    const proof = await generateProvenanceProof('other-product', SAMPLE_EVENTS, '');
    const encoded = encodeProof(proof);

    const { POST } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/prod-test/proof', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ encodedProof: encoded }),
    });
    const res = await POST(req, { params: Promise.resolve({ productId: 'prod-test' }) });
    expect(res.status).toBe(400);
  });
});
