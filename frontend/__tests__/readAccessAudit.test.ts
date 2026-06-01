/**
 * Tests for Read Access Audit Logging (Feature D).
 */
import { describe, it, expect } from 'vitest';
import {
  recordReadAccess,
  queryReadAccessLogs,
  getReadAccessLog,
  getProductAccessHistory,
  getReadAuditStats,
  truncateAddress,
  actorFromWallet,
  actorFromApiKey,
  anonymousActor,
} from '@/lib/services/readAccessAudit';
import type { SensitiveOperation } from '@/lib/services/readAccessAudit';

// ── Helpers ───────────────────────────────────────────────────────────────────

let counter = 0;
function uniquePid() {
  return `prod-audit-${Date.now()}-${++counter}`;
}

function log(
  operation: SensitiveOperation = 'product.verify',
  productId = uniquePid(),
  status = 200,
) {
  return recordReadAccess({
    operation,
    productIds: [productId],
    actor: anonymousActor(),
    requestPath: `/verify/${productId}`,
    responseStatus: status,
    correlationId: `corr-${Date.now()}`,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Read Access Audit — recordReadAccess', () => {
  it('creates a log entry with correct fields', () => {
    const pid = uniquePid();
    const entry = recordReadAccess({
      operation: 'product.verify',
      productIds: [pid],
      actor: anonymousActor(),
      requestPath: `/verify/${pid}`,
      responseStatus: 200,
    });

    expect(entry.id).toMatch(/^ral-/);
    expect(entry.operation).toBe('product.verify');
    expect(entry.productIds).toContain(pid);
    expect(entry.responseStatus).toBe(200);
    expect(entry.timestamp).toBeTypeOf('number');
  });

  it('stores the entry and retrieves it by ID', () => {
    const entry = log();
    const fetched = getReadAccessLog(entry.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(entry.id);
  });

  it('returns null for unknown log ID', () => {
    expect(getReadAccessLog('nonexistent')).toBeNull();
  });

  it('supports all sensitive operations', () => {
    const ops: SensitiveOperation[] = [
      'product.read',
      'product.verify',
      'certification.read',
      'attestation.read',
      'private_metadata.read',
      'insurance.read',
      'revocation.read',
    ];
    for (const op of ops) {
      const entry = log(op);
      expect(entry.operation).toBe(op);
    }
  });
});

describe('Read Access Audit — queryReadAccessLogs', () => {
  it('returns all logs when no filters applied', () => {
    log();
    const result = queryReadAccessLogs({ limit: 200 });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.logs.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by productId', () => {
    const pid = uniquePid();
    log('product.verify', pid);
    log('product.verify', pid);
    const result = queryReadAccessLogs({ productId: pid });
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.logs.every((l) => l.productIds.includes(pid))).toBe(true);
  });

  it('filters by operation', () => {
    const pid = uniquePid();
    log('product.verify', pid);
    log('certification.read', pid);
    const result = queryReadAccessLogs({ productId: pid, operation: 'product.verify' });
    expect(result.logs.every((l) => l.operation === 'product.verify')).toBe(true);
  });

  it('filters by actorId', () => {
    const pid = uniquePid();
    recordReadAccess({
      operation: 'product.read',
      productIds: [pid],
      actor: { id: 'GSPECIFIC123', type: 'wallet' },
      requestPath: `/products/${pid}`,
      responseStatus: 200,
    });
    const result = queryReadAccessLogs({ actorId: 'GSPECIFIC123' });
    expect(result.logs.every((l) => l.actor.id === 'GSPECIFIC123')).toBe(true);
  });

  it('filters by time range', () => {
    const before = Date.now() - 1;
    const pid = uniquePid();
    log('product.verify', pid);
    const after = Date.now() + 1;

    const result = queryReadAccessLogs({
      productId: pid,
      fromTimestamp: before,
      toTimestamp: after,
    });
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('returns results sorted newest-first', () => {
    const pid = uniquePid();
    log('product.verify', pid);
    log('product.verify', pid);
    const result = queryReadAccessLogs({ productId: pid });
    for (let i = 1; i < result.logs.length; i++) {
      expect(result.logs[i - 1].timestamp).toBeGreaterThanOrEqual(result.logs[i].timestamp);
    }
  });

  it('respects limit and offset', () => {
    const pid = uniquePid();
    for (let i = 0; i < 5; i++) log('product.verify', pid);
    const page1 = queryReadAccessLogs({ productId: pid, limit: 2, offset: 0 });
    const page2 = queryReadAccessLogs({ productId: pid, limit: 2, offset: 2 });
    expect(page1.logs).toHaveLength(2);
    expect(page2.logs.length).toBeGreaterThanOrEqual(1);
    expect(page1.logs[0].id).not.toBe(page2.logs[0].id);
  });
});

describe('Read Access Audit — getProductAccessHistory', () => {
  it('returns all logs for a product sorted newest-first', () => {
    const pid = uniquePid();
    log('product.verify', pid);
    log('certification.read', pid);
    const history = getProductAccessHistory(pid);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.every((l) => l.productIds.includes(pid))).toBe(true);
    for (let i = 1; i < history.length; i++) {
      expect(history[i - 1].timestamp).toBeGreaterThanOrEqual(history[i].timestamp);
    }
  });

  it('returns empty array for product with no logs', () => {
    expect(getProductAccessHistory('no-logs-product')).toHaveLength(0);
  });
});

describe('Read Access Audit — getReadAuditStats', () => {
  it('returns numeric stats', () => {
    log();
    const stats = getReadAuditStats();
    expect(stats.totalLogs).toBeTypeOf('number');
    expect(stats.uniqueProducts).toBeTypeOf('number');
    expect(stats.uniqueActors).toBeTypeOf('number');
    expect(stats.operationBreakdown).toBeTypeOf('object');
  });

  it('increments totalLogs after recording', () => {
    const before = getReadAuditStats().totalLogs;
    log();
    const after = getReadAuditStats().totalLogs;
    expect(after).toBe(before + 1);
  });

  it('operationBreakdown counts per operation', () => {
    const pid = uniquePid();
    log('product.verify', pid);
    log('product.verify', pid);
    const stats = getReadAuditStats();
    expect(stats.operationBreakdown['product.verify']).toBeGreaterThanOrEqual(2);
  });
});

describe('Read Access Audit — privacy helpers', () => {
  it('truncateAddress shortens long addresses', () => {
    const addr = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const truncated = truncateAddress(addr);
    expect(truncated).toContain('...');
    expect(truncated.length).toBeLessThan(addr.length);
  });

  it('truncateAddress returns short addresses unchanged', () => {
    const short = 'GABC';
    expect(truncateAddress(short)).toBe(short);
  });

  it('actorFromWallet creates wallet actor with truncated ID', () => {
    const actor = actorFromWallet('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
    expect(actor.type).toBe('wallet');
    expect(actor.id).toContain('...');
  });

  it('actorFromApiKey creates api_key actor with truncated ID', () => {
    const actor = actorFromApiKey('sk_live_abcdefghijklmnop');
    expect(actor.type).toBe('api_key');
    expect(actor.id).toContain('...');
  });

  it('anonymousActor creates anonymous actor', () => {
    const actor = anonymousActor();
    expect(actor.type).toBe('anonymous');
    expect(actor.id).toBe('anonymous');
  });

  it('anonymousActor stores ipHash when provided', () => {
    const actor = anonymousActor('abc123hash');
    expect(actor.ipHash).toBe('abc123hash');
  });
});
