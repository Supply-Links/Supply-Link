"use client";

import { useState, useEffect, type FormEvent } from "react";
import { ShieldCheck, Plus, FileText, ExternalLink, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "@/lib/state/store";
import { getInsurance, addInsuranceCoverage, getClaimProofs, addClaimProof } from "@/lib/stellar/client";
import { getInsuranceByProductId, getClaimsByProductId } from "@/lib/mock/products";
import { InsuranceStatusBadge } from "./InsuranceStatusBadge";
import type { InsuranceCoverage, ClaimProof, ClaimStatus } from "@/lib/types";
import { toast } from "sonner";

const COVERAGE_TYPES = ["CARGO", "LIABILITY", "ALL_RISK", "TRANSIT"] as const;
const CLAIM_STATUSES: ClaimStatus[] = ["SUBMITTED", "PENDING", "APPROVED", "REJECTED"];

const CLAIM_STATUS_STYLES: Record<ClaimStatus, string> = {
  SUBMITTED: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950 dark:border-blue-800",
  PENDING: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-800",
  APPROVED: "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950 dark:border-green-800",
  REJECTED: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950 dark:border-red-800",
};

interface InsurancePanelProps {
  productId: string;
}

export function InsurancePanel({ productId }: InsurancePanelProps) {
  const { walletAddress, insuranceCoverage, setInsuranceCoverage, claimProofs, setClaimProofs, addClaimProof: storeAddClaimProof } = useStore();

  const [loading, setLoading] = useState(true);
  const [showCoverageForm, setShowCoverageForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimsExpanded, setClaimsExpanded] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Coverage form state
  const [policyId, setPolicyId] = useState("");
  const [provider, setProvider] = useState("");
  const [coverageType, setCoverageType] = useState<string>("CARGO");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [insuredValue, setInsuredValue] = useState("");

  // Claim form state
  const [claimId, setClaimId] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [description, setDescription] = useState("");
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>("SUBMITTED");

  const coverage: InsuranceCoverage | undefined = insuranceCoverage[productId];
  const claims: ClaimProof[] = claimProofs[productId] ?? [];

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (walletAddress) {
          // Try on-chain first; fall back to mock data on any error
          try {
            const onChainCoverage = await getInsurance(productId, walletAddress, "INSURANCE_VERIFY");
            const onChainClaims = await getClaimProofs(productId, walletAddress, "INSURANCE_VERIFY");

            if (onChainCoverage) {
              setInsuranceCoverage(productId, onChainCoverage);
            } else {
              const mock = getInsuranceByProductId(productId);
              if (mock) setInsuranceCoverage(productId, mock);
            }

            if (onChainClaims.length > 0) {
              setClaimProofs(productId, onChainClaims);
            } else {
              const mockClaims = getClaimsByProductId(productId);
              if (mockClaims.length > 0) setClaimProofs(productId, mockClaims);
            }
          } catch {
            // Contract not reachable (e.g. not yet deployed) — use mock data
            const mock = getInsuranceByProductId(productId);
            if (mock) setInsuranceCoverage(productId, mock);
            const mockClaims = getClaimsByProductId(productId);
            if (mockClaims.length > 0) setClaimProofs(productId, mockClaims);
          }
        } else {
          // No wallet — use mock data for display
          const mock = getInsuranceByProductId(productId);
          if (mock) setInsuranceCoverage(productId, mock);
          const mockClaims = getClaimsByProductId(productId);
          if (mockClaims.length > 0) setClaimProofs(productId, mockClaims);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, walletAddress]);

  async function handleAddCoverage(e: FormEvent) {
    e.preventDefault();
    if (!walletAddress) {
      toast.error("Wallet not connected", { description: "Connect your Freighter wallet first." });
      return;
    }
    setSubmitting(true);
    const toastId = toast.loading("Recording insurance coverage on-chain…");
    try {
      await addInsuranceCoverage(
        productId,
        walletAddress,
        policyId,
        provider,
        coverageType,
        validFrom,
        validUntil,
        insuredValue
      );
      const newCoverage: InsuranceCoverage = {
        policyId,
        provider,
        coverageType,
        validFrom,
        validUntil,
        insuredValue,
        recordedBy: walletAddress,
        timestamp: Date.now(),
      };
      setInsuranceCoverage(productId, newCoverage);
      toast.success("Coverage recorded", { id: toastId, description: "Insurance coverage has been stored on-chain." });
      setShowCoverageForm(false);
      setPolicyId(""); setProvider(""); setValidFrom(""); setValidUntil(""); setInsuredValue("");
    } catch {
      toast.error("Transaction failed", { id: toastId, description: "Could not record coverage. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddClaim(e: FormEvent) {
    e.preventDefault();
    if (!walletAddress) {
      toast.error("Wallet not connected", { description: "Connect your Freighter wallet first." });
      return;
    }
    setSubmitting(true);
    const toastId = toast.loading("Submitting claim proof on-chain…");
    try {
      await addClaimProof(productId, walletAddress, claimId, documentRef, description, claimStatus);
      const newProof: ClaimProof = {
        claimId,
        documentRef,
        description,
        status: claimStatus,
        submittedBy: walletAddress,
        timestamp: Date.now(),
      };
      storeAddClaimProof(productId, newProof);
      toast.success("Claim proof submitted", { id: toastId, description: "The claim reference has been stored on-chain." });
      setShowClaimForm(false);
      setClaimId(""); setDocumentRef(""); setDescription(""); setClaimStatus("SUBMITTED");
    } catch {
      toast.error("Transaction failed", { id: toastId, description: "Could not submit claim proof. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-8 bg-[var(--muted-bg)] rounded-lg w-48" />
        <div className="h-24 bg-[var(--muted-bg)] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Coverage status ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <ShieldCheck size={16} className="text-violet-500" />
            Coverage Status
          </h3>
          {walletAddress && (
            <button
              onClick={() => setShowCoverageForm((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
            >
              <Plus size={12} />
              {coverage ? "Update Coverage" : "Add Coverage"}
            </button>
          )}
        </div>

        <InsuranceStatusBadge coverage={coverage} />

        {coverage && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-3">
            <div>
              <dt className="text-[var(--muted)] text-xs">Policy ID</dt>
              <dd className="font-mono text-xs mt-0.5 text-[var(--foreground)]">{coverage.policyId}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)] text-xs">Provider</dt>
              <dd className="font-medium mt-0.5 text-[var(--foreground)]">{coverage.provider}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)] text-xs">Coverage Type</dt>
              <dd className="mt-0.5">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                  {coverage.coverageType}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)] text-xs">Insured Value</dt>
              <dd className="font-semibold mt-0.5 text-[var(--foreground)]">{coverage.insuredValue}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)] text-xs">Valid From</dt>
              <dd className="mt-0.5 text-[var(--foreground)]">{coverage.validFrom}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)] text-xs">Valid Until</dt>
              <dd className="mt-0.5 text-[var(--foreground)]">{coverage.validUntil}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[var(--muted)] text-xs">Recorded By</dt>
              <dd className="font-mono text-xs mt-0.5 break-all text-[var(--foreground)]">{coverage.recordedBy}</dd>
            </div>
          </dl>
        )}

        {/* Coverage form */}
        {showCoverageForm && (
          <form onSubmit={handleAddCoverage} className="mt-4 space-y-3 border border-[var(--card-border)] rounded-xl p-4 bg-[var(--background)]">
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Insurance Coverage Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">Policy ID *</label>
                <input
                  required
                  value={policyId}
                  onChange={(e) => setPolicyId(e.target.value)}
                  placeholder="POL-2024-001"
                  className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">Provider *</label>
                <input
                  required
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="Lloyd's of London"
                  className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">Coverage Type *</label>
                <select
                  value={coverageType}
                  onChange={(e) => setCoverageType(e.target.value)}
                  className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {COVERAGE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">Insured Value *</label>
                <input
                  required
                  value={insuredValue}
                  onChange={(e) => setInsuredValue(e.target.value)}
                  placeholder="50000 USD"
                  className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">Valid From *</label>
                <input
                  required
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--muted)] mb-1">Valid Until *</label>
                <input
                  required
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCoverageForm(false)}
                className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-60"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Record Coverage
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Claim proofs ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setClaimsExpanded((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)] hover:text-violet-600 transition-colors"
          >
            <FileText size={16} className="text-violet-500" />
            Claim Proofs
            <span className="text-xs font-normal text-[var(--muted)] bg-[var(--muted-bg)] px-1.5 py-0.5 rounded-full">
              {claims.length}
            </span>
            {claimsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {walletAddress && (
            <button
              onClick={() => setShowClaimForm((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)] font-medium transition-colors"
            >
              <Plus size={12} />
              Add Claim
            </button>
          )}
        </div>

        {claimsExpanded && (
          <>
            {claims.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No claim proofs recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {claims.map((claim, i) => (
                  <li
                    key={i}
                    className="border border-[var(--card-border)] rounded-xl p-4 bg-[var(--background)] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--foreground)]">{claim.claimId}</p>
                        <p className="text-xs text-[var(--muted)] mt-0.5">{claim.description}</p>
                      </div>
                      <span
                        className={`shrink-0 inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                          CLAIM_STATUS_STYLES[claim.status as ClaimStatus] ??
                          "text-[var(--muted)] bg-[var(--muted-bg)] border-[var(--card-border)]"
                        }`}
                      >
                        {claim.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <span className="font-mono truncate max-w-[200px]" title={claim.documentRef}>
                        {claim.documentRef}
                      </span>
                      {claim.documentRef.startsWith("Qm") && (
                        <a
                          href={`https://ipfs.io/ipfs/${claim.documentRef}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-violet-600 hover:underline"
                          aria-label="View claim document on IPFS"
                        >
                          <ExternalLink size={11} />
                          IPFS
                        </a>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span className="font-mono truncate max-w-[200px]" title={claim.submittedBy}>
                        {claim.submittedBy.slice(0, 8)}…{claim.submittedBy.slice(-6)}
                      </span>
                      <span>{new Date(claim.timestamp).toLocaleDateString()}</span>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {/* Claim form */}
            {showClaimForm && (
              <form onSubmit={handleAddClaim} className="mt-2 space-y-3 border border-[var(--card-border)] rounded-xl p-4 bg-[var(--background)]">
                <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">New Claim Proof</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Claim ID *</label>
                    <input
                      required
                      value={claimId}
                      onChange={(e) => setClaimId(e.target.value)}
                      placeholder="CLM-2024-001"
                      className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--muted)] mb-1">Status *</label>
                    <select
                      value={claimStatus}
                      onChange={(e) => setClaimStatus(e.target.value as ClaimStatus)}
                      className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      {CLAIM_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-[var(--muted)] mb-1">Document Reference *</label>
                    <input
                      required
                      value={documentRef}
                      onChange={(e) => setDocumentRef(e.target.value)}
                      placeholder="IPFS CID or SHA-256 hash"
                      className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-[var(--muted)] mb-1">Description *</label>
                    <textarea
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of the claim…"
                      rows={2}
                      className="w-full border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowClaimForm(false)}
                    className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90 font-medium transition-colors disabled:opacity-60"
                  >
                    {submitting && <Loader2 size={14} className="animate-spin" />}
                    Submit Claim
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
