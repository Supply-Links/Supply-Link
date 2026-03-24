import Link from "next/link";
import ProductQRCode from "@/components/products/ProductQRCode";
import { MOCK_PRODUCTS } from "@/lib/mock/products";

export default function ProductsPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-[var(--foreground)]">Products</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_PRODUCTS.map((product) => (
          <Link
            key={product.id}
            href={`/products/${product.id}`}
            className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow"
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
