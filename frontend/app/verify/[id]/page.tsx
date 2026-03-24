import ProductQRCode from "@/components/products/ProductQRCode";

export default function VerifyPage({ params }: { params: { id: string } }) {
  return (
    <main className="p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-2">Product Verification</h1>
      <p className="text-gray-500 mb-1">Product ID: {params.id}</p>
      <p className="text-sm text-gray-400 mb-8">
        Full product journey will be displayed here.
      </p>
      <div className="border rounded-xl p-6 flex flex-col items-center gap-4 shadow-sm">
        <p className="text-sm font-medium text-gray-700">Scan to verify this product</p>
        <ProductQRCode productId={params.id} size={220} />
      </div>
    </main>
  );
}
