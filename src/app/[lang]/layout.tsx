import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { themeScript } from "@/components/theme-script";
import { I18nProvider } from "@/i18n/client";
import { INTL_LOCALE, isLocale, LOCALES, OG_LOCALE } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

// Only Manrope's latin file is preloaded (issue #18): preloads share the phone's bandwidth with the first scripts, so
// they delay the first paint. Its latin-ext and cyrillic files (and the mono font, used for ids and plates) still
// load on demand through their unicode ranges, swapping in when a page uses them.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", weight: ["500", "600"], preload: false });

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const d = getDict(lang);
  // Every title, description and share text says "prototype" (issue #3): the market is simulated.
  const ogTitle = `${d.meta.ogTitle} · ${d.meta.siteName}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: d.meta.title, template: `%s · ${d.meta.siteName}` },
    description: d.meta.description,
    applicationName: "Zama",
    alternates: {
      canonical: `/${lang}`,
      languages: { ...Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])), "x-default": "/es" },
    },
    openGraph: {
      type: "website",
      siteName: d.meta.siteName,
      url: `/${lang}`,
      title: ogTitle,
      description: d.meta.description,
      locale: OG_LOCALE[lang],
      alternateLocale: LOCALES.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
    },
    twitter: { card: "summary_large_image", title: ogTitle, description: d.meta.description },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#090d12" },
  ],
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={INTL_LOCALE[lang]} className={`${manrope.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <I18nProvider lang={lang} dict={getDict(lang)}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
