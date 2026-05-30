import type { Product, TrackingEvent, Certification } from "@/lib/types";

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
    archived: false,
  },
  {
    productId: "prod-001",
    eventType: "PROCESSING",
    location: "Addis Ababa, Ethiopia",
    actor: "GACTOR1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    timestamp: 1710200000000,
    metadata: JSON.stringify({ method: "Washed", moisture: "11%" }),
    archived: false,
  },
  {
    productId: "prod-001",
    eventType: "SHIPPING",
    location: "Port of Djibouti",
    actor: "GACTOR2ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    timestamp: 1710400000000,
    metadata: JSON.stringify({ vessel: "MV Stellar", destination: "Rotterdam" }),
    archived: false,
  },
  {
    productId: "prod-001",
    eventType: "RETAIL",
    location: "Amsterdam, Netherlands",
    actor: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    timestamp: 1710600000000,
    metadata: JSON.stringify({ store: "Green Beans Co." }),
    archived: false,
  },
  {
    productId: "prod-002",
    eventType: "HARVEST",
    location: "Ashanti Region, Ghana",
    actor: "GACTOR3ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    timestamp: 1711000000000,
    metadata: JSON.stringify({ variety: "Forastero" }),
    archived: false,
  },
];

// Archived events — retained for auditing but excluded from active timelines
export const MOCK_ARCHIVED_EVENTS: TrackingEvent[] = [
  {
    productId: "prod-001",
    eventType: "PROCESSING",
    location: "Dire Dawa, Ethiopia (old facility)",
    actor: "GACTOR1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    timestamp: 1709800000000,
    metadata: JSON.stringify({ method: "Natural", note: "Superseded by updated record" }),
    archived: true,
    archivedAt: 1710100000000,
  },
];

export const MOCK_CERTIFICATIONS: Certification[] = [
  {
    certId: "cert-001",
    productId: "prod-001",
    issuer: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: 1710050000000,
    certType: "ORGANIC",
    reference: "https://registry.example/organic/cert-001",
    revoked: false,
  },
  {
    certId: "cert-002",
    productId: "prod-001",
    issuer: "GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: 1710100000000,
    certType: "FAIR_TRADE",
    reference: "https://fairtrade.example/verify/cert-002",
    revoked: false,
  },
  {
    certId: "cert-003",
    productId: "prod-001",
    issuer: "GACTOR1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567",
    issuedAt: 1709900000000,
    certType: "ISO9001",
    reference: "https://iso.example/cert-003",
    revoked: true,
    revokedAt: 1710000000000,
  },
  {
    certId: "cert-004",
    productId: "prod-002",
    issuer: "GDEF1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    issuedAt: 1711100000000,
    certType: "FAIR_TRADE",
    reference: "https://fairtrade.example/verify/cert-004",
    revoked: false,
  },
];

export function getProductById(id: string): Product | undefined {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}

export function getEventsByProductId(id: string): TrackingEvent[] {
  return MOCK_EVENTS.filter((e) => e.productId === id && !e.archived);
}

export function getArchivedEventsByProductId(id: string): TrackingEvent[] {
  return MOCK_ARCHIVED_EVENTS.filter((e) => e.productId === id);
}

export function getCertificationsByProductId(id: string): Certification[] {
  return MOCK_CERTIFICATIONS.filter((c) => c.productId === id);
}
