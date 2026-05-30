/**
 * Alert notification delivery utilities.
 * Handles webhook dispatch and in-app notification for recall/safety alerts.
 */

import type { RecallAlert, AlertSeverity } from "@/lib/types";

export interface WebhookPayload {
  event: "recall.issued" | "recall.resolved";
  alert: RecallAlert;
  timestamp: number;
}

export interface NotifyResult {
  webhookSent: boolean;
  webhookError?: string;
}

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  CRITICAL: "🚨 CRITICAL",
  HIGH: "⚠️ HIGH",
  MEDIUM: "⚡ MEDIUM",
  LOW: "ℹ️ LOW",
};

/**
 * Dispatch a recall alert to a configured webhook URL.
 * The webhook receives a JSON POST with the alert payload.
 */
export async function dispatchWebhook(
  webhookUrl: string,
  payload: WebhookPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Supply-Link-Event": payload.event,
        "X-Supply-Link-Severity": payload.alert.severity,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `Webhook responded with HTTP ${res.status}: ${res.statusText}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown webhook error",
    };
  }
}

/**
 * Propagate a recall alert through all configured channels.
 * Returns a summary of delivery results.
 */
export async function propagateAlert(
  alert: RecallAlert,
  event: WebhookPayload["event"] = "recall.issued"
): Promise<NotifyResult> {
  const result: NotifyResult = { webhookSent: false };

  const payload: WebhookPayload = {
    event,
    alert,
    timestamp: Date.now(),
  };

  // Webhook delivery
  if (alert.distribution.webhookUrl) {
    const webhookResult = await dispatchWebhook(
      alert.distribution.webhookUrl,
      payload
    );
    result.webhookSent = webhookResult.ok;
    if (!webhookResult.ok) {
      result.webhookError = webhookResult.error;
    }
  }

  return result;
}

/**
 * Format an alert severity for display.
 */
export function formatSeverity(severity: AlertSeverity): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

/**
 * Returns Tailwind CSS classes for a given severity level.
 */
export function severityStyles(severity: AlertSeverity): {
  banner: string;
  badge: string;
  icon: string;
  border: string;
} {
  switch (severity) {
    case "CRITICAL":
      return {
        banner: "bg-red-50 dark:bg-red-950",
        badge: "bg-red-600 text-white",
        icon: "text-red-600 dark:text-red-400",
        border: "border-red-300 dark:border-red-700",
      };
    case "HIGH":
      return {
        banner: "bg-orange-50 dark:bg-orange-950",
        badge: "bg-orange-500 text-white",
        icon: "text-orange-600 dark:text-orange-400",
        border: "border-orange-300 dark:border-orange-700",
      };
    case "MEDIUM":
      return {
        banner: "bg-yellow-50 dark:bg-yellow-950",
        badge: "bg-yellow-500 text-white",
        icon: "text-yellow-600 dark:text-yellow-400",
        border: "border-yellow-300 dark:border-yellow-700",
      };
    case "LOW":
    default:
      return {
        banner: "bg-blue-50 dark:bg-blue-950",
        badge: "bg-blue-500 text-white",
        icon: "text-blue-600 dark:text-blue-400",
        border: "border-blue-300 dark:border-blue-700",
      };
  }
}
