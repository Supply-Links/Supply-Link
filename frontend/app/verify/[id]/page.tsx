import type { Metadata } from "next";
import { getProductById, getEventsByProductId, getActiveAlertByProductId, getCertificatesByProductId, getRevocationByCertId } from "@/lib/mock/products";
import { CONTRACT_ID } from "@/lib/stellar/client";
import { EventTimeline } from "@/components/products/EventTimeline";
import ProductQRCode from "@/components/products/ProductQRCode";
import { ScanQRButton } from "@/components/tracking/ScanQRButton";
import { RecallAlertBanner } from "@/components/alerts/RecallAlertBanner";
import { RevocationBadge } from "@/components/certificates/RevocationBadge";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = getProductById(params.id);
  if (!product) {
    return { title: "Product Not Found — Supply-Link" };
  }
  return {
    title: `${product.name} — Supply-Link Verification`,
    description: `Verify the authenticity and journey of ${product.name} from ${product.origin}. Powered by Stellar & Soroban.`,
    openGraph: {
      title: `${product.name} — Verified on Stellar`,
      description: `Origin: ${product.origin} · Owner: ${product.owner.slice(0, 8)}... · Tracked on-chain via Supply-Link.`,
      type: "website",
      siteName: "Supply-Link",
    },
    twitter: {
      card: "summary",
      title: `${product.name} — Verified on Stellar`,
      description: `Scan to verify the full journey of ${product.name} from ${product.origin}.`,
    },
  };
}

export default async function VerifyPage({ params }: Props) {
  const product = getProductById(params.id);
  const events = getEventsByProductId(params.id);

  // 404-style fallback for unknown product IDs
  if (!product) {
    return (
      <main className="p-8 max-w-lg mx-auto text-center">
        <div className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-10 mt-16">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2">Product Not Found</h1>
          <p className="text-sm text-[var(--muted)]">
            No product with ID <span className="font-mono">{params.id}</span> exists on this network.
          </p>
          <p className="text-xs text-[var(--muted)] mt-2">
            The QR code may be invalid or the product may have been removed.
          </p>
          <div className="mt-6">
            <ScanQRButton variant="outline" label="Scan Another QR" />
          </div>
        </div>
      </main>
    );
  }

  const stellarExpertUrl = `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`;
  const registeredAt = new Date(product.timestamp).toLocaleString();

  const activeAlert = getActiveAlertByProductId(product.id);
  const certificates = getCertificatesByProductId(product.id);

  return (
    <main className="p-6 max-w-2xl mx-auto">
      {/* Critical recall alert — shown at the very top for maximum visibility */}
      {activeAlert && (
        <RecallAlertBanner alert={activeAlert} />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{product.name}</h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                product.active
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {product.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="text-sm text-[var(--muted)]">Origin: {product.origin}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">Registered: {registeredAt}</p>
          <p className="text-xs font-mono text-[var(--muted)] mt-0.5 break-all">
            Owner: {product.owner}
          </p>
        </div>
        <ProductQRCode productId={product.id} size={140} />
      </div>

      {/* Verified on Stellar badge */}
      <a
        href={stellarExpertUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full border border-[var(--card-border)] bg-[var(--card)] text-sm text-[var(--foreground)] hover:opacity-80 transition-opacity"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Verified on Stellar · View Contract
      </a>

      {/* Certificates section */}
      {certificates.length > 0 && (
        <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-[var(--foreground)] mb-4">Certificates</h2>
          <ul className="space-y-3">
            {certificates.map((cert) => {
              const revocation = getRevocationByCertId(cert.certId);
              return (
                <li key={cert.certId} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {cert.certType.replace("_", " ")}
                    </p>
                    <p className="text-xs text-[var(--muted)] font-mono">{cert.certId}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Issued: {new Date(cert.issuedAt).toLocaleDateString()}
                    </p>
                    {cert.revoked && revocation && (
                      <p className="text-xs text-red-600 mt-0.5">
                        Revoked: {revocation.reason}
                      </p>
                    )}
                  </div>
                  <RevocationBadge revoked={cert.revoked} revocation={revocation} compact />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Event Timeline */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6">
        <h2 className="text-base font-semibold text-[var(--foreground)] mb-5">Product Journey</h2>
        <EventTimeline events={events} />
      </section>

      <div className="mt-6 flex justify-center">
        <ScanQRButton variant="outline" label="Scan Another QR" />
      </div>
    </main>
  );
}
