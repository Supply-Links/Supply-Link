'use client';

import { ShieldX, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { RevocationCheckResult } from '@/lib/services/revocationRegistry';

interface RevocationStatusBadgeProps {
  result: RevocationCheckResult;
  /** Show the revocation reason if available. */
  showReason?: boolean;
  /** Compact mode — icon only with tooltip. */
  compact?: boolean;
}

/**
 * Displays the revocation status of a certificate or attestation.
 * Shows a green "Valid" badge when not revoked, or a red "Revoked" badge
 * with optional reason when revoked.
 */
export function RevocationStatusBadge({
  result,
  showReason = false,
  compact = false,
}: RevocationStatusBadgeProps) {
  if (result.revoked && result.entry) {
    const revokedAt = new Date(result.entry.revokedAt).toLocaleDateString();

    if (compact) {
      return (
        <span
          title={`Revoked on ${revokedAt}${result.entry.reason ? `: ${result.entry.reason}` : ''}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
        >
          <ShieldX size={11} aria-hidden="true" />
          Revoked
        </span>
      );
    }

    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
          <ShieldX size={12} aria-hidden="true" />
          Revoked
        </span>
        <p className="text-xs text-red-600 dark:text-red-400">
          Revoked on {revokedAt}
          {showReason && result.entry.reason && (
            <> — {result.entry.reason}</>
          )}
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <span
        title="Valid — not revoked"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
      >
        <ShieldCheck size={11} aria-hidden="true" />
        Valid
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
      <ShieldCheck size={12} aria-hidden="true" />
      Valid
    </span>
  );
}

// ── Revocation notice panel ───────────────────────────────────────────────────

interface RevocationNoticePanelProps {
  subjectId: string;
  subjectLabel: string;
  result: RevocationCheckResult;
}

/**
 * Full-width notice panel shown when a credential has been revoked.
 * Renders nothing when the credential is valid.
 */
export function RevocationNoticePanel({
  subjectId,
  subjectLabel,
  result,
}: RevocationNoticePanelProps) {
  if (!result.revoked || !result.entry) return null;

  const revokedAt = new Date(result.entry.revokedAt).toLocaleString();

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 rounded-lg border border-red-500 bg-red-50 px-4 py-3 text-red-800 dark:border-red-400 dark:bg-red-950 dark:text-red-200"
    >
      <ShieldAlert
        size={18}
        className="shrink-0 mt-0.5 text-red-600 dark:text-red-400"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Credential Revoked</p>
        <p className="text-sm mt-0.5">
          <span className="font-medium">{subjectLabel}</span> has been revoked and is no longer
          valid for verification purposes.
        </p>
        <div className="mt-1.5 text-xs space-y-0.5 text-red-700 dark:text-red-300">
          <p>
            <span className="font-medium">Revoked:</span> {revokedAt}
          </p>
          {result.entry.reason && (
            <p>
              <span className="font-medium">Reason:</span> {result.entry.reason}
            </p>
          )}
          <p>
            <span className="font-medium">Revoked by:</span>{' '}
            <span className="font-mono">{result.entry.revokedBy}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default RevocationStatusBadge;
