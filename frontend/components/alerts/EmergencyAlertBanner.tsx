"use client";

import { useState } from "react";
import { AlertTriangle, X, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import type { RecallAlert } from "@/lib/types";
import { severityStyles, formatSeverity } from "@/lib/alerts/notify";

interface EmergencyAlertBannerProps {
  alert: RecallAlert;
  /** Show dismiss button (for dashboard/list views). Defaults to false. */
  dismissible?: boolean;
  /** Show resolve action (only for product owners). */
  onResolve?: () => void;
  onDismiss?: () => void;
}

export function EmergencyAlertBanner({
  alert,
  dismissible = false,
  onResolve,
  onDismiss,
}: EmergencyAlertBannerProps) {
  const [expanded, setExpanded] = useState(alert.severity === "CRITICAL");

  if (alert.status === "RESOLVED") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 text-sm text-green-800 dark:text-green-200">
        <CheckCircle size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
        <span>
          Previous recall resolved on{" "}
          {alert.resolvedAt
            ? new Date(alert.resolvedAt).toLocaleString()
            : "—"}
        </span>
      </div>
    );
  }

  const styles = severityStyles(alert.severity);
  const isCritical = alert.severity === "CRITICAL";

  return (
    <div
      role="alert"
      aria-live={isCritical ? "assertive" : "polite"}
      className={`rounded-xl border-2 ${styles.border} ${styles.banner} overflow-hidden`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle
          size={20}
          className={`${styles.icon} flex-shrink-0 mt-0.5 ${isCritical ? "animate-pulse" : ""}`}
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${styles.badge}`}
            >
              {formatSeverity(alert.severity)} RECALL
            </span>
            <span className="text-xs text-[var(--muted)]">
              Issued {new Date(alert.issuedAt).toLocaleString()}
            </span>
          </div>

          {/* Message — always visible for CRITICAL, collapsible otherwise */}
          {(expanded || isCritical) && (
            <p className="text-sm font-medium text-[var(--foreground)] mt-1 break-words">
              {alert.message}
            </p>
          )}

          {/* Issuer */}
          {expanded && (
            <p className="text-xs text-[var(--muted)] font-mono mt-1 truncate">
              Issued by: {alert.issuedBy}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isCritical && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              aria-label={expanded ? "Collapse alert" : "Expand alert"}
            >
              {expanded ? (
                <ChevronUp size={16} className={styles.icon} />
              ) : (
                <ChevronDown size={16} className={styles.icon} />
              )}
            </button>
          )}

          {dismissible && onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              aria-label="Dismiss alert"
            >
              <X size={16} className={styles.icon} />
            </button>
          )}
        </div>
      </div>

      {/* Resolve action footer */}
      {onResolve && (
        <div className={`px-4 py-2 border-t ${styles.border} flex justify-end`}>
          <button
            onClick={onResolve}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-[var(--foreground)] text-[var(--background)] hover:opacity-80 transition-opacity"
          >
            Mark as Resolved
          </button>
        </div>
      )}
    </div>
  );
}
