export type EventType = "HARVEST" | "PROCESSING" | "SHIPPING" | "RETAIL";

export interface TemplateStage {
  label: string;
  eventType: EventType;
}

export interface OwnershipRecord {
  owner: string;
  transferredAt: number;
}

export interface Product {
  id: string;
  name: string;
  origin: string;
  owner: string;
  timestamp: number;
  active: boolean;
  authorizedActors: string[];
  ownershipHistory?: OwnershipRecord[];
  /** Number of signatures required for events (0 or 1 = immediate, >1 = multi-sig) */
  requiredSignatures?: number;
  /** true while an on-chain transaction is in-flight (#49) */
  pending?: boolean;
  /** Ordered supply chain stages chosen at registration */
  templateStages?: TemplateStage[];
}

export interface TrackingEvent {
  productId: string;
  location: string;
  actor: string;
  timestamp: number;
  eventType: EventType;
  metadata: string;
  /** true while an on-chain transaction is in-flight (#49) */
  pending?: boolean;
}

export interface PendingEvent {
  productId: string;
  event: TrackingEvent;
  approvals: string[];
  requiredSignatures: number;
  createdAt: number;
}
