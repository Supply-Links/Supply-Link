import type { Product, TrackingEvent } from "@/lib/types";

export const MOCK_STORAGE_KEY = "supply-link-mock-data";

type MockState = {
  products: Product[];
  events: TrackingEvent[];
};

const GLOBAL_MOCK_STATE_KEY = "__SUPPLY_LINK_MOCK_STATE__";

function getMockState(): MockState {
  if (typeof globalThis === "undefined") {
    return { products: [], events: [] };
  }

  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_MOCK_STATE_KEY]?: MockState;
  };

  if (!globalScope[GLOBAL_MOCK_STATE_KEY]) {
    globalScope[GLOBAL_MOCK_STATE_KEY] = { products: [], events: [] };
  }

  return globalScope[GLOBAL_MOCK_STATE_KEY]!;
}

const MOCK_STATE = getMockState();

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

function loadPersistedState() {
  if (typeof window === "undefined") return false;

  try {
    const raw = window.localStorage.getItem(MOCK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { products?: Product[]; events?: TrackingEvent[] };
      if (Array.isArray(parsed.products) && Array.isArray(parsed.events)) {
        MOCK_STATE.products = parsed.products;
        MOCK_STATE.events = parsed.events;
        return true;
      }
    }
  } catch {
    // Ignore invalid persisted data and fall back to defaults.
  }

  return false;
}

function initMockState() {
  if (MOCK_STATE.products.length > 0 || MOCK_STATE.events.length > 0) {
    return;
  }

  if (!loadPersistedState()) {
    MOCK_STATE.products = [...INITIAL_PRODUCTS];
    MOCK_STATE.events = [...INITIAL_EVENTS];
  }
}

function persistState() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      MOCK_STORAGE_KEY,
      JSON.stringify({ products: MOCK_STATE.products, events: MOCK_STATE.events })
    );
  } catch {
    // Ignore storage errors in non-browser contexts.
  }
}

initMockState();

export function getMockProducts(): Product[] {
  if (typeof window !== "undefined") {
    loadPersistedState();
  } else {
    initMockState();
  }
  return MOCK_STATE.products;
}

export function getMockEvents(): TrackingEvent[] {
  if (typeof window !== "undefined") {
    loadPersistedState();
  } else {
    initMockState();
  }
  return MOCK_STATE.events;
}

export function resetMockData() {
  MOCK_STATE.products = [...INITIAL_PRODUCTS];
  MOCK_STATE.events = [...INITIAL_EVENTS];
  persistState();
}

export function addProduct(product: Product) {
  MOCK_STATE.products = [...MOCK_STATE.products, product];
  persistState();
}

export function addEvent(event: TrackingEvent) {
  MOCK_STATE.events = [...MOCK_STATE.events, event];
  persistState();
}

export function getProductById(id: string): Product | undefined {
  getMockProducts();
  return MOCK_STATE.products.find((p) => p.id === id);
}

export function getEventsByProductId(id: string): TrackingEvent[] {
  getMockEvents();
  return MOCK_STATE.events.filter((e) => e.productId === id);
}
