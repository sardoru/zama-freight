import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { DOCS, docAlternates, docHref } from "@/lib/doc-routes";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}`]));
  const landing: MetadataRoute.Sitemap = LOCALES.map((l) => ({ url: `${SITE_URL}/${l}`, changeFrequency: "weekly", priority: l === "es" ? 1 : 0.8, alternates: { languages } }));
  // The privacy and legal pages, at their slug in each language.
  const docs: MetadataRoute.Sitemap = DOCS.flatMap((doc) => {
    const alternates = { languages: Object.fromEntries(Object.entries(docAlternates(doc)).map(([l, path]) => [l, `${SITE_URL}${path}`])) };
    return LOCALES.map((l) => ({ url: `${SITE_URL}${docHref(l, doc)}`, changeFrequency: "monthly" as const, priority: 0.3, alternates }));
  });
  return [...landing, ...docs];
}
