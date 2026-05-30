"use client";

import { useState } from "react";
import type { TrackingEvent, EventType } from "@/lib/types";
import { ChevronDown, ChevronUp, ArchiveX } from "lucide-react";

const EVENT_LABELS: Record<EventType, string> = {
  HARVEST: "Harvest",
  PROCESSING: "Processing",
  SHIPPING: "Shipping",
  RETAIL: "Retail",
};

const EVENT_BADGE: Record<EventType, string> = {
  HARVEST: "bg-green-100 text-green-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  SHIPPING: "bg-yellow-100 text-yellow-800",
  RETAIL: "bg-purple-100 text-purple-700",
};

function MetadataViewer({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || Object.keys(parsed).length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? "Hide" : "Show"} metadata
      </button>
      {open && (
        <pre className="mt-1 text-xs bg-[var(--muted-bg)] text-[var(--muted)] rounded-md px-3 py-2 overflow-x-auto">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )}
    </div>
  );
}

interface ArchivedEventsViewerProps {
  events: TrackingEvent[];
}

/**
 * Read-only viewer for archived events.
 * Collapsed by default — expands on demand to keep the UI clean.
 * Archived events are shown with a muted style and an "Archived" badge
 * to make their status immediately clear.
 */
export function ArchivedEventsViewer({ events }: ArchivedEventsViewerProps) {
  const [open, setOpen] = useState(false);

  if (events.length === 0) return null;

  return (
    <div className="mt-4 border border-amber-200 dark:border-amber-900 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-950/30 text-sm font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <ArchiveX size={15} />
          Archived Events ({events.length})
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open && (
        <div className="px-4 py-4 bg-[var(--card)]">
          <p className="text-xs text-[var(--muted)] mb-4">
            These events have been archived for retention. They are read-only and preserved for auditing purposes.
          </p>
          <ol className="relative border-l border-amber-200 dark:border-amber-800 ml-3 space-y-6">
            {events.map((event, i) => (
              <li key={i} className="ml-6 opacity-75">
                <span className="absolute -left-2 mt-1.5 h-4 w-4 rounded-full border-2 border-[var(--background)] bg-amber-400" />
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${EVENT_BADGE[event.eventType]}`}>
                    {EVENT_LABELS[event.eventType]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 font-medium">
                    Archived
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-[var(--foreground)]">{event.location}</p>
                <p className="text-xs font-mono text-[var(--muted)] mt-0.5">
                  {event.actor.slice(0, 8)}…{event.actor.slice(-6)}
                </p>
                {event.archivedAt && event.archivedAt > 0 && (
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Archived: {new Date(event.archivedAt).toLocaleString()}
                  </p>
                )}
                <MetadataViewer raw={event.metadata} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
