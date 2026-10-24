"use client";

import { Globe } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALE_NAMES, LOCALES, isLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Native select (best on phones); remembers the choice in a cookie the proxy reads. */
export function LangSwitcher({ className }: { className?: string }) {
  const { lang, d } = useI18n();
  const pathname = usePathname();
  const router = useRouter();

  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    const parts = pathname.split("/");
    if (isLocale(parts[1])) parts[1] = next;
    else parts.splice(1, 0, next);
    router.push(parts.join("/") + window.location.search + window.location.hash);
  };

  return (
    <label
      className={cn(
        "relative inline-flex h-9 items-center rounded-lg border border-line bg-surface text-sm text-ink-2 transition focus-within:border-accent hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      <Globe className="pointer-events-none absolute left-2.5 size-4" aria-hidden />
      <span className="sr-only">{d.common.language}</span>
      <select
        value={lang}
        onChange={(e) => change(e.target.value as Locale)}
        className="h-full cursor-pointer appearance-none bg-transparent pr-2.5 pl-8 font-medium outline-none"
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
