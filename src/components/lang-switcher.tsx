"use client";

import { Globe } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, isLocale, type Locale } from "@/i18n/config";
import { DOC_SLUGS, docFromSlug } from "@/lib/doc-routes";
import { cn } from "@/lib/utils";

/** Native select (best on phones); remembers the choice in a cookie the proxy reads. */
export function LangSwitcher({ className }: { className?: string }) {
  const { lang, d } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const parts = pathname.split("/");
    if (isLocale(parts[1])) {
      // The privacy and legal pages have a slug per language (/es/privacidad ⇄ /fr/confidentialite).
      const doc = parts.length === 3 ? docFromSlug(parts[1], parts[2]) : undefined;
      parts[1] = next;
      if (doc) parts[2] = DOC_SLUGS[next][doc];
    } else parts.splice(1, 0, next);
    router.push(parts.join("/") + window.location.search + window.location.hash);
  };

  return (
    <label
      className={cn(
        "relative inline-flex h-10 items-center rounded-lg border border-line bg-surface text-sm text-ink-2 transition focus-within:border-accent hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      <Globe className="pointer-events-none absolute left-2.5 size-4" aria-hidden />
      <span className="sr-only">{d.common.language}</span>
      {/* No outline-none: keyboard focus gets the global focus ring. */}
      <select
        value={lang}
        onChange={(e) => change(e.target.value as Locale)}
        className="h-full w-full cursor-pointer appearance-none rounded-lg bg-transparent pr-2.5 pl-8 font-medium"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
