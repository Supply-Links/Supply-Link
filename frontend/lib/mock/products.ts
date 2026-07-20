import type { Product, TrackingEvent } from "@/lib/types";

export const MOCK_STORAGE_KEY = "supply-link-mock-data";

const INITIAL_PRODUCTS: Product[] = [
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

const INITIAL_EVENTS: TrackingEvent[] = [
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

function readPersistedState(): { products: Product[]; events: TrackingEvent[] } | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { products?: Product[]; events?: TrackingEvent[] };
    if (Array.isArray(parsed.products) && Array.isArray(parsed.events)) {
      return { products: parsed.products, events: parsed.events };
    }
  } catch {
    // Ignore invalid persisted data and fall back to defaults.
  }

  return null;
}

function persistState() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      MOCK_STORAGE_KEY,
      JSON.stringify({ products: MOCK_PRODUCTS, events: MOCK_EVENTS })
    );
  } catch {
    // Ignore storage errors in non-browser contexts.
  }
}

const persistedState = readPersistedState();

export let MOCK_PRODUCTS: Product[] = persistedState?.products ?? [...INITIAL_PRODUCTS];
export let MOCK_EVENTS: TrackingEvent[] = persistedState?.events ?? [...INITIAL_EVENTS];

export function resetMockData() {
  MOCK_PRODUCTS = [...INITIAL_PRODUCTS];
  MOCK_EVENTS = [...INITIAL_EVENTS];
  persistState();
}

export function addProduct(product: Product) {
  MOCK_PRODUCTS = [...MOCK_PRODUCTS, product];
  persistState();
}

export function addEvent(event: TrackingEvent) {
  MOCK_EVENTS = [...MOCK_EVENTS, event];
  persistState();
}

export function getProductById(id: string): Product | undefined {
  return MOCK_PRODUCTS.find((p) => p.id === id);
}

export function getEventsByProductId(id: string): TrackingEvent[] {
  return MOCK_EVENTS.filter((e) => e.productId === id);
}
