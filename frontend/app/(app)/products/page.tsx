import ProductQRCode from "@/components/products/ProductQRCode";
import type { Product } from "@/lib/types";

// Mock products — replace with real data fetching as needed
const MOCK_PRODUCTS: Product[] = [
  {
    id: "prod-001",
    name: "Organic Coffee Beans",
    origin: "Ethiopia",
    owner: "GABC...XYZ",
    timestamp: Date.now(),
    authorizedActors: [],
  },
  {
    id: "prod-002",
    name: "Fair Trade Cocoa",
    origin: "Ghana",
    owner: "GDEF...UVW",
    timestamp: Date.now(),
    authorizedActors: [],
  },
];

export default function ProductsPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">Products</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {MOCK_PRODUCTS.map((product) => (
          <div key={product.id} className="border rounded-xl p-6 flex flex-col gap-4 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">{product.name}</h2>
              <p className="text-sm text-gray-500">Origin: {product.origin}</p>
              <p className="text-xs text-gray-400 mt-1 font-mono truncate">ID: {product.id}</p>
            </div>
            <ProductQRCode productId={product.id} size={160} />
          </div>
        ))}
      </div>
    </main>
  );
}
