import type { TrackingEvent } from "@/lib/types";

export function exportToJSON(events: TrackingEvent[]): string {
  return JSON.stringify(events, null, 2);
}

export function exportToCSV(events: TrackingEvent[]): string {
  if (events.length === 0) return "";
  const headers = ["productId", "location", "actor", "timestamp", "eventType", "metadata"];
  const rows = events.map((e) =>
    headers.map((h) => JSON.stringify(String(e[h as keyof TrackingEvent] ?? ""))).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
