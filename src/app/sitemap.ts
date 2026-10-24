import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}`]));
  return LOCALES.map((l) => ({ url: `${SITE_URL}/${l}`, changeFrequency: "weekly", priority: l === "es" ? 1 : 0.8, alternates: { languages } }));
}
