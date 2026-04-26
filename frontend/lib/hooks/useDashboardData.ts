"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/state/store";
import { MOCK_PRODUCTS, MOCK_EVENTS } from "@/lib/mock/products";
import type { EventType } from "@/lib/types";

const CACHE_TTL_MS = 60_000; // 1 minute

export interface DashboardStats {
  totalProducts: number;
  totalEvents: number;
  activeProducts: number;
  recentActivity: number; // events in last 24 h
}

export interface DailyCount {
  date: string; // "MMM DD"
  count: number;
}

export interface EventTypeCount {
  name: EventType;
  value: number;
}

export function useDashboardData() {
  const { products, events, lastFetched, setProducts, setEvents, setLastFetched } =
    useStore();

  useEffect(() => {
    const now = Date.now();
    if (lastFetched && now - lastFetched < CACHE_TTL_MS) return;

    // In production this would be replaced by real Soroban RPC calls.
    setProducts(MOCK_PRODUCTS);
    setEvents(MOCK_EVENTS);
    setLastFetched(now);
  }, [lastFetched, setProducts, setEvents, setLastFetched]);

  const now = Date.now();
  const oneDayAgo = now - 86_400_000;

  const stats: DashboardStats = {
    totalProducts: products.length,
    totalEvents: events.length,
    activeProducts: products.filter((p) => p.active).length,
    recentActivity: events.filter((e) => e.timestamp > oneDayAgo).length,
  };

  // Events per day over the last 30 days
  const dailyCounts: DailyCount[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * 86_400_000);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = dayStart + 86_400_000;
    return {
      date: label,
      count: events.filter((e) => e.timestamp >= dayStart && e.timestamp < dayEnd).length,
    };
  });

  // Event type distribution
  const typeMap: Record<EventType, number> = {
    HARVEST: 0,
    PROCESSING: 0,
    SHIPPING: 0,
    RETAIL: 0,
  };
  for (const e of events) typeMap[e.eventType] = (typeMap[e.eventType] ?? 0) + 1;
  const eventTypeCounts: EventTypeCount[] = (
    Object.entries(typeMap) as [EventType, number][]
  ).map(([name, value]) => ({ name, value }));

  // Last 10 events (most recent first)
  const recentEvents = [...events]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  return { stats, dailyCounts, eventTypeCounts, recentEvents };
}
