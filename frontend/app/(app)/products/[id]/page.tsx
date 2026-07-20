"use client";

import { useState, useEffect } from "react";
import { use } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getProductById } from "@/lib/mock/products";
import ProductQRCode from "@/components/products/ProductQRCode";
import ProductActions from "@/components/products/ProductActions";
import { AuthorizedActorsPanel } from "@/components/products/AuthorizedActorsPanel";

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: Props) {
  const { id } = use(params);
  const [product, setProduct] = useState<any>(null);
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";

  useEffect(() => {
    setProduct(getProductById(id));
  }, [id]);

  if (!product) {
    return (
      <main className="p-8 max-w-lg mx-auto text-center">
        <p className="text-2xl mb-4">🔍</p>
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2">Product Not Found</h1>
        <p className="text-sm text-[var(--muted)]">
          No product with ID <span className="font-mono">{id}</span> exists.
        </p>
        <Link href={`/${locale}/products`} className="text-sm text-[var(--primary)] hover:underline mt-4 inline-block">
          ← Back to Products
        </Link>
      </main>
    );
  }

  const registeredAt = new Date(product.timestamp).toLocaleString();

  return (
    <main className="p-8 max-w-3xl mx-auto" data-testid="product-detail">
      <Link href={`/${locale}/products`} className="text-sm text-[var(--muted)] hover:underline mb-6 inline-block">
        ← Back to Products
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]" data-testid="product-name">{product.name}</h1>
          <p className="text-[var(--muted)] mt-1">Product ID: <span className="font-mono text-sm">{product.id}</span></p>
        </div>
        <ProductQRCode productId={product.id} size={160} />
      </div>

      {/* Product Fields */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-[var(--muted)]">Origin</dt>
            <dd className="font-medium mt-0.5 text-[var(--foreground)]" data-testid="product-origin">{product.origin}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Registered</dt>
            <dd className="font-medium mt-0.5 text-[var(--foreground)]" data-testid="product-registered">{registeredAt}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[var(--muted)]">Current Owner</dt>
            <dd className="font-mono text-xs mt-0.5 break-all text-[var(--foreground)]">{product.owner}</dd>
          </div>
        </dl>
      </section>

      {/* Authorized Actors */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Authorized Actors</h2>
        <AuthorizedActorsPanel productId={product.id} initialActors={product.authorizedActors} />
      </section>

      {/* Ownership History */}
      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 mb-8">
        <h2 className="text-base font-semibold mb-4 text-[var(--foreground)]">Ownership History</h2>
        {!product.ownershipHistory || product.ownershipHistory.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No history available.</p>
        ) : (
          <ol className="relative border-l border-[var(--card-border)] ml-2 space-y-4">
            {product.ownershipHistory.map((record: any, i: number) => (
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
        <ProductActions productId={product.id} />
      </section>
    </main>
  );
}
