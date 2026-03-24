import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductById } from "@/lib/mock/products";
import ProductQRCode from "@/components/products/ProductQRCode";
import ProductActions from "@/components/products/ProductActions";

interface Props {
  params: { id: string };
}

export default function ProductDetailPage({ params }: Props) {
  const product = getProductById(params.id);
  if (!product) notFound();
  // TypeScript doesn't narrow after notFound() since it throws, so we assert here
  const p = product!;
  const registeredAt = new Date(p.timestamp).toLocaleString();

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <Link href="/products" className="text-sm text-gray-500 hover:underline mb-6 inline-block">
        ← Back to Products
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl font-bold">{p.name}</h1>
          <p className="text-gray-500 mt-1">Product ID: <span className="font-mono text-sm">{p.id}</span></p>
        </div>
        <ProductQRCode productId={p.id} size={160} />
      </div>

      {/* Product Fields */}
      <section className="border rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Origin</dt>
            <dd className="font-medium mt-0.5">{p.origin}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Registered</dt>
            <dd className="font-medium mt-0.5">{registeredAt}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-gray-500">Current Owner</dt>
            <dd className="font-mono text-xs mt-0.5 break-all">{p.owner}</dd>
          </div>
        </dl>
      </section>

      {/* Authorized Actors */}
      <section className="border rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4">Authorized Actors</h2>
        {p.authorizedActors.length === 0 ? (
          <p className="text-sm text-gray-400">No authorized actors.</p>
        ) : (
          <ul className="space-y-2">
            {p.authorizedActors.map((actor) => (
              <li key={actor} className="font-mono text-xs bg-gray-50 rounded-md px-3 py-2 break-all">
                {actor}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Ownership History */}
      <section className="border rounded-xl p-6 mb-8">
        <h2 className="text-base font-semibold mb-4">Ownership History</h2>
        {!p.ownershipHistory || p.ownershipHistory.length === 0 ? (
          <p className="text-sm text-gray-400">No history available.</p>
        ) : (
          <ol className="relative border-l border-gray-200 ml-2 space-y-4">
            {p.ownershipHistory.map((record, i) => (
              <li key={i} className="ml-4">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-black border-2 border-white" />
                <p className="font-mono text-xs break-all">{record.owner}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(record.transferredAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Action Buttons */}
      <section>
        <h2 className="text-base font-semibold mb-4">Actions</h2>
        <ProductActions productId={p.id} />
      </section>
    </main>
  );
}
