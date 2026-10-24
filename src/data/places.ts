// The first service area: Donostia / San Sebastián, the port of Pasaia, Irun
// and the Bidasoa border, and across it the Biarritz–Anglet–Bayonne coast.
// Names follow what people say in each language (Basque official names in eu).
import type { Locale } from "@/i18n/config";
import type { LngLat } from "@/lib/geo";

export type PlaceId =
  | "donostia"
  | "belartza"
  | "pasaia"
  | "errenteria"
  | "lezo"
  | "oiartzun"
  | "hernani"
  | "lasarte"
  | "astigarraga"
  | "irun"
  | "zaisa"
  | "hondarribia"
  | "hendaye"
  | "sjdl"
  | "bidart"
  | "biarritz"
  | "anglet"
  | "bayonne"
  | "bayonnePort";

export type PlaceKind = "city" | "port" | "industrial" | "town";

export interface Place {
  id: PlaceId;
  names: Record<Locale, string>;
  lnglat: LngLat;
  country: "ES" | "FR";
  kind: PlaceKind;
  /** Inside Donostia's low-emission zone (vehicles need an eco label). */
  zbe?: boolean;
  /** Shown as a hub on the landing page and the map's fly-to list. */
  hub?: boolean;
}

const n = (es: string, eu: string, fr: string, en: string, ru: string): Record<Locale, string> => ({ es, eu, fr, en, ru });

export const PLACES: Record<PlaceId, Place> = {
  donostia: { id: "donostia", names: n("San Sebastián", "Donostia", "Saint-Sébastien", "San Sebastián", "Сан-Себастьян"), lnglat: [-1.9812, 43.3195], country: "ES", kind: "city", zbe: true, hub: true },
  belartza: { id: "belartza", names: n("Belartza (Donostia)", "Belartza (Donostia)", "Belartza (Saint-Sébastien)", "Belartza (San Sebastián)", "Беларца (Сан-Себастьян)"), lnglat: [-2.0085, 43.2935], country: "ES", kind: "industrial" },
  pasaia: { id: "pasaia", names: n("Puerto de Pasaia", "Pasaiako portua", "Port de Pasaia", "Port of Pasaia", "Порт Пасайя"), lnglat: [-1.924, 43.3225], country: "ES", kind: "port", hub: true },
  errenteria: { id: "errenteria", names: n("Errenteria", "Errenteria", "Errenteria", "Errenteria", "Эррентерия"), lnglat: [-1.899, 43.3125], country: "ES", kind: "town" },
  lezo: { id: "lezo", names: n("Lezo", "Lezo", "Lezo", "Lezo", "Лесо"), lnglat: [-1.8985, 43.3205], country: "ES", kind: "industrial" },
  oiartzun: { id: "oiartzun", names: n("Oiartzun (Ugaldetxo)", "Oiartzun (Ugaldetxo)", "Oiartzun (Ugaldetxo)", "Oiartzun (Ugaldetxo)", "Ойярсун (Угальдечо)"), lnglat: [-1.8597, 43.3006], country: "ES", kind: "industrial" },
  hernani: { id: "hernani", names: n("Hernani", "Hernani", "Hernani", "Hernani", "Эрнани"), lnglat: [-1.9771, 43.2662], country: "ES", kind: "town" },
  lasarte: { id: "lasarte", names: n("Lasarte-Oria", "Lasarte-Oria", "Lasarte-Oria", "Lasarte-Oria", "Ласарте-Ория"), lnglat: [-2.0195, 43.2672], country: "ES", kind: "town" },
  astigarraga: { id: "astigarraga", names: n("Astigarraga", "Astigarraga", "Astigarraga", "Astigarraga", "Астигаррага"), lnglat: [-1.9469, 43.2814], country: "ES", kind: "town" },
  irun: { id: "irun", names: n("Irun", "Irun", "Irun", "Irun", "Ирун"), lnglat: [-1.7894, 43.3381], country: "ES", kind: "city", hub: true },
  zaisa: { id: "zaisa", names: n("Zaisa (Irun)", "Zaisa (Irun)", "Zaisa (Irun)", "Zaisa (Irun)", "Заиса (Ирун)"), lnglat: [-1.766, 43.3378], country: "ES", kind: "industrial" },
  hondarribia: { id: "hondarribia", names: n("Hondarribia", "Hondarribia", "Fontarrabie", "Hondarribia", "Ондаррибия"), lnglat: [-1.7957, 43.3675], country: "ES", kind: "town" },
  hendaye: { id: "hendaye", names: n("Hendaya", "Hendaia", "Hendaye", "Hendaye", "Андай"), lnglat: [-1.7744, 43.3586], country: "FR", kind: "town" },
  sjdl: { id: "sjdl", names: n("San Juan de Luz", "Donibane Lohizune", "Saint-Jean-de-Luz", "Saint-Jean-de-Luz", "Сен-Жан-де-Люз"), lnglat: [-1.6634, 43.3881], country: "FR", kind: "town" },
  bidart: { id: "bidart", names: n("Bidart", "Bidarte", "Bidart", "Bidart", "Бидар"), lnglat: [-1.5911, 43.437], country: "FR", kind: "town" },
  biarritz: { id: "biarritz", names: n("Biarritz", "Miarritze", "Biarritz", "Biarritz", "Биарриц"), lnglat: [-1.5586, 43.4832], country: "FR", kind: "city", hub: true },
  anglet: { id: "anglet", names: n("Anglet", "Angelu", "Anglet", "Anglet", "Англет"), lnglat: [-1.516, 43.485], country: "FR", kind: "town" },
  bayonne: { id: "bayonne", names: n("Bayona", "Baiona", "Bayonne", "Bayonne", "Байонна"), lnglat: [-1.4748, 43.4929], country: "FR", kind: "city", hub: true },
  bayonnePort: { id: "bayonnePort", names: n("Puerto de Bayona", "Baionako portua", "Port de Bayonne", "Port of Bayonne", "Порт Байонны"), lnglat: [-1.487, 43.511], country: "FR", kind: "port" },
};

export const PLACE_IDS = Object.keys(PLACES) as PlaceId[];

export const placeName = (id: PlaceId, lang: Locale) => PLACES[id].names[lang];

/** Camera presets for the map's "fly to" menu: [lng, lat, zoom, pitch, bearing]. */
export const VIEWS = {
  corridor: [-1.735, 43.392, 10.15, 52, -32],
  donostia: [-1.975, 43.312, 13.4, 60, 25],
  pasaia: [-1.922, 43.319, 14.2, 62, -40],
  border: [-1.768, 43.344, 13.6, 60, -60],
  biarritz: [-1.52, 43.49, 12.6, 58, 20],
} as const satisfies Record<string, readonly [number, number, number, number, number]>;

export type ViewId = keyof typeof VIEWS;
