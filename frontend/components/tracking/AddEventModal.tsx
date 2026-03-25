"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { X } from "lucide-react";
import type { EventType, TrackingEvent } from "@/lib/types";

const EVENT_TYPES: EventType[] = ["HARVEST", "PROCESSING", "SHIPPING", "RETAIL"];

interface AddEventModalProps {
  productId: string;
  onClose: () => void;
  onAdd: (event: TrackingEvent) => void;
}

export function AddEventModal({ productId, onClose, onAdd }: AddEventModalProps) {
  const [eventType, setEventType] = useState<EventType>("HARVEST");
  const [location, setLocation] = useState("");
  const [metadata, setMetadata] = useState("");
  const [metaError, setMetaError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (metadata) {
      try { JSON.parse(metadata); }
      catch { setMetaError("Invalid JSON"); return; }
    }
    onAdd({
      productId,
      eventType,
      location,
      actor: "GCONNECTED_WALLET_ADDRESS",
      timestamp: Date.now(),
      metadata: metadata || "{}",
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[var(--foreground)]">Add Tracking Event</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--muted-bg)] text-[var(--muted)]">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">Event Type</label>
            <select
              value={eventType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setEventType(e.target.value as EventType)}
              className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">Location</label>
            <input
              required
              type="text"
              value={location}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)}
              placeholder="e.g. Port of Rotterdam"
              className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          <div>
            <label className="text-xs text-[var(--muted)] mb-1 block">Metadata (optional JSON)</label>
            <textarea
              value={metadata}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => { setMetadata(e.target.value); setMetaError(""); }}
              placeholder='{"key": "value"}'
              rows={3}
              className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
            {metaError && <p className="text-xs text-red-500 mt-1">{metaError}</p>}
          </div>

          <div className="flex justify-end gap-3 mt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)]">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm rounded-md bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90">
              Add Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
