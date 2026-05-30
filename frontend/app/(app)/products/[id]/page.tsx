"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductById } from "@/lib/mock/products";
import ProductQRCode from "@/components/products/ProductQRCode";
import ProductActions from "@/components/products/ProductActions";
import { AuthorizedActorsPanel } from "@/components/products/AuthorizedActorsPanel";
import { CertificatePanel } from "@/components/products/CertificatePanel";
import { EmergencyAlertBanner } from "@/components/alerts/EmergencyAlertBanner";
import { IssueRecallForm } from "@/components/alerts/IssueRecallForm";
import { useStore } from "@/lib/state/store";
import { contractClient } from "@/lib/stellar/contract";
import { useToast } from "@/lib/hooks/useToast";
import { propagateAlert } from "@/lib/alerts/notify";

interface Props {
  params: { id: string };
}

function ProductDetailClient({ productId }: { productId: string }) {
  const product = getProductById(productId);
  if (!product) notFound();
  const p = product!;
  const registeredAt = new Date(p.timestamp).toLocaleString();

  const { walletAddress, recalls, resolveRecall } = useStore();
  const toast = useToast();
  const [showRecallForm, setShowRecallForm] = useState(false);

  const activeRecall = recalls[productId];
  const isOwner = walletAddress && walletAddress === p.owner;

  async function handleResolveRecall() {
    if (!walletAddress) return;
    const toastId = toast.loading("Resolving recall on-chain…");
    try {
      const txHash = await contractClient.resolveRecall(productId, walletAddress);
      resolveRecall(productId, walletAddress);
      // Notify via webhook if configured
      const resolved = { ...activeRecall!, status: "RESOLVED" as const, resolvedAt: Date.now(), resolvedBy: walletAddress };
      await propagateAlert(resolved, "recall.resolved");
      toast.dismiss(toastId);
      toast.success("Recall resolved", txHash);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error("Failed to resolve recall", err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <Link href="/products" className="text-sm text-[var(--muted)] hover:underline mb-6 inline-block">
        ← Back to Products
      </Link>

      {/* Emergency alert banner — shown prominently when active */}
      {activeRecall && (
        <div className="mb-6">
          <EmergencyAlertBanner
            alert={activeRecall}
            onResolve={isOwner && activeRecall.status === "ACTIVE" ? handleResolveRecall : undefined}
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{p.name}</h1>
          <p className="text-[var(--muted)] mt-1">Product ID: <span className="font-mono text-sm">{p.id}</span></p>
        </div>
        <ProductQRCode productId={p.id} size={160} />
      </div>

      {/* Product Fields */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[var(--muted)]">Origin</dt>
            <dd className="font-medium mt-0.5 text-[var(--foreground)]">{p.origin}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Registered</dt>
            <dd className="font-medium mt-0.5 text-[var(--foreground)]">{registeredAt}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--muted)]">Current Owner</dt>
            <dd className="font-mono text-xs mt-0.5 break-all text-[var(--foreground)]">{p.owner}</dd>
          </div>
        </dl>
      </section>

      {/* Authorized Actors */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Authorized Actors</h2>
        <AuthorizedActorsPanel productId={p.id} initialActors={p.authorizedActors} />
      </section>

      {/* Certificates */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Certificates &amp; Attestations</h2>
        <CertificatePanel productId={p.id} editable={!!walletAddress} />
      </section>

      {/* Ownership History */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-8">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Ownership History</h2>
        {!p.ownershipHistory || p.ownershipHistory.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No history available.</p>
        ) : (
          <ol className="relative border-l border-[var(--card-border)] ml-2 space-y-4">
            {p.ownershipHistory.map((record, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-[var(--primary)] border-2 border-[var(--background)]" />
                <p className="font-mono text-xs break-all text-[var(--foreground)]">{record.owner}</p>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {new Date(record.transferredAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Action Buttons */}
      <section>
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Actions</h2>
        <ProductActions productId={p.id} />

        {/* Recall action — available to owner and authorized actors */}
        {walletAddress && !activeRecall?.status?.includes("ACTIVE") && (
          <div className="mt-4">
            <button
              onClick={() => setShowRecallForm(true)}
              className="px-4 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Issue Recall Alert
            </button>
          </div>
        )}
      </section>

      {/* Issue recall form dialog */}
      <IssueRecallForm
        productId={p.id}
        open={showRecallForm}
        onOpenChange={setShowRecallForm}
      />
    </main>
  );
}

export default function ProductDetailPage({ params }: Props) {
  return <ProductDetailClient productId={params.id} />;
}
