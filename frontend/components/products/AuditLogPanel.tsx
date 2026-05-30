"use client";

import { useState, useEffect } from "react";
import { ClipboardList, RefreshCw, Lock, Eye } from "lucide-react";
import { useStore } from "@/lib/state/store";
import { getReadLogs, logReadAccess } from "@/lib/stellar/client";
import { getReadLogsByProductId } from "@/lib/mock/products";
import type { ReadAccessLog } from "@/lib/types";
import { toast } from "sonner";

/** Human-readable labels for known purpose codes. */
const PURPOSE_LABELS: Record<string, string> = {
  INSURANCE_VERIFY: "Insurance Verification",
  AUDIT: "Audit",
  OWNERSHIP_CHECK: "Ownership Check",
  CLAIM_REVIEW: "Claim Review",
  COMPLIANCE: "Compliance Review",
};

function purposeLabel(purpose: string): string {
  return PURPOSE_LABELS[purpose] ?? purpose;
}

const PURPOSE_COLORS: Record<string, string> = {
  INSURANCE_VERIFY: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-950 dark:border-violet-800",
  AUDIT: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950 dark:border-blue-800",
  OWNERSHIP_CHECK: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-800",
  CLAIM_REVIEW: "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950 dark:border-green-800",
  COMPLIANCE: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950 dark:border-red-800",
};

function purposeColor(purpose: string): string {
  return (
    PURPOSE_COLORS[purpose] ??
    "text-[var(--muted)] bg-[var(--muted-bg)] border-[var(--card-border)]"
  );
}

interface AuditLogPanelProps {
  productId: string;
  /** Stellar address of the product owner — only the owner can view logs. */
  ownerAddress: string;
}

export function AuditLogPanel({ productId, ownerAddress }: AuditLogPanelProps) {
  const { walletAddress, readAccessLogs, setReadAccessLogs } = useStore();

  const [loading, setLoading] = useState(false);
  const [loggingAccess, setLoggingAccess] = useState(false);
  const [selectedPurpose, setSelectedPurpose] = useState("AUDIT");

  const logs: ReadAccessLog[] = readAccessLogs[productId] ?? [];
  const isOwner = walletAddress === ownerAddress;

  async function fetchLogs() {
    if (!walletAddress) return;
    setLoading(true);
    try {
      const onChainLogs = await getReadLogs(productId, walletAddress);
      if (onChainLogs.length > 0) {
        setReadAccessLogs(productId, onChainLogs);
      } else {
        // Fall back to mock data for demonstration
        const mockLogs = getReadLogsByProductId(productId);
        setReadAccessLogs(productId, mockLogs);
      }
    } catch {
      // Contract not reachable — fall back to mock data silently
      const mockLogs = getReadLogsByProductId(productId);
      setReadAccessLogs(productId, mockLogs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOwner) {
      fetchLogs();
    } else {
      // Non-owners see mock data for demonstration
      const mockLogs = getReadLogsByProductId(productId);
      setReadAccessLogs(productId, mockLogs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, walletAddress]);

  async function handleLogAccess() {
    if (!walletAddress) {
      toast.error("Wallet not connected", { description: "Connect your Freighter wallet first." });
      return;
    }
    setLoggingAccess(true);
    const toastId = toast.loading("Recording read access on-chain…");
    try {
      await logReadAccess(productId, walletAddress, selectedPurpose);
      const newLog: ReadAccessLog = {
        productId,
        accessor: walletAddress,
        timestamp: Date.now(),
        purpose: selectedPurpose,
      };
      setReadAccessLogs(productId, [...logs, newLog]);
      toast.success("Access logged", { id: toastId, description: "Your read access has been recorded on-chain." });
    } catch {
      toast.error("Transaction failed", { id: toastId, description: "Could not log access. Please try again." });
    } finally {
      setLoggingAccess(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-violet-500" />
          <span className="text-sm font-semibold text-[var(--foreground)]">Read Access Audit Log</span>
          <span className="text-xs font-normal text-[var(--muted)] bg-[var(--muted-bg)] px-1.5 py-0.5 rounded-full">
            {logs.length} {logs.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        {isOwner && (
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)] font-medium transition-colors disabled:opacity-60"
            aria-label="Refresh audit logs"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        )}
      </div>

      {/* Privacy notice */}
      <div className="flex items-start gap-2 text-xs text-[var(--muted)] bg-[var(--muted-bg)] rounded-lg px-3 py-2">
        <Lock size={12} className="mt-0.5 shrink-0" />
        <span>
          Access logs are stored on-chain and are immutable. Only the product owner can query the full
          audit trail. Accessor addresses are recorded but not linked to personal identity.
        </span>
      </div>

      {/* Log access action */}
      {walletAddress && (
        <div className="flex items-center gap-2">
          <select
            value={selectedPurpose}
            onChange={(e) => setSelectedPurpose(e.target.value)}
            className="flex-1 border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="Select access purpose"
          >
            {Object.entries(PURPOSE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleLogAccess}
            disabled={loggingAccess}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)] font-medium transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            <Eye size={14} />
            Log My Access
          </button>
        </div>
      )}

      {/* Log entries */}
      {!isOwner && logs.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          Only the product owner can view the full audit trail.
        </p>
      )}

      {logs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]">
          <table className="w-full text-sm" role="table" aria-label="Read access audit log">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--muted-bg)]">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                  Accessor
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                  Purpose
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody>
              {[...logs].reverse().map((log, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--muted-bg)] transition-colors"
                >
                  <td className="px-4 py-3">
                    <span
                      className="font-mono text-xs text-[var(--foreground)]"
                      title={log.accessor}
                    >
                      {log.accessor.slice(0, 8)}…{log.accessor.slice(-6)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${purposeColor(log.purpose)}`}
                    >
                      {purposeLabel(log.purpose)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
