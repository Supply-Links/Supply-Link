import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, TrackingEvent, InsuranceCoverage, ClaimProof, ReadAccessLog } from "../types";
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
  /** Insurance coverage keyed by productId */
  insuranceCoverage: Record<string, InsuranceCoverage>;
  /** Claim proofs keyed by productId */
  claimProofs: Record<string, ClaimProof[]>;
  /** Read-access audit logs keyed by productId */
  readAccessLogs: Record<string, ReadAccessLog[]>;
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
  /** Store insurance coverage for a product. */
  setInsuranceCoverage: (productId: string, coverage: InsuranceCoverage) => void;
  /** Store claim proofs for a product. */
  setClaimProofs: (productId: string, proofs: ClaimProof[]) => void;
  /** Append a single claim proof to a product's list. */
  addClaimProof: (productId: string, proof: ClaimProof) => void;
  /** Store read-access logs for a product. */
  setReadAccessLogs: (productId: string, logs: ReadAccessLog[]) => void;
  /** Append a single read-access log entry. */
  addReadAccessLog: (productId: string, log: ReadAccessLog) => void;
  disconnect: () => void;
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
      insuranceCoverage: {},
      claimProofs: {},
      readAccessLogs: {},
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
      setInsuranceCoverage: (productId, coverage) =>
        set((state) => ({
          insuranceCoverage: { ...state.insuranceCoverage, [productId]: coverage },
        })),
      setClaimProofs: (productId, proofs) =>
        set((state) => ({
          claimProofs: { ...state.claimProofs, [productId]: proofs },
        })),
      addClaimProof: (productId, proof) =>
        set((state) => ({
          claimProofs: {
            ...state.claimProofs,
            [productId]: [...(state.claimProofs[productId] ?? []), proof],
          },
        })),
      setReadAccessLogs: (productId, logs) =>
        set((state) => ({
          readAccessLogs: { ...state.readAccessLogs, [productId]: logs },
        })),
      addReadAccessLog: (productId, log) =>
        set((state) => ({
          readAccessLogs: {
            ...state.readAccessLogs,
            [productId]: [...(state.readAccessLogs[productId] ?? []), log],
          },
        })),
      disconnect: () =>
        set({
          walletAddress: null,
          products: [],
          events: [],
          lastFetched: null,
          productPage: 0,
          eventPage: 0,
          insuranceCoverage: {},
          claimProofs: {},
          readAccessLogs: {},
        }),
    }),
    {
      name: "supply-link-store",
      partialize: (state) => ({
        walletAddress: state.walletAddress,
      }),
    }
  )
);
