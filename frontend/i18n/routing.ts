import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "fr", "de", "zh", "ar", "he"],
  defaultLocale: "en",
});

/** Locales that require right-to-left text direction. */
export const RTL_LOCALES: ReadonlySet<string> = new Set(["ar", "he"]);
