"use client";

import { useState } from "react";
import { AlertOctagon, Plus, CheckCircle, Loader2 } from "lucide-react";
import { RecallAlertBanner } from "./RecallAlertBanner";
import { IssueRecallForm } from "./IssueRecallForm";
import { useStore } from "@/lib/state/store";
import { useToast } from "@/lib/hooks/useToast";
import { contractClient } from "@/lib/stellar/contract";
import type { RecallAlert } from "@/lib/types";

interface AlertsPanelProps {
  productId: string;
  /** Alerts to display (active + history). */
  alerts: RecallAlert[];
}

export function AlertsPanel({ productId, alerts }: AlertsPanelProps) {
  const { walletAddress, resolveRecallAlert } = useStore();
  const toast = useToast();
  const [issueOpen, setIssueOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  const activeAlert = alerts.find((a) => a.active);
  const history = alerts.filter((a) => !a.active);

  async function handleResolve() {
    if (!walletAddress) {
      toast.error("Wallet not connected");
      return;
    }
    setResolving(true);
    const toastId = toast.loading("Resolving alert on-chain…");
    try {
      const txHash = await contractClient.resolveRecallAlert(productId, walletAddress, walletAddress);
      resolveRecallAlert(productId);
      toast.dismiss(toastId);
      toast.success("Alert resolved", txHash);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Failed to resolve alert", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Active alert */}
      {activeAlert ? (
        <div>
          <RecallAlertBanner alert={activeAlert} />
          {walletAddress && (
            <button
              onClick={handleResolve}
              disabled={resolving}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors disabled:opacity-50"
            >
              {resolving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCircle size={14} />
              )}
              Mark as Resolved
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">No active alerts for this product.</p>
      )}

      {/* Issue new alert button */}
      {walletAddress && (
        <button
          onClick={() => setIssueOpen(true)}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors self-start"
        >
          <Plus size={14} />
          Issue Recall Alert
        </button>
      )}

      {/* Alert history */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">
            Alert History
          </p>
          <div className="space-y-2">
            {history.map((alert, i) => (
              <div key={i} className="opacity-60">
                <RecallAlertBanner alert={{ ...alert, active: true }} />
                <p className="text-xs text-[var(--muted)] mt-1 ml-1">Resolved</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <IssueRecallForm
        productId={productId}
        open={issueOpen}
        onOpenChange={setIssueOpen}
      />
    </div>
  );
}
