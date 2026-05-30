"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldCheck, ShieldX, ShieldAlert, Plus, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Certificate } from "@/lib/types";
import { useStore } from "@/lib/state/store";
import { useToast } from "@/lib/hooks/useToast";
import { contractClient } from "@/lib/stellar/contract";

// ── Certificate status badge ──────────────────────────────────────────────────

function CertStatusBadge({ status }: { status: Certificate["status"] }) {
  if (status === "VALID") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
        <ShieldCheck size={12} aria-hidden="true" />
        Valid
      </span>
    );
  }
  if (status === "REVOKED") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
        <ShieldX size={12} aria-hidden="true" />
        Revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
      <ShieldAlert size={12} aria-hidden="true" />
      Expired
    </span>
  );
}

// ── Revoke certificate form ───────────────────────────────────────────────────

const revokeSchema = z.object({
  reason: z.string().min(5, "Reason must be at least 5 characters"),
});
type RevokeFormValues = z.infer<typeof revokeSchema>;

interface RevokeCertDialogProps {
  cert: Certificate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RevokeCertDialog({ cert, open, onOpenChange }: RevokeCertDialogProps) {
  const { walletAddress, revokeCertificate } = useStore();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RevokeFormValues>({ resolver: zodResolver(revokeSchema) });

  async function onSubmit(values: RevokeFormValues) {
    if (!walletAddress) {
      toast.error("Wallet not connected");
      return;
    }
    setPending(true);
    const toastId = toast.loading("Revoking certificate on-chain…");
    try {
      const txHash = await contractClient.revokeCertificate(
        cert.id,
        walletAddress,
        values.reason
      );
      revokeCertificate(cert.id, walletAddress, values.reason);
      toast.dismiss(toastId);
      toast.success("Certificate revoked", txHash);
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        "Failed to revoke certificate",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-[var(--foreground)]">
              Revoke Certificate
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-[var(--muted-bg)] text-[var(--muted)]" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <p className="text-sm text-[var(--muted)] mb-4">
            Revoking <span className="font-semibold text-[var(--foreground)]">{cert.certType}</span>{" "}
            certificate <span className="font-mono text-xs">{cert.id}</span>. This action is
            recorded on-chain and cannot be undone.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                htmlFor="revoke-reason"
                className="block text-sm font-medium text-[var(--foreground)] mb-1"
              >
                Revocation Reason
              </label>
              <textarea
                id="revoke-reason"
                rows={3}
                placeholder="Explain why this certificate is being revoked…"
                className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                {...register("reason")}
              />
              {errors.reason && (
                <p className="text-xs text-red-500 mt-1">{errors.reason.message}</p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)]"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 font-medium"
              >
                {pending ? "Revoking…" : "Revoke Certificate"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Issue certificate form ────────────────────────────────────────────────────

const issueSchema = z.object({
  certId: z.string().min(3, "Certificate ID is required"),
  certType: z.string().min(2, "Certificate type is required"),
  expiresAt: z.string().optional(),
  metadata: z.string().optional(),
});
type IssueFormValues = z.infer<typeof issueSchema>;

const CERT_TYPES = ["ORGANIC", "FAIR_TRADE", "ISO_9001", "HALAL", "KOSHER", "NON_GMO", "CUSTOM"];

interface IssueCertDialogProps {
  productId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function IssueCertDialog({ productId, open, onOpenChange }: IssueCertDialogProps) {
  const { walletAddress, addCertificate } = useStore();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<IssueFormValues>({
    defaultValues: {
      certId: `cert-${crypto.randomUUID().slice(0, 8)}`,
      certType: "ORGANIC",
      metadata: "{}",
    },
  });

  async function onSubmit(values: IssueFormValues) {
    if (!walletAddress) {
      toast.error("Wallet not connected");
      return;
    }
    setPending(true);
    const toastId = toast.loading("Issuing certificate on-chain…");
    try {
      const expiresAt = values.expiresAt
        ? new Date(values.expiresAt).getTime()
        : 0;

      const txHash = await contractClient.issueCertificate(
        values.certId,
        productId,
        walletAddress,
        values.certType,
        expiresAt,
        values.metadata || "{}"
      );

      addCertificate({
        id: values.certId,
        productId,
        certType: values.certType,
        issuedBy: walletAddress,
        issuedAt: Date.now(),
        expiresAt: expiresAt || undefined,
        metadata: values.metadata || "{}",
        status: "VALID",
      });

      toast.dismiss(toastId);
      toast.success(`Certificate "${values.certType}" issued`, txHash);
      reset({ certId: `cert-${crypto.randomUUID().slice(0, 8)}`, certType: "ORGANIC", metadata: "{}" });
      onOpenChange(false);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(
        "Failed to issue certificate",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl p-6 focus:outline-none">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-[var(--foreground)]">
              Issue Certificate
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded hover:bg-[var(--muted-bg)] text-[var(--muted)]" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Certificate ID
              </label>
              <input
                type="text"
                className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                {...register("certId")}
              />
              {errors.certId && (
                <p className="text-xs text-red-500 mt-1">{errors.certId.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Certificate Type
              </label>
              <select
                className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                {...register("certType")}
              >
                {CERT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Expiry Date (optional)
              </label>
              <input
                type="date"
                className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                {...register("expiresAt")}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                Metadata (JSON)
              </label>
              <textarea
                rows={2}
                placeholder='{"issuer": "Certifying Body", "standard": "EU Organic"}'
                className="w-full border border-[var(--card-border)] bg-[var(--background)] text-[var(--foreground)] rounded-md p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                {...register("metadata")}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)]"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 text-sm rounded-md bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 disabled:opacity-50 font-medium"
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

// ── Main CertificatePanel ─────────────────────────────────────────────────────

interface CertificatePanelProps {
  productId: string;
  /** When true, shows issue/revoke actions (owner/actor view). */
  editable?: boolean;
}

export function CertificatePanel({ productId, editable = false }: CertificatePanelProps) {
  const { certificates } = useStore();
  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);

  const productCerts = certificates.filter((c) => c.productId === productId);

  return (
    <div>
      {productCerts.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No certificates issued for this product.</p>
      ) : (
        <ul className="space-y-3">
          {productCerts.map((cert) => (
            <li
              key={cert.id}
              className={`rounded-lg border p-4 ${
                cert.status === "REVOKED"
                  ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30"
                  : "border-[var(--card-border)] bg-[var(--background)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-[var(--foreground)]">
                      {cert.certType}
                    </span>
                    <CertStatusBadge status={cert.status} />
                  </div>

                  <p className="text-xs font-mono text-[var(--muted)] truncate">
                    ID: {cert.id}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    Issued: {new Date(cert.issuedAt).toLocaleDateString()}
                    {cert.expiresAt
                      ? ` · Expires: ${new Date(cert.expiresAt).toLocaleDateString()}`
                      : ""}
                  </p>
                  <p className="text-xs font-mono text-[var(--muted)] mt-0.5 truncate">
                    By: {cert.issuedBy}
                  </p>

                  {cert.status === "REVOKED" && cert.revocationReason && (
                    <div className="mt-2 text-xs text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 rounded px-2 py-1">
                      <span className="font-semibold">Revocation reason:</span>{" "}
                      {cert.revocationReason}
                      {cert.revokedAt && (
                        <span className="ml-1 text-red-500">
                          ({new Date(cert.revokedAt).toLocaleDateString()})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {editable && cert.status === "VALID" && (
                  <button
                    onClick={() => setRevokeTarget(cert)}
                    className="flex-shrink-0 text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <button
          onClick={() => setShowIssueForm(true)}
          className="mt-4 flex items-center gap-1.5 text-sm text-[var(--primary)] hover:underline"
        >
          <Plus size={14} aria-hidden="true" />
          Issue New Certificate
        </button>
      )}

      {/* Revoke dialog */}
      {revokeTarget && (
        <RevokeCertDialog
          cert={revokeTarget}
          open={!!revokeTarget}
          onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        />
      )}

      {/* Issue dialog */}
      <IssueCertDialog
        productId={productId}
        open={showIssueForm}
        onOpenChange={setShowIssueForm}
      />
    </div>
  );
}
