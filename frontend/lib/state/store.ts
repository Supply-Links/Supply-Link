import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, TrackingEvent, Notification } from "../types";
import { isConnected } from "@stellar/freighter-api";

interface SupplyLinkStore {
  products: Product[];
  events: TrackingEvent[];
  walletAddress: string | null;
  xlmBalance: string | null;
  networkMismatch: boolean;
  lastFetched: number | null;
  productPage: number;
  productPageSize: number;
  productTotal: number;
  eventPage: number;
  eventPageSize: number;
  eventTotal: number;
  notifications: Notification[];
  setWalletAddress: (address: string | null) => void;
  setXlmBalance: (balance: string | null) => void;
  setNetworkMismatch: (mismatch: boolean) => void;
  addProduct: (product: Product) => void;
  addEvent: (event: TrackingEvent) => void;
  setProducts: (products: Product[]) => void;
  setEvents: (events: TrackingEvent[]) => void;
  setLastFetched: (ts: number) => void;
  updateProductOwner: (productId: string, newOwner: string) => void;
  validateWalletConnection: () => Promise<void>;
  setProductPage: (page: number) => void;
  setProductPageSize: (size: number) => void;
  setProductTotal: (total: number) => void;
  setEventPage: (page: number) => void;
  setEventPageSize: (size: number) => void;
  setEventTotal: (total: number) => void;
  disconnect: () => void;
  addNotifications: (notifications: Notification[]) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
}

export const useStore = create<SupplyLinkStore>()(
  persist(
    (set) => ({
      products: [],
      events: [],
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
      notifications: [],
      setWalletAddress: (address) => set({ walletAddress: address }),
      setXlmBalance: (balance) => set({ xlmBalance: balance }),
      setNetworkMismatch: (mismatch) => set({ networkMismatch: mismatch }),
      addProduct: (product) =>
        set((state) => ({ products: [...state.products, product] })),
      addEvent: (event) =>
        set((state) => ({ events: [...state.events, event] })),
      setProducts: (products) => set({ products }),
      setEvents: (events) => set({ events }),
      setLastFetched: (ts) => set({ lastFetched: ts }),
      updateProductOwner: (productId, newOwner) =>
        set((state) => ({
          products: state.products.map((p) =>
            p.id === productId ? { ...p, owner: newOwner } : p
          ),
        })),
      validateWalletConnection: async () => {
        const connected = await isConnected();
        if (!connected) {
          set({ walletAddress: null });
        }
      },
      setProductPage: (page) => set({ productPage: page }),
      setProductPageSize: (size) => set({ productPageSize: size }),
      setProductTotal: (total) => set({ productTotal: total }),
      setEventPage: (page) => set({ eventPage: page }),
      setEventPageSize: (size) => set({ eventPageSize: size }),
      setEventTotal: (total) => set({ eventTotal: total }),
      disconnect: () =>
        set({
          walletAddress: null,
          products: [],
          events: [],
          lastFetched: null,
          productPage: 0,
          eventPage: 0,
        }),
      addNotifications: (incoming) =>
        set((state) => {
          const existingIds = new Set(state.notifications.map((n) => n.id));
          const fresh = incoming.filter((n) => !existingIds.has(n.id));
          if (!fresh.length) return state;
          return { notifications: [...fresh, ...state.notifications].slice(0, 50) };
        }),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),
    }),
    {
      name: "supply-link-store",
      partialize: (state) => ({
        walletAddress: state.walletAddress,
        notifications: state.notifications,
      }),
    }
  )
);
