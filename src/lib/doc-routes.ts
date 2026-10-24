// The two content pages (privacy and legal notice) live at a localized slug in
// each language: /es/privacidad, /fr/mentions-legales, /en/privacy and so on.
// One table, used by the route, the footer, the app menu and the language switcher.
import { LOCALES, type Locale } from "@/i18n/config";

export const DOCS = ["privacy", "legal"] as const;
export type Doc = (typeof DOCS)[number];

export const DOC_SLUGS: Record<Locale, Record<Doc, string>> = {
  es: { privacy: "privacidad", legal: "aviso-legal" },
  eu: { privacy: "pribatutasuna", legal: "lege-oharra" },
  fr: { privacy: "confidentialite", legal: "mentions-legales" },
  en: { privacy: "privacy", legal: "legal" },
  ru: { privacy: "privacy", legal: "legal" },
};

export const docHref = (lang: Locale, doc: Doc) => `/${lang}/${DOC_SLUGS[lang][doc]}`;

/** Which page a slug is in a language, if any. */
export const docFromSlug = (lang: Locale, slug: string | undefined): Doc | undefined => DOCS.find((doc) => DOC_SLUGS[lang][doc] === slug);

/** hreflang alternates for one page, keyed by language. */
export const docAlternates = (doc: Doc) => Object.fromEntries(LOCALES.map((l) => [l, docHref(l, doc)]));

/** Where the project takes questions (there is no email or postal contact; see the legal page). */
export const REPO_URL = "https://github.com/sardoru/zama-freight";
export const ISSUES_URL = `${REPO_URL}/issues`;
