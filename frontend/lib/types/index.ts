export type EventType = "HARVEST" | "PROCESSING" | "SHIPPING" | "RETAIL";

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
  /** Off-chain image URL stored in product metadata (#112) */
  imageUrl?: string;
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

export interface Notification {
  id: string; // `${productId}-${timestamp}`
  productId: string;
  productName: string;
  eventType: EventType;
  location: string;
  actor: string;
  timestamp: number;
  read: boolean;
}
