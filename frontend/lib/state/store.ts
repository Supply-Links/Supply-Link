import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, TrackingEvent, EventType } from "../types";
import { isConnected } from "@stellar/freighter-api";

interface SupplyLinkStore {
  // ── Data ──────────────────────────────────────────────────────────────────
  products: Product[];
  events: TrackingEvent[];

  // ── Loading / error (#47) ─────────────────────────────────────────────────
  productsLoading: boolean;
  productsError: string | null;
  eventsLoading: boolean;
  eventsError: string | null;

  // ── Cache timestamps (#48) ────────────────────────────────────────────────
  productsLastFetched: number | null;
  eventsLastFetched: number | null;

  // ── Search / filter / sort (#50) ──────────────────────────────────────────
  searchQuery: string;
  filterEventType: EventType | null;
  sortBy: "name" | "timestamp";
  sortOrder: "asc" | "desc";

  // ── Wallet ────────────────────────────────────────────────────────────────
  walletAddress: string | null;
  xlmBalance: string | null;
  networkMismatch: boolean;

  // ── Pagination ────────────────────────────────────────────────────────────
  productPage: number;
  productPageSize: number;
  productTotal: number;
  eventPage: number;
  eventPageSize: number;
  eventTotal: number;

  // ── Legacy (kept for backward compat) ─────────────────────────────────────
  lastFetched: number | null;
  setLastFetched: (ts: number) => void;

  // ── Actions ───────────────────────────────────────────────────────────────
  setWalletAddress: (address: string | null) => void;
  setXlmBalance: (balance: string | null) => void;
  setNetworkMismatch: (mismatch: boolean) => void;
  setProducts: (products: Product[]) => void;
  setEvents: (events: TrackingEvent[]) => void;
  addProduct: (product: Product) => void;
  addEvent: (event: TrackingEvent) => void;
  setProductsLoading: (v: boolean) => void;
  setProductsError: (v: string | null) => void;
  setEventsLoading: (v: boolean) => void;
  setEventsError: (v: string | null) => void;
  setProductsLastFetched: (ts: number | null) => void;
  setEventsLastFetched: (ts: number | null) => void;
  setSearchQuery: (q: string) => void;
  setFilterEventType: (t: EventType | null) => void;
  setSortBy: (by: "name" | "timestamp") => void;
  setSortOrder: (order: "asc" | "desc") => void;
  updateProductOwner: (productId: string, newOwner: string) => void;
  // Optimistic updates (#49)
  addOptimisticProduct: (product: Product) => void;
  confirmOptimisticProduct: (productId: string) => void;
  removeOptimisticProduct: (productId: string) => void;
  addOptimisticEvent: (event: TrackingEvent) => void;
  confirmOptimisticEvent: (productId: string, timestamp: number) => void;
  removeOptimisticEvent: (productId: string, timestamp: number) => void;
  // Pagination
  setProductPage: (page: number) => void;
  setProductPageSize: (size: number) => void;
  setProductTotal: (total: number) => void;
  setEventPage: (page: number) => void;
  setEventPageSize: (size: number) => void;
  setEventTotal: (total: number) => void;
  validateWalletConnection: () => Promise<void>;
  disconnect: () => void;
}

export const useStore = create<SupplyLinkStore>()(
  persist(
    (set) => ({
      products: [],
      events: [],
      productsLoading: false,
      productsError: null,
      eventsLoading: false,
      eventsError: null,
      productsLastFetched: null,
      eventsLastFetched: null,
      searchQuery: "",
      filterEventType: null,
      sortBy: "name",
      sortOrder: "asc",
      walletAddress: null,
      xlmBalance: null,
      networkMismatch: false,
      lastFetched: null,
      productPage: 0,
      productPageSize: 20,
      productTotal: 0,
      eventPage: 0,
      eventPageSize: 20,
      eventTotal: 0,

      setWalletAddress: (walletAddress) => set({ walletAddress }),
      setXlmBalance: (xlmBalance) => set({ xlmBalance }),
      setNetworkMismatch: (networkMismatch) => set({ networkMismatch }),
      setProducts: (products) => set({ products }),
      setEvents: (events) => set({ events }),
      addProduct: (product) =>
        set((s) => ({ products: [...s.products, product] })),
      addEvent: (event) =>
        set((s) => ({ events: [...s.events, event] })),
      setProductsLoading: (productsLoading) => set({ productsLoading }),
      setProductsError: (productsError) => set({ productsError }),
      setEventsLoading: (eventsLoading) => set({ eventsLoading }),
      setEventsError: (eventsError) => set({ eventsError }),
      setProductsLastFetched: (productsLastFetched) => set({ productsLastFetched }),
      setEventsLastFetched: (eventsLastFetched) => set({ eventsLastFetched }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setFilterEventType: (filterEventType) => set({ filterEventType }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      updateProductOwner: (productId, newOwner) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === productId ? { ...p, owner: newOwner } : p
          ),
        })),
      addOptimisticProduct: (product) =>
        set((s) => ({ products: [...s.products, { ...product, pending: true }] })),
      confirmOptimisticProduct: (productId) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === productId ? { ...p, pending: false } : p
          ),
        })),
      removeOptimisticProduct: (productId) =>
        set((s) => ({ products: s.products.filter((p) => p.id !== productId) })),
      addOptimisticEvent: (event) =>
        set((s) => ({ events: [...s.events, { ...event, pending: true }] })),
      confirmOptimisticEvent: (productId, timestamp) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.productId === productId && e.timestamp === timestamp
              ? { ...e, pending: false }
              : e
          ),
        })),
      removeOptimisticEvent: (productId, timestamp) =>
        set((s) => ({
          events: s.events.filter(
            (e) => !(e.productId === productId && e.timestamp === timestamp)
          ),
        })),
      setProductPage: (productPage) => set({ productPage }),
      setProductPageSize: (productPageSize) => set({ productPageSize }),
      setProductTotal: (productTotal) => set({ productTotal }),
      setEventPage: (eventPage) => set({ eventPage }),
      setEventPageSize: (eventPageSize) => set({ eventPageSize }),
      setEventTotal: (eventTotal) => set({ eventTotal }),
      validateWalletConnection: async () => {
        const connected = await isConnected();
        if (!connected) set({ walletAddress: null });
      },
      disconnect: () =>
        set({
          walletAddress: null,
          products: [],
          events: [],
          lastFetched: null,
          productsLastFetched: null,
          eventsLastFetched: null,
          productPage: 0,
          eventPage: 0,
        }),
      setLastFetched: (ts) => set({ lastFetched: ts }),
    }),
    {
      name: "supply-link-store",
      partialize: (state) => ({ walletAddress: state.walletAddress }),
    }
  )
);

/** Derived selector: filtered + sorted products (#50) */
export function selectFilteredProducts(state: SupplyLinkStore): Product[] {
  const { products, searchQuery, filterEventType, sortBy, sortOrder } = state;

  const result = products.filter((p) => {
    const matchesSearch =
      searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());
    // filterEventType is reserved for event-based filtering in future;
    // products don't carry event type directly so we pass through for now.
    const matchesFilter = filterEventType === null || true;
    return matchesSearch && matchesFilter;
  });

  return [...result].sort((a, b) => {
    const av = sortBy === "name" ? a.name : a.timestamp;
    const bv = sortBy === "name" ? b.name : b.timestamp;
    if (av < bv) return sortOrder === "asc" ? -1 : 1;
    if (av > bv) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });
}
