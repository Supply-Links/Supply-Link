"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

/** Human-readable native name for each supported locale. */
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  zh: "中文",
  ar: "العربية",
  he: "עברית",
};

/** Short code shown on the button. */
const LOCALE_SHORT: Record<string, string> = {
  en: "EN",
  es: "ES",
  fr: "FR",
  de: "DE",
  zh: "中",
  ar: "ع",
  he: "עב",
};

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("languageSwitcher");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function switchLocale(next: string) {
    // pathname includes the current locale prefix, e.g. /en/dashboard → /es/dashboard
    const segments = pathname.split("/");
    segments[1] = next;
    router.push(segments.join("/"));
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("label")}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--muted-bg)] transition-colors"
      >
        {LOCALE_SHORT[locale] ?? locale.toUpperCase()}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("label")}
          className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-[var(--card-border)] bg-[var(--card)] shadow-lg py-1 overflow-hidden"
        >
          {routing.locales.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button
                onClick={() => switchLocale(l)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors ${
                  l === locale
                    ? "bg-violet-600 text-white font-semibold"
                    : "text-[var(--foreground)] hover:bg-[var(--muted-bg)]"
                }`}
              >
                <span>{LOCALE_LABELS[l] ?? l}</span>
                <span className="opacity-60">{LOCALE_SHORT[l]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
