import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSwitcher } from './LanguageSwitcher';
import { WalletConnect } from './wallet/WalletConnect';

export function Navbar() {
  const t = useTranslations('nav');

  const NAV_LINKS = [
    { href: '/dashboard', label: t('dashboard') },
    { href: '/products', label: t('products') },
    { href: '/tracking', label: t('tracking') },
    { href: '/reports', label: t('reports') },
  ];

  return (
    <nav className="border-b border-[var(--card-border)] bg-[var(--background)] sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="font-semibold text-sm tracking-tight text-[var(--foreground)]"
          >
            Supply-Link
          </Link>
          <div className="flex items-center gap-4">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          <WalletConnect />
        </div>
      </div>
    </nav>
  );
}
