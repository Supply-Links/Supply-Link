"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Dialog from "@radix-ui/react-dialog";
import { X, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/state/store";
import { useToast } from "@/lib/hooks/useToast";
import { contractClient } from "@/lib/stellar/contract";
import { propagateAlert } from "@/lib/alerts/notify";
import type { AlertSeverity, AlertDistributionSettings } from "@/lib/types";

const schema = z.object({
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  message: z.string().min(10, "Message must be at least 10 characters"),
  webhookUrl: z
    .string()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
  notifyOwner: z.boolean(),
  notifyActors: z.boolean(),
  broadcastPublic: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface IssueRecallFormProps {
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SEVERITY_OPTIONS: { value: AlertSeverity; label: string; description: string }[] = [
  { value: "LOW", label: "Low", description: "Minor issue, monitor situation" },
  { value: "MEDIUM", label: "Medium", description: "Moderate concern, notify stakeholders" },
  { value: "HIGH", label: "High", description: "Serious issue, immediate action needed" },
  { value: "CRITICAL", label: "Critical", description: "Emergency — stop distribution immediately" },
];

export function IssueRecallForm({ productId, open, onOpenChange }: IssueRecallFormProps) {
  const { walletAddress, setRecall } = useStore();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      severity: "HIGH",
      message: "",
      webhookUrl: "",
      notifyOwner: true,
      notifyActors: true,
      broadcastPublic: false,
    },
  });

  const severity = watch("severity");

  async function onSubmit(values: FormValues) {
    if (!walletAddress) {
      toast.error("Wallet not connected", "Connect your Freighter wallet first.");
      return;
    }

    setPending(true);
    const toastId = toast.loading("Issuing recall alert on-chain…");

    try {
      const txHash = await contractClient.issueRecall(
        productId,
        walletAddress,
        values.severity as AlertSeverity,
        values.message
      );

      const distribution: AlertDistributionSettings = {
        webhookUrl: values.webhookUrl || undefined,
        notifyOwner: values.notifyOwner,
        notifyActors: values.notifyActors,
        broadcastPublic: values.broadcastPublic,
      };

      const alert = {
        productId,
        severity: values.severity as AlertSeverity,
        message: values.message,
        issuedBy: walletAddress,
        issuedAt: Date.now(),
        status: "ACTIVE" as const,
        distribution,
      };

      // Update local store
      setRecall(productId, alert);

      // Propagate via configured channels
      const notifyResult = await propagateAlert(alert, "recall.issued");

      toast.dismiss(toastId);
      toast.success("Recall alert issued", txHash);

      if (notifyResult.webhookError) {
        toast.error("Webhook delivery failed", notifyResult.webhookError);
      }

      reset();
      onOpenChange(false);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        "Failed to issue recall",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setPending(false);
    }
  }

  const severityColors: Record<AlertSeverity, string> = {
    LOW: "border-blue-400 bg-blue-50 dark:bg-blue-950",
    MEDIUM: "border-yellow-400 bg-yellow-50 dark:bg-yellow-950",
    HIGH: "border-orange-400 bg-orange-50 dark:bg-orange-950",
    CRITICAL: "border-red-500 bg-red-50 dark:bg-red-950",
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500" aria-hidden="true" />
              <Dialog.Title className="text-lg font-semibold text-[var(--foreground)]">
                Issue Recall Alert
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                className="p-1 rounded hover:bg-[var(--muted-bg)] text-[var(--muted)] transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Severity */}
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                Severity Level
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SEVERITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex flex-col gap-0.5 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      severity === opt.value
                        ? severityColors[opt.value]
                        : "border-[var(--card-border)] hover:border-[var(--muted)]"
                    }`}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      {...register("severity")}
                      className="sr-only"
                    />
                    <span className="text-sm font-semibold text-[var(--foreground)]">
                      {opt.label}
                    </span>
                    <span className="text-xs text-[var(--muted)]">{opt.description}</span>
                  </label>
                ))}
              </div>
              {errors.severity && (
                <p className="text-xs text-red-500 mt-1">{errors.severity.message}</p>
              )}
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="recall-message"
                className="block text-sm font-medium text-[var(--foreground)] mb-1"
              >
                Alert Message
              </label>
              <textarea
                id="recall-message"
                rows={3}
                placeholder="Describe the safety issue or recall reason in detail…"
                className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                {...register("message")}
              />
              {errors.message && (
                <p className="text-xs text-red-500 mt-1">{errors.message.message}</p>
              )}
            </div>

            {/* Distribution settings */}
            <div className="border border-[var(--card-border)] rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-[var(--foreground)]">
                Distribution Settings
              </p>

              <div className="space-y-2">
                {[
                  { name: "notifyOwner" as const, label: "Notify product owner" },
                  { name: "notifyActors" as const, label: "Notify authorized actors" },
                  { name: "broadcastPublic" as const, label: "Broadcast publicly (verification page)" },
                ].map(({ name, label }) => (
                  <label key={name} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register(name)}
                      className="w-4 h-4 rounded border-[var(--card-border)] accent-[var(--primary)]"
                    />
                    <span className="text-sm text-[var(--foreground)]">{label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label
                  htmlFor="webhook-url"
                  className="block text-xs font-medium text-[var(--muted)] mb-1"
                >
                  Webhook URL (optional)
                </label>
                <input
                  id="webhook-url"
                  type="url"
                  placeholder="https://your-system.example.com/webhooks/recall"
                  className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  {...register("webhookUrl")}
                />
                {errors.webhookUrl && (
                  <p className="text-xs text-red-500 mt-1">{errors.webhookUrl.message}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)] transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {pending ? "Issuing…" : "Issue Recall Alert"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
