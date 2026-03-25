import { ScanQRButton } from "@/components/tracking/ScanQRButton";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-bold mb-4 text-[var(--foreground)]">Supply-Link</h1>
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
      <ScanQRButton label="Scan QR to Verify Product" />
    </main>
  );
}
