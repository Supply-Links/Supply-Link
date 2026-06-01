export type EventType = "HARVEST" | "PROCESSING" | "SHIPPING" | "RETAIL";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type CertificateType = "ORGANIC" | "FAIR_TRADE" | "ISO9001" | "HALAL" | "KOSHER" | "OTHER";

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

/** An emergency recall or safety alert attached to a product. */
export interface RecallAlert {
  productId: string;
  issuer: string; // Stellar address
  severity: AlertSeverity;
  title: string;
  description: string;
  timestamp: number;
  /** Comma-separated distribution channels: "banner", "email", "webhook" */
  channels: string;
  active: boolean;
}

/** A certificate or attestation issued for a product. */
export interface Certificate {
  certId: string;
  productId: string;
  issuer: string; // Stellar address
  issuedAt: number;
  certType: CertificateType | string;
  metadata: string; // JSON string
  revoked: boolean;
}

/** Written on-chain when a certificate is revoked. */
export interface RevocationRecord {
  certId: string;
  revoker: string; // Stellar address
  revokedAt: number;
  reason: string;
}
