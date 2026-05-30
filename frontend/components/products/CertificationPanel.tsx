"use client";

import { useState, type FormEvent, type ChangeEvent } from "react";
import type { Certification } from "@/lib/types";
import { ShieldCheck, ShieldX, Plus, ExternalLink, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/state/store";
import { useToast } from "@/lib/hooks/useToast";

const CERT_TYPE_OPTIONS = ["ORGANIC", "FAIR_TRADE", "ISO9001", "RAINFOREST_ALLIANCE", "OTHER"];

const CERT_TYPE_LABELS: Record<string, string> = {
  ORGANIC: "Organic",
  FAIR_TRADE: "Fair Trade",
  ISO9001: "ISO 9001",
  RAINFOREST_ALLIANCE: "Rainforest Alliance",
  OTHER: "Other",
};

function generateCertId() {
  return `cert-${crypto.randomUUID().slice(0, 8)}`;
}

interface CertificationPanelProps {
  productId: string;
  initialCertifications: Certification[];
}

export function CertificationPanel({ productId, initialCertifications }: CertificationPanelProps) {
  const { walletAddress } = useStore();
  const toast = useToast();
  const [certs, setCerts] = useState<Certification[]>(initialCertifications);
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);

  // Issue form state
  const [certId, setCertId] = useState(generateCertId);
  const [certType, setCertType] = useState("ORGANIC");
  const [reference, setReference] = useState("");

  async function handleIssue(e: FormEvent) {
    e.preventDefault();
    if (!walletAddress) {
      toast.error("Wallet not connected", "Connect your Freighter wallet first.");
      return;
    }
    if (!reference.trim()) {
      toast.error("Reference required", "Provide an external registry reference.");
      return;
    }

    setPending(true);
    const toastId = toast.loading("Issuing certification on-chain…");
    try {
      // TODO: replace with contractClient.issueCertification(...)
      await new Promise((r) => setTimeout(r, 1200));
      const newCert: Certification = {
        certId,
        productId,
        issuer: walletAddress,
        issuedAt: Date.now(),
        certType,
        reference,
        revoked: false,
      };
      setCerts((prev) => [...prev, newCert]);
      toast.dismiss(toastId);
      toast.success("Certification issued", certId);
      setShowForm(false);
      setCertId(generateCertId());
      setReference("");
      setCertType("ORGANIC");
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Failed to issue certification", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(false);
    }
  }

  async function handleRevoke(cert: Certification) {
    if (!walletAddress) {
      toast.error("Wallet not connected", "Connect your Freighter wallet first.");
      return;
    }
    const toastId = toast.loading("Revoking certification…");
    try {
      // TODO: replace with contractClient.revokeCertification(...)
      await new Promise((r) => setTimeout(r, 1000));
      setCerts((prev) =>
        prev.map((c) =>
          c.certId === cert.certId ? { ...c, revoked: true, revokedAt: Date.now() } : c
        )
      );
      toast.dismiss(toastId);
      toast.success("Certification revoked", cert.certId);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Failed to revoke", err instanceof Error ? err.message : "Unknown error");
    }
  }

  async function handleVerify(cert: Certification) {
    setVerifying(cert.certId);
    const toastId = toast.loading("Verifying on-chain…");
    try {
      // TODO: replace with contractClient.verifyCertification(...)
      await new Promise((r) => setTimeout(r, 900));
      toast.dismiss(toastId);
      if (cert.revoked) {
        toast.error("Certification revoked", `${cert.certId} has been revoked and is no longer valid.`);
      } else {
        toast.success("Certification valid", `${cert.certId} is active and authentic.`);
      }
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Verification failed", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setVerifying(null);
    }
  }

  const activeCerts = certs.filter((c) => !c.revoked);
  const revokedCerts = certs.filter((c) => c.revoked);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">
            {activeCerts.length} active
            {revokedCerts.length > 0 && `, ${revokedCerts.length} revoked`}
          </span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 transition-opacity"
        >
          <Plus size={13} />
          Issue Certificate
        </button>
      </div>

      {/* Issue form */}
      {showForm && (
        <form
          onSubmit={handleIssue}
          className="mb-5 p-4 border border-[var(--card-border)] rounded-xl bg-[var(--muted-bg)] flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--muted)]">Certificate ID</label>
            <div className="flex gap-2">
              <input
                value={certId}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCertId(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-md border border-[var(--card-border)] bg-[var(--background)] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
              <button
                type="button"
                onClick={() => setCertId(generateCertId())}
                className="p-1.5 rounded-md border border-[var(--card-border)] hover:bg-[var(--card)] transition-colors"
                title="Regenerate ID"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--muted)]">Certificate Type</label>
            <select
              value={certType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setCertType(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-[var(--card-border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              {CERT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{CERT_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--muted)]">Registry Reference (URL or ID)</label>
            <input
              required
              value={reference}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setReference(e.target.value)}
              placeholder="https://registry.example/cert/..."
              className="px-3 py-1.5 rounded-md border border-[var(--card-border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--card)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-md bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
            >
              {pending ? "Issuing…" : "Issue"}
            </button>
          </div>
        </form>
      )}

      {/* Certification list */}
      {certs.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No certifications issued for this product.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {certs.map((cert) => (
            <li
              key={cert.certId}
              className={`flex flex-col gap-2 p-3 rounded-xl border ${
                cert.revoked
                  ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 opacity-70"
                  : "border-[var(--card-border)] bg-[var(--card)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {cert.revoked ? (
                    <ShieldX size={16} className="text-red-500 shrink-0" />
                  ) : (
                    <ShieldCheck size={16} className="text-green-500 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {CERT_TYPE_LABELS[cert.certType] ?? cert.certType}
                    </p>
                    <p className="text-xs font-mono text-[var(--muted)]">{cert.certId}</p>
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    cert.revoked
                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                  }`}
                >
                  {cert.revoked ? "Revoked" : "Active"}
                </span>
              </div>

              <div className="text-xs text-[var(--muted)] flex flex-col gap-0.5">
                <span>Issued: {new Date(cert.issuedAt).toLocaleString()}</span>
                <span>
                  Issuer: {cert.issuer.slice(0, 8)}…{cert.issuer.slice(-6)}
                </span>
                {cert.revoked && cert.revokedAt && (
                  <span className="text-red-500">Revoked: {new Date(cert.revokedAt).toLocaleString()}</span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <a
                  href={cert.reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                >
                  <ExternalLink size={11} />
                  View Registry
                </a>
                <button
                  onClick={() => handleVerify(cert)}
                  disabled={verifying === cert.certId}
                  className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                >
                  <ShieldCheck size={11} />
                  {verifying === cert.certId ? "Verifying…" : "Verify On-Chain"}
                </button>
                {!cert.revoked && walletAddress && (
                  <button
                    onClick={() => handleRevoke(cert)}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors ml-auto"
                  >
                    <ShieldX size={11} />
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
