import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";

/** The saved choice first, then the browser's languages in order, then Spanish. */
function pickLocale(req: NextRequest): Locale {
  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  const ranked = (req.headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((x) => x.tag && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Every page lives under /es, /eu, /fr, /en or /ru; anything else is sent there. */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isLocale(pathname.split("/")[1])) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/${pickLocale(req)}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, files with an extension and the metadata routes.
  matcher: ["/((?!_next|api|.*\\..*|robots.txt|sitemap.xml|manifest.webmanifest|icon|apple-icon).*)"],
};
