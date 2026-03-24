import { AddEventForm } from "@/components/tracking/AddEventForm";

export default async function VerifyPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-2">Product Verification</h1>
      <p className="text-gray-500">Product ID: {params.id}</p>
      <p className="mt-4 text-sm text-gray-400">
        Full product journey will be displayed here.
      </p>
      
      <div className="mt-8">
        <AddEventForm productId={params.id} />
      </div>
    </main>
  );
}
