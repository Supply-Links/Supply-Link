import VerifyPage from "@/app/verify/[id]/page";

export default function LocaleVerifyPage({ params }: { params: Promise<{ id: string }> }) {
  return <VerifyPage params={params} />;
}
