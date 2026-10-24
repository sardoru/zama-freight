// Languages of the corridor: Spanish and Basque at home, French across the
// Bidasoa, English for everyone else, Russian for the many Baltic and
// Eastern-European drivers on the A-8/A-63.
export const LOCALES = ["es", "eu", "fr", "en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "zama-lang";

export const LOCALE_NAMES: Record<Locale, string> = {
  es: "Español",
  eu: "Euskara",
  fr: "Français",
  en: "English",
  ru: "Русский",
};

/** BCP-47 tags for Intl (numbers, money, dates) and <html lang>. */
export const INTL_LOCALE: Record<Locale, string> = {
  es: "es-ES",
  eu: "eu-ES",
  fr: "fr-FR",
  en: "en-GB",
  ru: "ru-RU",
};

/** og:locale values. */
export const OG_LOCALE: Record<Locale, string> = {
  es: "es_ES",
  eu: "eu_ES",
  fr: "fr_FR",
  en: "en_GB",
  ru: "ru_RU",
};

export const isLocale = (v: string | undefined | null): v is Locale => !!v && (LOCALES as readonly string[]).includes(v);
