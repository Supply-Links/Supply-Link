"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProductQRCode from "@/components/products/ProductQRCode";
import { MOCK_PRODUCTS, addProduct } from "@/lib/mock/products";
import { RegisterProductForm } from "@/components/products/RegisterProductForm";
import type { Product } from "@/lib/types";

export default function ProductsPage() {
  const [, setTick] = useState(0);
  const pathname = usePathname();
  const locale = pathname?.split("/")[1] ?? "en";

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return (
    <main className="p-8" data-testid="products-page">
      <h1 className="text-2xl font-bold mb-6 text-[var(--foreground)]">Products</h1>
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4 text-[var(--foreground)]">Register New Product</h2>
        <RegisterProductForm onSuccess={refresh} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="product-list">
        {MOCK_PRODUCTS.map((product) => (
          <Link
            key={product.id}
            href={`/${locale}/products/${product.id}`}
            className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow"
            data-testid="product-card"
          >
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{product.name}</h2>
              <p className="text-sm text-[var(--muted)]">Origin: {product.origin}</p>
              <p className="text-xs text-[var(--muted)] mt-1 font-mono truncate">ID: {product.id}</p>
            </div>
            <ProductQRCode productId={product.id} size={160} />
          </Link>
        ))}
      </div>
    </main>
  );
}
