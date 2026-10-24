import type { Locale } from "./config";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { eu } from "./dictionaries/eu";
import { fr } from "./dictionaries/fr";
import { ru } from "./dictionaries/ru";
import type { Dict } from "./types";

const DICTS: Record<Locale, Dict> = { es, eu, fr, en, ru };

/** The dictionary for a locale (server side; the client gets it as a prop). */
export const getDict = (lang: Locale): Dict => DICTS[lang];
