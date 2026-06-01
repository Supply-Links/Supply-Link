import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, TrackingEvent, RecallAlert, Certificate, RevocationRecord } from "../types";
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
  // Alert state
  recallAlerts: RecallAlert[];
  // Certificate / revocation state
  certificates: Certificate[];
  revocations: RevocationRecord[];
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
  addRecallAlert: (alert: RecallAlert) => void;
  resolveRecallAlert: (productId: string) => void;
  setRecallAlerts: (alerts: RecallAlert[]) => void;
  getActiveAlertForProduct: (productId: string) => RecallAlert | undefined;
  // Certificate / revocation actions
  addCertificate: (cert: Certificate) => void;
  setCertificates: (certs: Certificate[]) => void;
  addRevocation: (record: RevocationRecord) => void;
  setRevocations: (records: RevocationRecord[]) => void;
  revokeCertificateInStore: (certId: string, record: RevocationRecord) => void;
}

export const useStore = create<SupplyLinkStore>()(
  persist(
    (set, get) => ({
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
      recallAlerts: [],
      certificates: [],
      revocations: [],
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
      addRecallAlert: (alert) =>
        set((state) => ({
          // Replace existing alert for same product, then prepend new one
          recallAlerts: [
            alert,
            ...state.recallAlerts.filter((a) => a.productId !== alert.productId),
          ],
        })),
      resolveRecallAlert: (productId) =>
        set((state) => ({
          recallAlerts: state.recallAlerts.map((a) =>
            a.productId === productId ? { ...a, active: false } : a
          ),
        })),
      setRecallAlerts: (alerts) => set({ recallAlerts: alerts }),
      getActiveAlertForProduct: (productId) =>
        get().recallAlerts.find((a) => a.productId === productId && a.active),
      // Certificate / revocation actions
      addCertificate: (cert) =>
        set((state) => ({ certificates: [...state.certificates, cert] })),
      setCertificates: (certs) => set({ certificates: certs }),
      addRevocation: (record) =>
        set((state) => ({ revocations: [...state.revocations, record] })),
      setRevocations: (records) => set({ revocations: records }),
      revokeCertificateInStore: (certId, record) =>
        set((state) => ({
          certificates: state.certificates.map((c) =>
            c.certId === certId ? { ...c, revoked: true } : c
          ),
          revocations: [...state.revocations, record],
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
