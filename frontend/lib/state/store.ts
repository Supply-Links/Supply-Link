import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, TrackingEvent, RecallAlert, Certificate } from "../types";
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
  // Alert / recall state
  recalls: Record<string, RecallAlert>; // keyed by productId
  dismissedAlerts: string[]; // productIds dismissed in this session
  // Certificate / revocation state
  certificates: Certificate[];
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
  // Alert actions
  setRecall: (productId: string, alert: RecallAlert) => void;
  resolveRecall: (productId: string, resolvedBy: string) => void;
  dismissAlert: (productId: string) => void;
  clearDismissedAlerts: () => void;
  // Certificate actions
  addCertificate: (cert: Certificate) => void;
  setCertificates: (certs: Certificate[]) => void;
  revokeCertificate: (certId: string, revokedBy: string, reason: string) => void;
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
      recalls: {},
      dismissedAlerts: [],
      certificates: [],
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
      // Alert actions
      setRecall: (productId, alert) =>
        set((state) => ({
          recalls: { ...state.recalls, [productId]: alert },
          // Also update the product's recall field
          products: state.products.map((p) =>
            p.id === productId ? { ...p, recall: alert } : p
          ),
        })),
      resolveRecall: (productId, resolvedBy) =>
        set((state) => {
          const existing = state.recalls[productId];
          if (!existing) return state;
          const resolved = {
            ...existing,
            status: "RESOLVED" as const,
            resolvedAt: Date.now(),
            resolvedBy,
          };
          return {
            recalls: { ...state.recalls, [productId]: resolved },
            products: state.products.map((p) =>
              p.id === productId ? { ...p, recall: resolved } : p
            ),
          };
        }),
      dismissAlert: (productId) =>
        set((state) => ({
          dismissedAlerts: [...state.dismissedAlerts, productId],
        })),
      clearDismissedAlerts: () => set({ dismissedAlerts: [] }),
      // Certificate actions
      addCertificate: (cert) =>
        set((state) => ({ certificates: [...state.certificates, cert] })),
      setCertificates: (certs) => set({ certificates: certs }),
      revokeCertificate: (certId, revokedBy, reason) =>
        set((state) => ({
          certificates: state.certificates.map((c) =>
            c.id === certId
              ? {
                  ...c,
                  status: "REVOKED" as const,
                  revokedAt: Date.now(),
                  revokedBy,
                  revocationReason: reason,
                }
              : c
          ),
        })),
    }),
    {
      name: "supply-link-store",
      partialize: (state) => ({
        walletAddress: state.walletAddress,
      }),
    }
  )
);
