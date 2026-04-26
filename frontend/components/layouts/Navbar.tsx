"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { NetworkMismatchBanner } from "@/components/wallet/NetworkMismatchBanner";
import { LowBalanceWarning } from "@/components/wallet/LowBalanceWarning";
import { NetworkBadge } from "@/components/NetworkBadge";
import { useStore } from "@/lib/state/store";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/products": "Products",
  "/tracking": "Tracking",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  for (const [key, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(key + "/")) return title;
  }
  return "Supply-Link";
}

interface AppNavbarProps {
  onMenuClick: () => void;
}

export function AppNavbar({ onMenuClick }: AppNavbarProps) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const { xlmBalance } = useStore();

  return (
    <>
      <header className="h-14 border-b border-[var(--card-border)] bg-[var(--background)] flex items-center px-4 gap-4 sticky top-0 z-40">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="md:hidden p-1.5 rounded hover:bg-[var(--muted-bg)] text-[var(--foreground)]"
        >
          <Menu size={20} />
        </button>

        {/* Logo — desktop only (sidebar shows it on mobile) */}
        <Link
          href="/dashboard"
          className="hidden md:block font-semibold text-sm tracking-tight text-[var(--foreground)]"
        >
          Supply-Link
        </Link>

        <span className="text-sm font-medium text-[var(--foreground)] md:ml-2">{title}</span>

        <div className="ml-auto flex items-center gap-3">
          <NetworkBadge />
          <WalletConnect />
          <ThemeToggle />
        </div>
      </header>

      {/* Warnings below navbar */}
      <div className="px-4 pt-4 space-y-2">
        <NetworkMismatchBanner />
        <LowBalanceWarning balance={xlmBalance} />
      </div>
    </>
  );
}
