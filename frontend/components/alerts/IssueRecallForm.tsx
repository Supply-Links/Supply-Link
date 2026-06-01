"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Dialog from "@radix-ui/react-dialog";
import { X, AlertOctagon } from "lucide-react";
import { useStore } from "@/lib/state/store";
import { useToast } from "@/lib/hooks/useToast";
import { contractClient } from "@/lib/stellar/contract";
import type { AlertSeverity, RecallAlert } from "@/lib/types";

const SEVERITY_OPTIONS: { value: AlertSeverity; label: string }[] = [
  { value: "LOW", label: "Low — Advisory" },
  { value: "MEDIUM", label: "Medium — Safety Notice" },
  { value: "HIGH", label: "High — Urgent Alert" },
  { value: "CRITICAL", label: "Critical — Immediate Recall" },
];

const CHANNEL_OPTIONS = ["banner", "email", "webhook"] as const;

const schema = z.object({
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  channels: z.array(z.string()).min(1, "Select at least one channel"),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued?: (alert: RecallAlert) => void;
}

export function IssueRecallForm({ productId, open, onOpenChange, onIssued }: Props) {
  const { walletAddress, addRecallAlert } = useStore();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      severity: "HIGH",
      channels: ["banner"],
    },
  });

  const selectedChannels = watch("channels") ?? [];

  function toggleChannel(ch: string) {
    const current = selectedChannels;
    if (current.includes(ch)) {
      setValue("channels", current.filter((c) => c !== ch));
    } else {
      setValue("channels", [...current, ch]);
    }
  }

  async function onSubmit(values: FormValues) {
    if (!walletAddress) {
      toast.error("Wallet not connected", "Connect your Freighter wallet first.");
      return;
    }

    setPending(true);
    const toastId = toast.loading("Issuing recall alert on-chain…");

    try {
      const txHash = await contractClient.issueRecallAlert(
        productId,
        walletAddress,
        values.severity,
        values.title,
        values.description,
        values.channels.join(","),
        walletAddress
      );

      const alert: RecallAlert = {
        productId,
        issuer: walletAddress,
        severity: values.severity,
        title: values.title,
        description: values.description,
        timestamp: Date.now(),
        channels: values.channels.join(","),
        active: true,
      };

      addRecallAlert(alert);
      onIssued?.(alert);

      toast.dismiss(toastId);
      toast.success("Recall alert issued", txHash);
      reset({ severity: "HIGH", channels: ["banner"] });
      onOpenChange(false);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Failed to issue alert", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-[var(--background)] border border-[var(--card-border)] rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <AlertOctagon size={20} className="text-red-500" aria-hidden="true" />
              <Dialog.Title className="text-lg font-semibold">Issue Recall Alert</Dialog.Title>
            </div>
            <Dialog.Close className="p-1 rounded-lg hover:bg-[var(--muted-bg)] transition-colors">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* Severity */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Severity</label>
              <select
                {...register("severity")}
                className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {SEVERITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.severity && <p className="text-xs text-red-500">{errors.severity.message}</p>}
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Alert Title</label>
              <input
                {...register("title")}
                placeholder="e.g. Contamination Risk — Batch #XYZ"
                className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Description</label>
              <textarea
                {...register("description")}
                rows={4}
                placeholder="Describe the issue, affected batches, and required actions…"
                className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              {errors.description && (
                <p className="text-xs text-red-500">{errors.description.message}</p>
              )}
            </div>

            {/* Distribution channels */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Distribution Channels</label>
              <div className="flex gap-3 flex-wrap">
                {CHANNEL_OPTIONS.map((ch) => (
                  <label
                    key={ch}
                    className="flex items-center gap-2 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(ch)}
                      onChange={() => toggleChannel(ch)}
                      className="rounded border-[var(--card-border)] accent-red-500"
                    />
                    <span className="text-sm capitalize">{ch}</span>
                  </label>
                ))}
              </div>
              {errors.channels && (
                <p className="text-xs text-red-500">{errors.channels.message}</p>
              )}
            </div>

            <div className="flex gap-3 mt-2">
              <Dialog.Close
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium hover:bg-[var(--muted-bg)] transition-colors"
                disabled={pending}
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Issuing…" : "Issue Alert"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
