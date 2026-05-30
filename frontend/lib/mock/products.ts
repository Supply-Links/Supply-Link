import type { Product, TrackingEvent, InsuranceCoverage, ClaimProof, ReadAccessLog } from "@/lib/types";

export const MOCK_PRODUCTS: Product[] = [
  {
    id: "prod-001",
    name: "Organic Coffee Beans",
    origin: "Ethiopia",
    owner: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    timestamp: 1710000000000,
    active: true,
    authorizedActors: [
      "GACTOR1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
      "GACTOR2ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    ],
    ownershipHistory: [
      { owner: "GORIGINALOWNERABCDEFGHIJKLMNOPQRSTUVWXYZ", transferredAt: 1700000000000 },
      { owner: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ", transferredAt: 1710000000000 },
    ],
  },
  {
    id: "prod-002",
    name: "Fair Trade Cocoa",
    origin: "Ghana",
    owner: "GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    timestamp: 1711000000000,
    active: true,
    authorizedActors: ["GACTOR3ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567"],
    ownershipHistory: [
      { owner: "GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ", transferredAt: 1711000000000 },
    ],
  },
];

export const MOCK_EVENTS: TrackingEvent[] = [
  {
    productId: "prod-001",
    eventType: "HARVEST",
    location: "Yirgacheffe, Ethiopia",
    actor: "GACTOR1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    timestamp: 1710000000000,
    metadata: JSON.stringify({ notes: "Hand-picked, shade-grown" }),
  },
  {
    productId: "prod-001",
    eventType: "PROCESSING",
    location: "Addis Ababa, Ethiopia",
    actor: "GACTOR1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    timestamp: 1710200000000,
    metadata: JSON.stringify({ method: "Washed", moisture: "11%" }),
  },
  {
    productId: "prod-001",
    eventType: "SHIPPING",
    location: "Port of Djibouti",
    actor: "GACTOR2ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    timestamp: 1710400000000,
    metadata: JSON.stringify({ vessel: "MV Stellar", destination: "Rotterdam" }),
  },
  {
    productId: "prod-001",
    eventType: "RETAIL",
    location: "Amsterdam, Netherlands",
    actor: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    timestamp: 1710600000000,
    metadata: JSON.stringify({ store: "Green Beans Co." }),
  },
  {
    productId: "prod-002",
    eventType: "HARVEST",
    location: "Ashanti Region, Ghana",
    actor: "GACTOR3ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    timestamp: 1711000000000,
    metadata: JSON.stringify({ variety: "Forastero" }),
  },
];

/** Mock insurance coverage records keyed by productId. */
export const MOCK_INSURANCE: Record<string, InsuranceCoverage> = {
  "prod-001": {
    policyId: "POL-2024-ETH-001",
    provider: "Lloyd's of London",
    coverageType: "CARGO",
    validFrom: "2024-01-01",
    validUntil: "2025-01-01",
    insuredValue: "50000 USD",
    recordedBy: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    timestamp: 1710000000000,
  },
};

/** Mock claim proofs keyed by productId. */
export const MOCK_CLAIMS: Record<string, ClaimProof[]> = {
  "prod-001": [
    {
      claimId: "CLM-2024-001",
      documentRef: "QmXyz123abcdef456789IPFSHASHEXAMPLE",
      description: "Minor water damage to outer packaging during transit via Rotterdam port.",
      status: "APPROVED",
      submittedBy: "GACTOR2ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
      timestamp: 1710500000000,
    },
    {
      claimId: "CLM-2024-002",
      documentRef: "QmAbc987zyxwvu654321IPFSHASHEXAMPLE",
      description: "Temperature excursion during cold-chain storage.",
      status: "PENDING",
      submittedBy: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      timestamp: 1710580000000,
    },
  ],
};

/** Mock read-access audit logs keyed by productId. */
export const MOCK_READ_LOGS: Record<string, ReadAccessLog[]> = {
  "prod-001": [
    {
      productId: "prod-001",
      accessor: "GAUDITOR1ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
      timestamp: 1710450000000,
      purpose: "INSURANCE_VERIFY",
    },
    {
      productId: "prod-001",
      accessor: "GAUDITOR2ABCDEFGHIJKLMNOPQRSTUVWXYZ12345",
      timestamp: 1710460000000,
      purpose: "AUDIT",
    },
    {
      productId: "prod-001",
      accessor: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      timestamp: 1710470000000,
      purpose: "OWNERSHIP_CHECK",
    },
  ],
};

export function getProductById(id: string): Product | undefined {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}

export function getEventsByProductId(id: string): TrackingEvent[] {
  return MOCK_EVENTS.filter((e) => e.productId === id);
}

export function getInsuranceByProductId(id: string): InsuranceCoverage | undefined {
  return MOCK_INSURANCE[id];
}

export function getClaimsByProductId(id: string): ClaimProof[] {
  return MOCK_CLAIMS[id] ?? [];
}

export function getReadLogsByProductId(id: string): ReadAccessLog[] {
  return MOCK_READ_LOGS[id] ?? [];
}
