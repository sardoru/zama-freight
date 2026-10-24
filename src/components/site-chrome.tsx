// Header and footer of the public pages (landing, privacy, legal notice).
// Server components: the language switcher and theme toggle inside are the only client parts.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LangSwitcher } from "@/components/lang-switcher";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/types";
import { docHref } from "@/lib/doc-routes";

export function SiteHeader({ lang, d }: { lang: Locale; d: Dict }) {
  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href={`/${lang}`} aria-label="Zama" className="shrink-0">
          <Logo tagline={d.brand.tagline} />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <LangSwitcher />
          <ThemeToggle />
          <Link
            href={`/${lang}/app`}
            className="hidden h-10 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover sm:inline-flex"
          >
            {d.landing.ctaPrimary}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ lang, d }: { lang: Locale; d: Dict }) {
  const link = "font-semibold text-ink-2 underline decoration-line-strong underline-offset-4 transition hover:text-ink hover:decoration-ink-3";
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-ink-3 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xl space-y-3">
          <Logo />
          <p>{d.landing.disclaimer}</p>
          <nav aria-label={d.legal.title}>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              <li>
                <Link href={docHref(lang, "privacy")} className={link}>
                  {d.privacy.title}
                </Link>
              </li>
              <li>
                <Link href={docHref(lang, "legal")} className={link}>
                  {d.legal.title}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="max-w-md space-y-2 md:text-right">
          <p>{d.landing.mapData}</p>
          <p>{d.landing.builtWith}</p>
        </div>
      </div>
    </footer>
  );
}
