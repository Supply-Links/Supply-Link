export type EventType = "HARVEST" | "PROCESSING" | "SHIPPING" | "RETAIL";

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type AlertStatus = "ACTIVE" | "RESOLVED";

export interface AlertDistributionSettings {
  webhookUrl?: string;
  notifyOwner: boolean;
  notifyActors: boolean;
  broadcastPublic: boolean;
}

export interface RecallAlert {
  productId: string;
  severity: AlertSeverity;
  message: string;
  issuedBy: string; // Stellar address
  issuedAt: number; // unix ms
  status: AlertStatus;
  resolvedAt?: number; // unix ms
  resolvedBy?: string; // Stellar address
  distribution: AlertDistributionSettings;
}

export type CertificateStatus = "VALID" | "REVOKED" | "EXPIRED";

export interface Certificate {
  id: string;
  productId: string;
  certType: string; // e.g. "ORGANIC", "FAIR_TRADE", "ISO_9001"
  issuedBy: string; // Stellar address of issuer
  issuedAt: number; // unix ms
  expiresAt?: number; // unix ms
  metadata: string; // JSON string with cert details
  status: CertificateStatus;
  revokedAt?: number; // unix ms
  revokedBy?: string; // Stellar address
  revocationReason?: string;
}

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
  recall?: RecallAlert; // present when product is under recall
}

export interface TrackingEvent {
  productId: string;
  location: string;
  actor: string; // Stellar address
  timestamp: number;
  eventType: EventType;
  metadata: string; // JSON string
}
