import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductById, getActiveAlertByProductId, getCertificatesByProductId, getRevocationByCertId } from "@/lib/mock/products";
import ProductQRCode from "@/components/products/ProductQRCode";
import ProductActions from "@/components/products/ProductActions";
import { AuthorizedActorsPanel } from "@/components/products/AuthorizedActorsPanel";
import { RecallAlertBanner } from "@/components/alerts/RecallAlertBanner";
import { AlertsPanel } from "@/components/alerts/AlertsPanel";
import { CertificatesPanel } from "@/components/certificates/CertificatesPanel";

interface Props {
  params: { id: string };
}

export default function ProductDetailPage({ params }: Props) {
  const product = getProductById(params.id);
  if (!product) notFound();
  const p = product!;
  const registeredAt = new Date(p.timestamp).toLocaleString();

  const activeAlert = getActiveAlertByProductId(p.id);
  const certificates = getCertificatesByProductId(p.id);
  const revocations = certificates
    .filter((c) => c.revoked)
    .map((c) => getRevocationByCertId(c.certId))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <Link href="/products" className="text-sm text-[var(--muted)] hover:underline mb-6 inline-block">
        ← Back to Products
      </Link>

      {/* Active recall alert banner — shown prominently at the top */}
      {activeAlert && (
        <RecallAlertBanner alert={activeAlert} />
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

      {/* Recall Alerts */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Recall Alerts</h2>
        <AlertsPanel
          productId={p.id}
          alerts={activeAlert ? [activeAlert] : []}
        />
      </section>

      {/* Certificates & Revocations */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Certificates</h2>
        <CertificatesPanel
          productId={p.id}
          certificates={certificates}
          revocations={revocations}
        />
      </section>

      {/* Authorized Actors */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Authorized Actors</h2>
        <AuthorizedActorsPanel productId={p.id} initialActors={p.authorizedActors} />
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
      </section>
    </main>
  );
}
