/**
 * Tests for Insurance Coverage Metadata (Feature C).
 */
import { describe, it, expect } from 'vitest';
import {
  addCoverage,
  getCoverage,
  listCoverageForProduct,
  getActiveCoverage,
  voidCoverage,
  addClaimProof,
  updateClaimProofStatus,
  verifyCoverage,
  formatCoverageAmount,
  isCoverageExpired,
  COVERAGE_STATUS_BADGE,
} from '@/lib/services/insuranceCoverage';
import type { InsuranceStatus } from '@/lib/services/insuranceCoverage';

// ── Helpers ───────────────────────────────────────────────────────────────────

let counter = 0;
function uniquePid() {
  return `prod-ins-${Date.now()}-${++counter}`;
}

const NOW = Date.now();
const FUTURE = NOW + 365 * 24 * 60 * 60 * 1000; // +1 year
const PAST = NOW - 365 * 24 * 60 * 60 * 1000;   // -1 year

function makeCoverage(productId: string, validUntil = FUTURE) {
  return addCoverage({
    productId,
    provider: 'Acme Insurance',
    policyNumber: 'POL-001',
    coverageType: 'product liability',
    coverageAmount: 10_000_00, // $10,000 in cents
    currency: 'USD',
    validFrom: NOW - 1000,
    validUntil,
    registeredBy: 'GOWNER123',
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Insurance Coverage — addCoverage', () => {
  it('creates a coverage record with correct fields', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid);
    expect(cov.id).toMatch(/^ins-/);
    expect(cov.productId).toBe(pid);
    expect(cov.provider).toBe('Acme Insurance');
    expect(cov.status).toBe('active');
    expect(cov.claimProofs).toHaveLength(0);
    expect(cov.coverageAmount).toBe(10_000_00);
  });

  it('stores the record and retrieves it by ID', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid);
    const fetched = getCoverage(cov.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(cov.id);
  });
});

describe('Insurance Coverage — listCoverageForProduct', () => {
  it('returns all coverage records for a product', () => {
    const pid = uniquePid();
    makeCoverage(pid);
    makeCoverage(pid);
    const list = listCoverageForProduct(pid);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.every((c) => c.productId === pid)).toBe(true);
  });

  it('returns empty array for unknown product', () => {
    expect(listCoverageForProduct('unknown-product')).toHaveLength(0);
  });

  it('returns results sorted newest-first', () => {
    const pid = uniquePid();
    makeCoverage(pid);
    makeCoverage(pid);
    const list = listCoverageForProduct(pid);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].createdAt).toBeGreaterThanOrEqual(list[i].createdAt);
    }
  });
});

describe('Insurance Coverage — getActiveCoverage', () => {
  it('returns only active, non-expired coverage', () => {
    const pid = uniquePid();
    makeCoverage(pid, FUTURE);
    const active = getActiveCoverage(pid);
    expect(active.length).toBeGreaterThanOrEqual(1);
    expect(active.every((c) => c.status === 'active')).toBe(true);
  });

  it('excludes voided coverage', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid, FUTURE);
    voidCoverage(cov.id);
    const active = getActiveCoverage(pid);
    expect(active.some((c) => c.id === cov.id)).toBe(false);
  });

  it('excludes expired coverage (validUntil in the past)', () => {
    const pid = uniquePid();
    makeCoverage(pid, PAST);
    const active = getActiveCoverage(pid);
    expect(active.some((c) => c.productId === pid && c.validUntil === PAST)).toBe(false);
  });
});

describe('Insurance Coverage — voidCoverage', () => {
  it('sets status to voided', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid);
    const updated = voidCoverage(cov.id);
    expect(updated!.status).toBe('voided');
  });

  it('returns null for unknown ID', () => {
    expect(voidCoverage('nonexistent')).toBeNull();
  });
});

describe('Insurance Coverage — addClaimProof', () => {
  it('adds a claim proof and transitions coverage to claimed', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid);
    const proof = addClaimProof({
      coverageId: cov.id,
      productId: pid,
      description: 'Product defect claim',
      proofRef: 'ipfs://QmTest123',
      claimant: 'GCLAIM456',
    });
    expect(proof).not.toBeNull();
    expect(proof!.id).toMatch(/^claim-/);
    expect(proof!.status).toBe('pending');
    expect(proof!.description).toBe('Product defect claim');

    const updated = getCoverage(cov.id)!;
    expect(updated.status).toBe('claimed');
    expect(updated.claimProofs).toHaveLength(1);
  });

  it('returns null for unknown coverage ID', () => {
    const result = addClaimProof({
      coverageId: 'nonexistent',
      productId: 'prod-x',
      description: 'test',
      proofRef: 'ref',
      claimant: 'G123',
    });
    expect(result).toBeNull();
  });
});

describe('Insurance Coverage — updateClaimProofStatus', () => {
  it('updates claim proof status to verified', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid);
    const proof = addClaimProof({
      coverageId: cov.id,
      productId: pid,
      description: 'Claim',
      proofRef: 'ref',
      claimant: 'G123',
    })!;

    const updated = updateClaimProofStatus(cov.id, proof.id, 'verified', 'Documents confirmed');
    expect(updated!.status).toBe('verified');
    expect(updated!.verifierNotes).toBe('Documents confirmed');
  });

  it('updates claim proof status to rejected', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid);
    const proof = addClaimProof({
      coverageId: cov.id,
      productId: pid,
      description: 'Claim',
      proofRef: 'ref',
      claimant: 'G123',
    })!;

    const updated = updateClaimProofStatus(cov.id, proof.id, 'rejected', 'Insufficient evidence');
    expect(updated!.status).toBe('rejected');
  });

  it('returns null for unknown coverage or claim ID', () => {
    expect(updateClaimProofStatus('bad-cov', 'bad-claim', 'verified')).toBeNull();
  });
});

describe('Insurance Coverage — verifyCoverage', () => {
  it('returns covered: true when active policies exist', () => {
    const pid = uniquePid();
    makeCoverage(pid, FUTURE);
    const result = verifyCoverage(pid);
    expect(result.covered).toBe(true);
    expect(result.activePolicies.length).toBeGreaterThanOrEqual(1);
    expect(result.totalCoverageAmount).toBeGreaterThan(0);
  });

  it('returns covered: false when no active policies', () => {
    const pid = uniquePid();
    const result = verifyCoverage(pid);
    expect(result.covered).toBe(false);
    expect(result.activePolicies).toHaveLength(0);
    expect(result.totalCoverageAmount).toBe(0);
  });

  it('sums coverage amounts across multiple active policies', () => {
    const pid = uniquePid();
    makeCoverage(pid, FUTURE);
    makeCoverage(pid, FUTURE);
    const result = verifyCoverage(pid);
    expect(result.totalCoverageAmount).toBe(20_000_00);
  });
});

describe('Insurance Coverage — formatCoverageAmount', () => {
  it('formats USD amounts correctly', () => {
    const formatted = formatCoverageAmount(10_000_00, 'USD');
    expect(formatted).toContain('10,000');
  });

  it('handles zero amount', () => {
    const formatted = formatCoverageAmount(0, 'USD');
    expect(formatted).toContain('0');
  });
});

describe('Insurance Coverage — isCoverageExpired', () => {
  it('returns false for future validUntil', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid, FUTURE);
    expect(isCoverageExpired(cov)).toBe(false);
  });

  it('returns true for past validUntil', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid, PAST);
    expect(isCoverageExpired(cov)).toBe(true);
  });

  it('returns false when validUntil is 0 (no expiry)', () => {
    const pid = uniquePid();
    const cov = makeCoverage(pid, 0);
    expect(isCoverageExpired(cov)).toBe(false);
  });
});

describe('Insurance Coverage — COVERAGE_STATUS_BADGE', () => {
  it('has entries for all statuses', () => {
    const statuses: InsuranceStatus[] = ['active', 'expired', 'claimed', 'voided'];
    for (const s of statuses) {
      expect(COVERAGE_STATUS_BADGE[s]).toBeTypeOf('string');
      expect(COVERAGE_STATUS_BADGE[s].length).toBeGreaterThan(0);
    }
  });
});
