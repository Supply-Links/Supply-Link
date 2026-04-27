import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProductById, getEventsByProductId } from "@/lib/mock/products";
import { CONTRACT_ID } from "@/lib/stellar/client";
import { EventTimeline } from "@/components/products/EventTimeline";
import ProductQRCode from "@/components/products/ProductQRCode";
import { ScanQRButton } from "@/components/tracking/ScanQRButton";

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = getProductById(id);
  if (!product) return { title: "Product Not Found — Supply-Link" };
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
  const { id } = await params;
  const t = await getTranslations("verify");
  const product = getProductById(id);
  const events = getEventsByProductId(id);

  if (!product) {
    return (
      <main className="p-8 max-w-lg mx-auto text-center">
        <div className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-10 mt-16">
          <p className="text-4xl mb-4">🔍</p>
          <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2">{t("notFound.title")}</h1>
          <p className="text-sm text-[var(--muted)]">
            {t("notFound.desc", { id: <span className="font-mono">{id}</span> })}
          </p>
          <p className="text-xs text-[var(--muted)] mt-2">{t("notFound.hint")}</p>
          <div className="mt-6">
            <ScanQRButton variant="outline" label={t("notFound.scanAnother")} />
          </div>
        </div>
      </main>
    );
  }

  const stellarExpertUrl = `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`;
  const registeredAt = new Date(product.timestamp).toLocaleString();

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{product.name}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${product.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {product.active ? t("active") : t("inactive")}
            </span>
          </div>
          <p className="text-sm text-[var(--muted)]">{t("origin")}: {product.origin}</p>
          <p className="text-xs text-[var(--muted)] mt-0.5">{t("registered")}: {registeredAt}</p>
          <p className="text-xs font-mono text-[var(--muted)] mt-0.5 break-all">{t("owner")}: {product.owner}</p>
        </div>
        <ProductQRCode productId={product.id} size={140} />
      </div>

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
        {t("verifiedBadge")}
      </a>

      <section className="border border-[var(--card-border)] bg-[var(--card)] rounded-xl p-6">
        <h2 className="text-base font-semibold text-[var(--foreground)] mb-5">{t("journey")}</h2>
        <EventTimeline events={events} />
      </section>

      <div className="mt-6 flex justify-center">
        <ScanQRButton variant="outline" label={t("scanAnother")} />
      </div>
    </main>
  );
}
