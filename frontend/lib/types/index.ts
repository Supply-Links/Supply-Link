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
