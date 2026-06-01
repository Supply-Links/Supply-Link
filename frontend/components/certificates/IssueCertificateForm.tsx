"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Award, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/state/store";
import { useToast } from "@/lib/hooks/useToast";
import { contractClient } from "@/lib/stellar/contract";
import type { Certificate } from "@/lib/types";

const CERT_TYPES = ["ORGANIC", "FAIR_TRADE", "ISO9001", "HALAL", "KOSHER", "OTHER"] as const;

const schema = z.object({
  certId: z.string().min(3, "Certificate ID is required"),
  certType: z.string().min(1, "Certificate type is required"),
  metadata: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function generateCertId() {
  return `cert-${crypto.randomUUID().slice(0, 8)}`;
}

interface Props {
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued?: (cert: Certificate) => void;
}

export function IssueCertificateForm({ productId, open, onOpenChange, onIssued }: Props) {
  const { walletAddress, addCertificate } = useStore();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { certId: generateCertId(), certType: "ORGANIC" },
  });

  async function onSubmit(values: FormValues) {
    if (!walletAddress) {
      toast.error("Wallet not connected", "Connect your Freighter wallet first.");
      return;
    }

    setPending(true);
    const toastId = toast.loading("Issuing certificate on-chain…");

    try {
      const txHash = await contractClient.issueCertificate(
        values.certId,
        productId,
        walletAddress,
        values.certType,
        values.metadata ?? "{}",
        walletAddress
      );

      const cert: Certificate = {
        certId: values.certId,
        productId,
        issuer: walletAddress,
        issuedAt: Date.now(),
        certType: values.certType,
        metadata: values.metadata ?? "{}",
        revoked: false,
      };

      addCertificate(cert);
      onIssued?.(cert);

      toast.dismiss(toastId);
      toast.success("Certificate issued", txHash);
      reset({ certId: generateCertId(), certType: "ORGANIC" });
      onOpenChange(false);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Failed to issue certificate", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--background)] border border-[var(--card-border)] rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Award size={20} className="text-violet-500" aria-hidden="true" />
              <Dialog.Title className="text-lg font-semibold">Issue Certificate</Dialog.Title>
            </div>
            <Dialog.Close className="p-1 rounded-lg hover:bg-[var(--muted-bg)] transition-colors">
              <X size={18} />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* Certificate ID */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Certificate ID</label>
              <div className="flex gap-2">
                <input
                  {...register("certId")}
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  type="button"
                  onClick={() => setValue("certId", generateCertId())}
                  className="p-2 rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] transition-colors"
                  title="Regenerate ID"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
              {errors.certId && <p className="text-xs text-red-500">{errors.certId.message}</p>}
            </div>

            {/* Certificate Type */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Certificate Type</label>
              <select
                {...register("certType")}
                className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {CERT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </select>
              {errors.certType && <p className="text-xs text-red-500">{errors.certType.message}</p>}
            </div>

            {/* Metadata */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">
                Metadata <span className="text-[var(--muted)] font-normal">(optional JSON)</span>
              </label>
              <textarea
                {...register("metadata")}
                rows={3}
                placeholder='{"body": "USDA Organic", "license": "..."}'
                className="px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--card)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
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
                className="flex-1 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? "Issuing…" : "Issue Certificate"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
