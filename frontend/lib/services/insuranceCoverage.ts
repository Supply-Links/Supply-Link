/**
 * Insurance Coverage Metadata Service.
 *
 * Stores and verifies insurance coverage data and claim proof references
 * for products. In production this would be backed by on-chain Soroban
 * contract storage.
 */

export type InsuranceStatus = 'active' | 'expired' | 'claimed' | 'voided';
export type ClaimProofStatus = 'pending' | 'verified' | 'rejected';

export interface InsuranceCoverage {
  /** Unique coverage record ID. */
  id: string;
  /** Product this coverage applies to. */
  productId: string;
  /** Name of the insurance provider. */
  provider: string;
  /** Policy number / reference. */
  policyNumber: string;
  /** Coverage type (e.g. "product liability", "cargo", "recall"). */
  coverageType: string;
  /** Coverage amount in smallest currency unit (e.g. cents). */
  coverageAmount: number;
  /** ISO 4217 currency code. */
  currency: string;
  /** Unix ms timestamp when coverage starts. */
  validFrom: number;
  /** Unix ms timestamp when coverage expires. 0 = no expiry. */
  validUntil: number;
  /** Current status of the coverage. */
  status: InsuranceStatus;
  /** Off-chain reference to the policy document (IPFS CID, URL, etc.). */
  documentRef?: string;
  /** Address of the actor who registered this coverage. */
  registeredBy: string;
  /** Unix ms timestamp when this record was created. */
  createdAt: number;
  /** Claim proof references associated with this coverage. */
  claimProofs: ClaimProof[];
}

export interface ClaimProof {
  /** Unique claim proof ID. */
  id: string;
  /** Coverage record this proof belongs to. */
  coverageId: string;
  /** Product ID. */
  productId: string;
  /** Short description of the claim. */
  description: string;
  /** Off-chain proof reference (IPFS CID, URL, document hash, etc.). */
  proofRef: string;
  /** SHA-256 hash of the proof document for integrity verification. */
  documentHash?: string;
  /** Current verification status. */
  status: ClaimProofStatus;
  /** Address of the claimant. */
  claimant: string;
  /** Unix ms timestamp when the claim was filed. */
  filedAt: number;
  /** Unix ms timestamp when the claim was last updated. */
  updatedAt: number;
  /** Optional notes from the verifier. */
  verifierNotes?: string;
}

// ── In-memory store (replace with DB / on-chain in production) ────────────────

const coverageStore = new Map<string, InsuranceCoverage>();

// ── Coverage CRUD ─────────────────────────────────────────────────────────────

export function addCoverage(params: {
  productId: string;
  provider: string;
  policyNumber: string;
  coverageType: string;
  coverageAmount: number;
  currency: string;
  validFrom: number;
  validUntil: number;
  documentRef?: string;
  registeredBy: string;
}): InsuranceCoverage {
  const id = `ins-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const coverage: InsuranceCoverage = {
    id,
    productId: params.productId,
    provider: params.provider,
    policyNumber: params.policyNumber,
    coverageType: params.coverageType,
    coverageAmount: params.coverageAmount,
    currency: params.currency,
    validFrom: params.validFrom,
    validUntil: params.validUntil,
    status: 'active',
    documentRef: params.documentRef,
    registeredBy: params.registeredBy,
    createdAt: now,
    claimProofs: [],
  };

  coverageStore.set(id, coverage);
  return coverage;
}

export function getCoverage(id: string): InsuranceCoverage | null {
  return coverageStore.get(id) ?? null;
}

export function listCoverageForProduct(productId: string): InsuranceCoverage[] {
  return Array.from(coverageStore.values())
    .filter((c) => c.productId === productId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getActiveCoverage(productId: string): InsuranceCoverage[] {
  const now = Date.now();
  return listCoverageForProduct(productId).filter(
    (c) =>
      c.status === 'active' &&
      c.validFrom <= now &&
      (c.validUntil === 0 || c.validUntil >= now),
  );
}

export function voidCoverage(id: string): InsuranceCoverage | null {
  const coverage = coverageStore.get(id);
  if (!coverage) return null;
  coverage.status = 'voided';
  coverageStore.set(id, coverage);
  return coverage;
}

// ── Claim proofs ──────────────────────────────────────────────────────────────

export function addClaimProof(params: {
  coverageId: string;
  productId: string;
  description: string;
  proofRef: string;
  documentHash?: string;
  claimant: string;
}): ClaimProof | null {
  const coverage = coverageStore.get(params.coverageId);
  if (!coverage) return null;

  const id = `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const proof: ClaimProof = {
    id,
    coverageId: params.coverageId,
    productId: params.productId,
    description: params.description,
    proofRef: params.proofRef,
    documentHash: params.documentHash,
    status: 'pending',
    claimant: params.claimant,
    filedAt: now,
    updatedAt: now,
  };

  coverage.claimProofs.push(proof);
  coverage.status = 'claimed';
  coverageStore.set(params.coverageId, coverage);
  return proof;
}

export function updateClaimProofStatus(
  coverageId: string,
  claimId: string,
  status: ClaimProofStatus,
  verifierNotes?: string,
): ClaimProof | null {
  const coverage = coverageStore.get(coverageId);
  if (!coverage) return null;

  const proof = coverage.claimProofs.find((p) => p.id === claimId);
  if (!proof) return null;

  proof.status = status;
  proof.updatedAt = Date.now();
  if (verifierNotes) proof.verifierNotes = verifierNotes;

  coverageStore.set(coverageId, coverage);
  return proof;
}

// ── Verification ──────────────────────────────────────────────────────────────

export interface CoverageVerificationResult {
  covered: boolean;
  activePolicies: InsuranceCoverage[];
  expiredPolicies: InsuranceCoverage[];
  totalCoverageAmount: number;
  currency: string;
}

export function verifyCoverage(productId: string): CoverageVerificationResult {
  const all = listCoverageForProduct(productId);
  const active = getActiveCoverage(productId);
  const expired = all.filter((c) => c.status === 'expired' || c.status === 'voided');

  const totalCoverageAmount = active.reduce((sum, c) => sum + c.coverageAmount, 0);
  const currency = active[0]?.currency ?? 'USD';

  return {
    covered: active.length > 0,
    activePolicies: active,
    expiredPolicies: expired,
    totalCoverageAmount,
    currency,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatCoverageAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

export function isCoverageExpired(coverage: InsuranceCoverage): boolean {
  if (coverage.validUntil === 0) return false;
  return coverage.validUntil < Date.now();
}

export const COVERAGE_STATUS_BADGE: Record<InsuranceStatus, string> = {
  active:
    'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
  expired:
    'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
  claimed:
    'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
  voided:
    'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
};
