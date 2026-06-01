/**
 * Tests for the Revocation Registry (Feature B).
 */
import { describe, it, expect } from 'vitest';
import {
  revokeCredential,
  checkRevocation,
  listRevocations,
  getRevocationById,
  supersede,
  batchCheckRevocation,
  getRevocationStats,
} from '@/lib/services/revocationRegistry';
import type { RevocationType } from '@/lib/services/revocationRegistry';

// ── Helpers ───────────────────────────────────────────────────────────────────

let counter = 0;
function uniqueId(prefix = 'cert') {
  return `${prefix}-${Date.now()}-${++counter}`;
}

function revoke(
  subjectId: string,
  type: RevocationType = 'certification',
  productId = 'prod-rev-test',
  reason?: string,
) {
  return revokeCredential({
    subjectId,
    type,
    productId,
    revokedBy: 'GISSUER123',
    reason,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Revocation Registry — revokeCredential', () => {
  it('creates a revocation entry with correct fields', () => {
    const id = uniqueId();
    const entry = revoke(id, 'certification', 'prod-1', 'Expired');
    expect(entry.id).toMatch(/^rev-/);
    expect(entry.subjectId).toBe(id);
    expect(entry.type).toBe('certification');
    expect(entry.productId).toBe('prod-1');
    expect(entry.revokedBy).toBe('GISSUER123');
    expect(entry.reason).toBe('Expired');
    expect(entry.superseded).toBe(false);
    expect(entry.revokedAt).toBeTypeOf('number');
  });

  it('is idempotent — returns existing entry on duplicate subjectId', () => {
    const id = uniqueId();
    const first = revoke(id);
    const second = revoke(id);
    expect(second.id).toBe(first.id);
  });

  it('supports all revocation types', () => {
    const types: RevocationType[] = ['certification', 'attestation', 'registry_record'];
    for (const type of types) {
      const entry = revoke(uniqueId(type), type);
      expect(entry.type).toBe(type);
    }
  });
});

describe('Revocation Registry — checkRevocation', () => {
  it('returns revoked: true for a revoked credential', () => {
    const id = uniqueId();
    revoke(id);
    const result = checkRevocation(id);
    expect(result.revoked).toBe(true);
    expect(result.entry).toBeDefined();
    expect(result.entry!.subjectId).toBe(id);
  });

  it('returns revoked: false for an unknown credential', () => {
    const result = checkRevocation('never-revoked-id');
    expect(result.revoked).toBe(false);
    expect(result.entry).toBeUndefined();
  });

  it('returns revoked: false after superseding', () => {
    const id = uniqueId();
    const entry = revoke(id);
    supersede(entry.id);
    const result = checkRevocation(id);
    expect(result.revoked).toBe(false);
  });
});

describe('Revocation Registry — listRevocations', () => {
  it('filters by productId', () => {
    const pid = `prod-list-${Date.now()}`;
    revoke(uniqueId(), 'certification', pid);
    revoke(uniqueId(), 'attestation', pid);
    const results = listRevocations({ productId: pid });
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every((e) => e.productId === pid)).toBe(true);
  });

  it('filters by type', () => {
    const pid = `prod-type-${Date.now()}`;
    revoke(uniqueId(), 'certification', pid);
    revoke(uniqueId(), 'attestation', pid);
    const certs = listRevocations({ productId: pid, type: 'certification' });
    expect(certs.every((e) => e.type === 'certification')).toBe(true);
  });

  it('excludes superseded entries', () => {
    const pid = `prod-super-${Date.now()}`;
    const entry = revoke(uniqueId(), 'certification', pid);
    supersede(entry.id);
    const results = listRevocations({ productId: pid });
    expect(results.some((e) => e.id === entry.id)).toBe(false);
  });

  it('returns results sorted newest-first', () => {
    const pid = `prod-sort-${Date.now()}`;
    revoke(uniqueId(), 'certification', pid);
    revoke(uniqueId(), 'attestation', pid);
    const results = listRevocations({ productId: pid });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].revokedAt).toBeGreaterThanOrEqual(results[i].revokedAt);
    }
  });
});

describe('Revocation Registry — getRevocationById', () => {
  it('retrieves an entry by its record ID', () => {
    const id = uniqueId();
    const entry = revoke(id);
    const fetched = getRevocationById(entry.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.subjectId).toBe(id);
  });

  it('returns null for unknown record ID', () => {
    expect(getRevocationById('nonexistent')).toBeNull();
  });
});

describe('Revocation Registry — supersede', () => {
  it('marks entry as superseded', () => {
    const entry = revoke(uniqueId());
    const updated = supersede(entry.id);
    expect(updated!.superseded).toBe(true);
  });

  it('returns null for unknown ID', () => {
    expect(supersede('nonexistent')).toBeNull();
  });
});

describe('Revocation Registry — batchCheckRevocation', () => {
  it('returns a map of results for all provided IDs', () => {
    const id1 = uniqueId();
    const id2 = uniqueId();
    revoke(id1);
    const results = batchCheckRevocation([id1, id2]);
    expect(results[id1].revoked).toBe(true);
    expect(results[id2].revoked).toBe(false);
  });

  it('handles empty array', () => {
    const results = batchCheckRevocation([]);
    expect(Object.keys(results)).toHaveLength(0);
  });
});

describe('Revocation Registry — getRevocationStats', () => {
  it('returns numeric stats', () => {
    const stats = getRevocationStats();
    expect(stats.total).toBeTypeOf('number');
    expect(stats.certifications).toBeTypeOf('number');
    expect(stats.attestations).toBeTypeOf('number');
    expect(stats.registryRecords).toBeTypeOf('number');
  });

  it('stats sum matches total', () => {
    const stats = getRevocationStats();
    expect(stats.certifications + stats.attestations + stats.registryRecords).toBe(stats.total);
  });
});
