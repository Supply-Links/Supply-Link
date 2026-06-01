import type { Product, TrackingEvent, RecallAlert, Certificate, RevocationRecord } from "@/lib/types";

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

/** Mock recall alerts — prod-001 has an active critical recall. */
export const MOCK_RECALL_ALERTS: RecallAlert[] = [
  {
    productId: "prod-001",
    issuer: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    severity: "CRITICAL",
    title: "Contamination Risk — Batch #ETH-2024-03",
    description:
      "Lab testing has identified potential allergen cross-contamination in batch #ETH-2024-03. All downstream stakeholders must halt distribution immediately.",
    timestamp: 1710700000000,
    channels: "banner,email,webhook",
    active: true,
  },
];

/** Mock certificates — prod-001 has an organic cert (valid) and a fair-trade cert (revoked). */
export const MOCK_CERTIFICATES: Certificate[] = [
  {
    certId: "cert-001-organic",
    productId: "prod-001",
    issuer: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: 1710050000000,
    certType: "ORGANIC",
    metadata: JSON.stringify({ body: "USDA Organic", standard: "NOP" }),
    revoked: false,
  },
  {
    certId: "cert-001-fairtrade",
    productId: "prod-001",
    issuer: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: 1710060000000,
    certType: "FAIR_TRADE",
    metadata: JSON.stringify({ body: "Fairtrade International", license: "FLO-12345" }),
    revoked: true,
  },
  {
    certId: "cert-002-organic",
    productId: "prod-002",
    issuer: "GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: 1711050000000,
    certType: "ORGANIC",
    metadata: JSON.stringify({ body: "EU Organic", standard: "EC 834/2007" }),
    revoked: false,
  },
];

/** Mock revocation records. */
export const MOCK_REVOCATIONS: RevocationRecord[] = [
  {
    certId: "cert-001-fairtrade",
    revoker: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    revokedAt: 1710650000000,
    reason: "Supplier failed annual audit — license suspended by Fairtrade International.",
  },
];

export function getProductById(id: string): Product | undefined {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}

export function getEventsByProductId(id: string): TrackingEvent[] {
  return MOCK_EVENTS.filter((e) => e.productId === id);
}

export function getActiveAlertByProductId(id: string): RecallAlert | undefined {
  return MOCK_RECALL_ALERTS.find((a) => a.productId === id && a.active);
}

export function getCertificatesByProductId(id: string): Certificate[] {
  return MOCK_CERTIFICATES.filter((c) => c.productId === id);
}

export function getRevocationByCertId(certId: string): RevocationRecord | undefined {
  return MOCK_REVOCATIONS.find((r) => r.certId === certId);
}
