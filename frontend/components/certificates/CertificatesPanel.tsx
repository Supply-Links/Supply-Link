"use client";

import { useState } from "react";
import { Award, Plus, Loader2, ShieldOff } from "lucide-react";
import { RevocationBadge } from "./RevocationBadge";
import { IssueCertificateForm } from "./IssueCertificateForm";
import { useStore } from "@/lib/state/store";
import { useToast } from "@/lib/hooks/useToast";
import { contractClient } from "@/lib/stellar/contract";
import type { Certificate, RevocationRecord } from "@/lib/types";

interface CertificatesPanelProps {
  productId: string;
  certificates: Certificate[];
  revocations: RevocationRecord[];
}

export function CertificatesPanel({ productId, certificates, revocations }: CertificatesPanelProps) {
  const { walletAddress, revokeCertificateInStore } = useStore();
  const toast = useToast();
  const [issueOpen, setIssueOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({});
  const [showReasonFor, setShowReasonFor] = useState<string | null>(null);

  function getRevocation(certId: string): RevocationRecord | undefined {
    return revocations.find((r) => r.certId === certId);
  }

  async function handleRevoke(certId: string) {
    if (!walletAddress) {
      toast.error("Wallet not connected");
      return;
    }
    const reason = reasonInputs[certId]?.trim() || "No reason provided";
    setRevoking(certId);
    const toastId = toast.loading("Revoking certificate on-chain…");
    try {
      const txHash = await contractClient.revokeCertificate(certId, walletAddress, reason, walletAddress);
      const record: RevocationRecord = {
        certId,
        revoker: walletAddress,
        revokedAt: Date.now(),
        reason,
      };
      revokeCertificateInStore(certId, record);
      toast.dismiss(toastId);
      toast.success("Certificate revoked", txHash);
      setShowReasonFor(null);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Revocation failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRevoking(null);
    }
  }

  if (certificates.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--muted)]">No certificates issued for this product.</p>
        {walletAddress && (
          <button
            onClick={() => setIssueOpen(true)}
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] transition-colors self-start"
          >
            <Plus size={14} />
            Issue Certificate
          </button>
        )}
        <IssueCertificateForm productId={productId} open={issueOpen} onOpenChange={setIssueOpen} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="space-y-3">
        {certificates.map((cert) => {
          const revocation = getRevocation(cert.certId);
          const isRevoked = cert.revoked || !!revocation;

          return (
            <li
              key={cert.certId}
              className={`border rounded-xl p-4 transition-opacity ${
                isRevoked
                  ? "border-red-200 dark:border-red-900 opacity-80"
                  : "border-[var(--card-border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Award
                    size={16}
                    className={isRevoked ? "text-[var(--muted)]" : "text-violet-500"}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {cert.certType}
                  </span>
                </div>
                <RevocationBadge revoked={isRevoked} compact />
              </div>

              <dl className="text-xs text-[var(--muted)] space-y-0.5 mb-3">
                <div>
                  <dt className="inline font-medium">ID: </dt>
                  <dd className="inline font-mono">{cert.certId}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Issued: </dt>
                  <dd className="inline">{new Date(cert.issuedAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Issuer: </dt>
                  <dd className="inline font-mono">
                    {cert.issuer.slice(0, 8)}…{cert.issuer.slice(-6)}
                  </dd>
                </div>
              </dl>

              {/* Revocation detail */}
              {isRevoked && revocation && (
                <RevocationBadge revoked={true} revocation={revocation} />
              )}

              {/* Revoke action (only for valid certs when wallet connected) */}
              {!isRevoked && walletAddress && (
                <div className="mt-3">
                  {showReasonFor === cert.certId ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        value={reasonInputs[cert.certId] ?? ""}
                        onChange={(e) =>
                          setReasonInputs((prev) => ({ ...prev, [cert.certId]: e.target.value }))
                        }
                        placeholder="Reason for revocation…"
                        className="px-3 py-1.5 text-xs rounded-lg border border-[var(--card-border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRevoke(cert.certId)}
                          disabled={revoking === cert.certId}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                        >
                          {revoking === cert.certId ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <ShieldOff size={12} />
                          )}
                          Confirm Revoke
                        </button>
                        <button
                          onClick={() => setShowReasonFor(null)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowReasonFor(cert.certId)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <ShieldOff size={12} />
                      Revoke Certificate
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Issue new certificate */}
      {walletAddress && (
        <button
          onClick={() => setIssueOpen(true)}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] transition-colors self-start"
        >
          <Plus size={14} />
          Issue Certificate
        </button>
      )}

      <IssueCertificateForm productId={productId} open={issueOpen} onOpenChange={setIssueOpen} />
    </div>
  );
}
