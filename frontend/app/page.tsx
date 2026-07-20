import { ScanQRButton } from "@/components/tracking/ScanQRButton";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-bold mb-4 text-[var(--foreground)]" data-testid="landing-title">Supply-Link</h1>
      <p className="text-lg text-[var(--muted)] mb-2">
        Decentralized supply chain provenance tracker
      </p>
      <p className="text-sm text-[var(--muted)] mb-8">
        Powered by{" "}
        <a href="https://stellar.org" className="underline" target="_blank" rel="noreferrer">
          Stellar
        </a>{" "}
        &amp;{" "}
        <a href="https://soroban.stellar.org" className="underline" target="_blank" rel="noreferrer">
          Soroban
        </a>
      </p>
      <WalletConnect />
      <nav className="mt-8 flex gap-4">
        <Link href="/products" className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)]" data-testid="landing-nav-products">
          View Products
        </Link>
        <Link href="/tracking" className="px-4 py-2 text-sm rounded-md border border-[var(--card-border)] hover:bg-[var(--muted-bg)] text-[var(--foreground)]" data-testid="landing-nav-tracking">
          Tracking
        </Link>
      </nav>
      <ScanQRButton label="Scan QR to Verify Product" data-testid="landing-cta" />
    </main>
  );
}
