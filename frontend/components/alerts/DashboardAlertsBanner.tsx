"use client";

import { useStore } from "@/lib/state/store";
import { EmergencyAlertBanner } from "./EmergencyAlertBanner";

/**
 * Renders all active recall alerts across all products on the dashboard.
 * Alerts can be dismissed per-session (they remain on-chain).
 */
export function DashboardAlertsBanner() {
  const { recalls, dismissedAlerts, dismissAlert } = useStore();

  const activeAlerts = Object.values(recalls).filter(
    (alert) =>
      alert.status === "ACTIVE" && !dismissedAlerts.includes(alert.productId)
  );

  if (activeAlerts.length === 0) return null;

  // Sort: CRITICAL first, then HIGH, MEDIUM, LOW
  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = [...activeAlerts].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return (
    <div className="space-y-3 mb-6" role="region" aria-label="Active recall alerts">
      <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
        Active Recall Alerts ({sorted.length})
      </h2>
      {sorted.map((alert) => (
        <EmergencyAlertBanner
          key={alert.productId}
          alert={alert}
          dismissible
          onDismiss={() => dismissAlert(alert.productId)}
        />
      ))}
    </div>
  );
}
