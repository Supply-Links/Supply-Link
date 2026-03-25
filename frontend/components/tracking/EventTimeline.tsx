"use client";

import { useState } from "react";
import type { TrackingEvent, EventType } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";

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

const EVENT_DOT: Record<EventType, string> = {
  HARVEST: "bg-green-500",
  PROCESSING: "bg-blue-500",
  SHIPPING: "bg-yellow-500",
  RETAIL: "bg-purple-500",
};

function MetadataViewer({ raw }: { raw: string }) {
  const [open, setOpen] = useState(false);
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || Object.keys(parsed).length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v: boolean) => !v)}
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

interface EventTimelineProps {
  events: TrackingEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] py-6 text-center">
        No events recorded for this product yet.
      </p>
    );
  }

  return (
    <ol className="relative border-l border-[var(--card-border)] ml-3 space-y-6">
      {events.map((event, i) => (
        <li key={i} className="ml-6">
          <span
            className={`absolute -left-2 mt-1.5 h-4 w-4 rounded-full border-2 border-[var(--background)] ${EVENT_DOT[event.eventType]}`}
          />
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${EVENT_BADGE[event.eventType]}`}>
              {EVENT_LABELS[event.eventType]}
            </span>
            <span className="text-xs text-[var(--muted)]">
              {new Date(event.timestamp).toLocaleString()}
            </span>
          </div>
          <p className="text-sm text-[var(--foreground)]">{event.location}</p>
          <p className="text-xs font-mono text-[var(--muted)] mt-0.5">
            {event.actor.slice(0, 8)}…{event.actor.slice(-6)}
          </p>
          <MetadataViewer raw={event.metadata} />
        </li>
      ))}
    </ol>
  );
}
