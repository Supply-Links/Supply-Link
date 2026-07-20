"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import { Plus, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOCK_PRODUCTS, getEventsByProductId, addEvent } from "@/lib/mock/products";
import type { TrackingEvent } from "@/lib/types";
import { EventTimeline } from "@/components/tracking/EventTimeline";
import { EventTimelineSkeleton } from "@/components/tracking/EventTimelineSkeleton";
import { AddEventModal } from "@/components/tracking/AddEventModal";

export default function TrackingPage() {
  const [selectedId, setSelectedId] = useState(MOCK_PRODUCTS[0]?.id ?? "");
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    const timer = setTimeout(() => {
      setEvents(getEventsByProductId(selectedId));
      setLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [selectedId]);

  function handleAddEvent(event: TrackingEvent) {
    setEvents((prev: TrackingEvent[]) => [...prev, event]);
    addEvent(event);
  }

  const selectedProduct = MOCK_PRODUCTS.find((p) => p.id === selectedId);

  return (
    <div className="p-6 max-w-2xl mx-auto" data-testid="tracking-page">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Tracking</h1>
        <button
          onClick={() => setShowModal(true)}
          disabled={!selectedId}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 disabled:opacity-40 transition-opacity"
          data-testid="add-event-button"
        >
          <Plus size={15} />
          Add Event
        </button>
      </div>

      {/* Product selector */}
      <div className="mb-6" data-testid="product-selector">
        <label className="text-xs text-[var(--muted)] mb-1.5 block">Select Product</label>
        <select
          value={selectedId}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedId(e.target.value)}
          className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          data-testid="tracking-product-select"
        >
          {MOCK_PRODUCTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.id}
            </option>
          ))}
        </select>
      </div>

      {/* Product summary */}
      {selectedProduct && (
        <div className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl px-4 py-3 mb-6 flex items-center justify-between" data-testid="product-summary">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">{selectedProduct.name}</p>
            <p className="text-xs text-[var(--muted)]">Origin: {selectedProduct.origin}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selectedProduct.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {selectedProduct.active ? "Active" : "Inactive"}
          </span>
          <Link
            href={`/${locale}/verify/${selectedId}`}
            className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            data-testid="tracking-verify-link"
          >
            <ExternalLink size={12} />
            Verify
          </Link>
        </div>
      )}

      {/* Timeline */}
      <div className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-5">
          Event History
          {!loading && <span className="ml-2 text-[var(--muted)] font-normal">({events.length})</span>}
        </h2>
        {loading ? <EventTimelineSkeleton /> : <EventTimeline events={events} />}
      </div>

      {showModal && selectedId && (
        <AddEventModal
          productId={selectedId}
          onClose={() => setShowModal(false)}
          onAdd={handleAddEvent}
        />
      )}
    </div>
  );
}
