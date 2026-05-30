export type EventType = "HARVEST" | "PROCESSING" | "SHIPPING" | "RETAIL";

export interface OwnershipRecord {
  owner: string; // Stellar address
  transferredAt: number; // unix ms
}

export interface Product {
  id: string;
  name: string;
  origin: string;
  owner: string; // Stellar address
  timestamp: number;
  active: boolean;
  authorizedActors: string[];
  ownershipHistory?: OwnershipRecord[];
}

export interface TrackingEvent {
  productId: string;
  location: string;
  actor: string; // Stellar address
  timestamp: number;
  eventType: EventType;
  metadata: string; // JSON string
}

/** Coverage type values stored on-chain. */
export type CoverageType = "CARGO" | "LIABILITY" | "ALL_RISK" | "TRANSIT" | string;

/** Claim status values stored on-chain. */
export type ClaimStatus = "SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | string;

/**
 * Insurance coverage metadata for a product.
 * Mirrors the on-chain InsuranceCoverage struct.
 */
export interface InsuranceCoverage {
  policyId: string;
  provider: string;
  coverageType: CoverageType;
  validFrom: string;   // ISO-8601 date string
  validUntil: string;  // ISO-8601 date string
  insuredValue: string; // e.g. "50000 USD"
  recordedBy: string;  // Stellar address
  timestamp: number;   // unix ms
}

/**
 * A claim proof reference attached to a product's insurance record.
 * Mirrors the on-chain ClaimProof struct.
 */
export interface ClaimProof {
  claimId: string;
  documentRef: string;  // IPFS CID or document hash
  description: string;
  status: ClaimStatus;
  submittedBy: string;  // Stellar address
  timestamp: number;    // unix ms
}

/**
 * A read-access audit log entry for a sensitive product query.
 * Mirrors the on-chain ReadAccessLog struct.
 */
export interface ReadAccessLog {
  productId: string;
  accessor: string;   // Stellar address
  timestamp: number;  // unix ms
  purpose: string;    // e.g. "INSURANCE_VERIFY" | "AUDIT" | "OWNERSHIP_CHECK"
}
