/**
 * Tests for AI-ready ML provenance export (#481).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { Product, TrackingEvent } from '@/lib/types';
import { buildMLExport, toNDJSON, toCSV, ML_EXPORT_SCHEMA_VERSION } from '@/lib/ml/export';

vi.mock('@/lib/api/cors', () => ({
  withCors: (_req: NextRequest, res: Response) => res,
  handleOptions: () => new Response(null, { status: 204 }),
}));
vi.mock('@/lib/api/rateLimit', () => ({
  applyRateLimit: vi.fn(() => null),
  RATE_LIMIT_PRESETS: { publicRead: {} },
}));
vi.mock('@/lib/api/metrics', () => ({ recordRequest: vi.fn() }));

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'prod-ml-1',
    name: 'Coffee Beans',
    origin: 'Ethiopia',
    owner: 'GOWNER1',
    timestamp: 1_000_000,
    active: true,
    authorizedActors: [],
    recalled: false,
  },
];

const SAMPLE_EVENTS: TrackingEvent[] = [
  {
    productId: 'prod-ml-1',
    eventType: 'HARVEST',
    location: 'Farm A',
    actor: 'GACTOR1',
    timestamp: 1_001_000,
    metadata: '{}',
  },
  {
    productId: 'prod-ml-1',
    eventType: 'SHIPPING',
    location: 'Port B',
    actor: 'GACTOR2',
    timestamp: 1_002_000,
    metadata: '{}',
  },
];

vi.mock('@/lib/services/productReadModel', () => ({
  listProducts: vi.fn(async () => SAMPLE_PRODUCTS),
  getTrackingEvents: vi.fn(async () => SAMPLE_EVENTS),
}));

beforeEach(() => vi.clearAllMocks());

// ── buildMLExport unit tests ──────────────────────────────────────────────────

describe('buildMLExport', () => {
  it('produces one record per event', () => {
    const eventsMap = new Map([['prod-ml-1', SAMPLE_EVENTS]]);
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    expect(payload.record_count).toBe(2);
    expect(payload.product_count).toBe(1);
    expect(payload.schema_version).toBe(ML_EXPORT_SCHEMA_VERSION);
  });

  it('normalizes event_type to lowercase', () => {
    const eventsMap = new Map([['prod-ml-1', SAMPLE_EVENTS]]);
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    expect(payload.records[0].event_type).toBe('harvest');
    expect(payload.records[1].event_type).toBe('shipping');
  });

  it('sets seconds_since_prev_event correctly', () => {
    const eventsMap = new Map([['prod-ml-1', SAMPLE_EVENTS]]);
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    expect(payload.records[0].seconds_since_prev_event).toBeNull();
    expect(payload.records[1].seconds_since_prev_event).toBe(1); // 1000ms = 1s
  });

  it('tracks unique_actors_so_far', () => {
    const eventsMap = new Map([['prod-ml-1', SAMPLE_EVENTS]]);
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    expect(payload.records[0].unique_actors_so_far).toBe(1);
    expect(payload.records[1].unique_actors_so_far).toBe(2);
  });

  it('sets actor_is_owner correctly', () => {
    const eventsMap = new Map([['prod-ml-1', SAMPLE_EVENTS]]);
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    // GACTOR1 is not the owner (GOWNER1)
    expect(payload.records[0].actor_is_owner).toBe(false);
  });

  it('handles products with no events', () => {
    const eventsMap = new Map<string, TrackingEvent[]>();
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    expect(payload.record_count).toBe(0);
    expect(payload.product_count).toBe(1);
  });

  it('sorts events by timestamp ascending', () => {
    const reversed = [...SAMPLE_EVENTS].reverse();
    const eventsMap = new Map([['prod-ml-1', reversed]]);
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    expect(payload.records[0].event_type).toBe('harvest');
    expect(payload.records[1].event_type).toBe('shipping');
  });
});

// ── toNDJSON ──────────────────────────────────────────────────────────────────

describe('toNDJSON', () => {
  it('produces one JSON object per line', () => {
    const eventsMap = new Map([['prod-ml-1', SAMPLE_EVENTS]]);
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    const ndjson = toNDJSON(payload);
    const lines = ndjson.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  it('returns empty string for empty payload', () => {
    const payload = buildMLExport([], new Map());
    expect(toNDJSON(payload)).toBe('');
  });
});

// ── toCSV ─────────────────────────────────────────────────────────────────────

describe('toCSV', () => {
  it('produces a header row plus data rows', () => {
    const eventsMap = new Map([['prod-ml-1', SAMPLE_EVENTS]]);
    const payload = buildMLExport(SAMPLE_PRODUCTS, eventsMap);
    const csv = toCSV(payload);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('product_id');
    expect(lines[0]).toContain('event_type');
    expect(lines).toHaveLength(3); // header + 2 data rows
  });

  it('returns empty string for empty payload', () => {
    const payload = buildMLExport([], new Map());
    expect(toCSV(payload)).toBe('');
  });
});

// ── GET /api/v1/provenance/export ─────────────────────────────────────────────

describe('GET /api/v1/provenance/export', () => {
  it('returns JSON export by default', async () => {
    const { GET } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/export');
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.schema_version).toBe(ML_EXPORT_SCHEMA_VERSION);
    expect(body.records).toBeDefined();
    expect(Array.isArray(body.records)).toBe(true);
  });

  it('returns NDJSON when format=ndjson', async () => {
    const { GET } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/export?format=ndjson');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('ndjson');
    const text = await res.text();
    expect(text.split('\n').filter(Boolean).length).toBeGreaterThanOrEqual(0);
  });

  it('returns CSV when format=csv', async () => {
    const { GET } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/export?format=csv');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
  });

  it('returns 400 for unknown format', async () => {
    const { GET } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/export?format=xml');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('sets X-Schema-Version and X-Record-Count headers', async () => {
    const { GET } = await import('../route');
    const req = new NextRequest('http://localhost/api/v1/provenance/export');
    const res = await GET(req);
    expect(res.headers.get('x-schema-version')).toBe(String(ML_EXPORT_SCHEMA_VERSION));
    expect(res.headers.get('x-record-count')).toBeDefined();
  });
});
