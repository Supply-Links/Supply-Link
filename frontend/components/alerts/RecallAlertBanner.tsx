"use client";

import { useState } from "react";
import { AlertTriangle, AlertOctagon, Info, X, ChevronDown, ChevronUp } from "lucide-react";
import type { RecallAlert, AlertSeverity } from "@/lib/types";

interface RecallAlertBannerProps {
  alert: RecallAlert;
  /** If true, shows a dismiss button (for dashboard/list views). Product owners see a resolve button instead. */
  dismissible?: boolean;
  onDismiss?: () => void;
}

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  {
    bg: string;
    border: string;
    text: string;
    icon: React.ElementType;
    label: string;
  }
> = {
  CRITICAL: {
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-500",
    text: "text-red-700 dark:text-red-400",
    icon: AlertOctagon,
    label: "CRITICAL RECALL",
  },
  HIGH: {
    bg: "bg-orange-50 dark:bg-orange-950/40",
    border: "border-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    icon: AlertTriangle,
    label: "HIGH SEVERITY ALERT",
  },
  MEDIUM: {
    bg: "bg-yellow-50 dark:bg-yellow-950/40",
    border: "border-yellow-500",
    text: "text-yellow-700 dark:text-yellow-400",
    icon: AlertTriangle,
    label: "SAFETY NOTICE",
  },
  LOW: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-400",
    text: "text-blue-700 dark:text-blue-400",
    icon: Info,
    label: "ADVISORY",
  },
};

export function RecallAlertBanner({ alert, dismissible = false, onDismiss }: RecallAlertBannerProps) {
  const [expanded, setExpanded] = useState(alert.severity === "CRITICAL" || alert.severity === "HIGH");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !alert.active) return null;

  const config = SEVERITY_CONFIG[alert.severity];
  const Icon = config.icon;
  const issuedAt = new Date(alert.timestamp).toLocaleString();
  const channels = alert.channels.split(",").map((c) => c.trim()).filter(Boolean);

  function handleDismiss() {
    setDismissed(true);
    onDismiss?.();
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`rounded-xl border-l-4 ${config.bg} ${config.border} p-4 mb-4`}
    >
      <div className="flex items-start gap-3">
        <Icon
          size={20}
          className={`shrink-0 mt-0.5 ${config.text}`}
          aria-hidden="true"
        />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold tracking-wider ${config.text}`}>
              {config.label}
            </span>
            <span className="text-xs text-[var(--muted)]">·</span>
            <span className="text-xs text-[var(--muted)]">{issuedAt}</span>
          </div>

          {/* Title */}
          <p className={`text-sm font-semibold mt-0.5 ${config.text}`}>{alert.title}</p>

          {/* Expandable description */}
          {expanded && (
            <p className="text-sm text-[var(--foreground)] mt-1 leading-relaxed">
              {alert.description}
            </p>
          )}

          {/* Channels + expand toggle */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {channels.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-xs text-[var(--muted)]">Channels:</span>
                {channels.map((ch) => (
                  <span
                    key={ch}
                    className="text-xs px-1.5 py-0.5 rounded bg-[var(--muted-bg)] text-[var(--foreground)] font-mono"
                  >
                    {ch}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className={`flex items-center gap-1 text-xs ${config.text} hover:opacity-80 transition-opacity`}
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp size={12} /> Hide details
                </>
              ) : (
                <>
                  <ChevronDown size={12} /> Show details
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dismiss button */}
        {dismissible && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss alert"
            className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <X size={16} className={config.text} />
          </button>
        )}
      </div>
    </div>
  );
}
