import ProductDetailPage from "@/app/(app)/products/[id]/page";

export default function LocaleProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <ProductDetailPage params={params} />;
}
