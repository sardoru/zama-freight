// Demo network. Every company, person and plate here is fictional.
import type { Carrier, Driver, Shipper, Vehicle } from "./types";

export const SHIPPERS: Shipper[] = [
  { id: "s-itsaso", name: "Itsaso Kontserbak", sector: "food", place: "lezo" },
  { id: "s-burdin", name: "Burdin Steel Coils", sector: "steel", place: "pasaia" },
  { id: "s-paper", name: "Urumea Paper", sector: "paper", place: "hernani" },
  { id: "s-sagardoa", name: "Astigarraga Sagardo Koop.", sector: "beverages", place: "astigarraga" },
  { id: "s-surf", name: "Côte Basque Surf", sector: "surf", place: "anglet" },
  { id: "s-horeca", name: "Donosti Horeca Supply", sector: "food", place: "belartza" },
  { id: "s-mobel", name: "Bidasoa Mobel", sector: "furniture", place: "irun" },
  { id: "s-agri", name: "Adour Agri", sector: "agri", place: "bayonnePort" },
  { id: "s-pharma", name: "Txingudi Pharma", sector: "pharma", place: "hondarribia" },
  { id: "s-parts", name: "Lasarte Auto Parts", sector: "parts", place: "lasarte" },
];

export const CARRIERS: Carrier[] = [
  { id: "c-txingudi", name: "Txingudi Garraioak", country: "ES", base: "irun", rating: 4.8, jobs: 1240, licence: "community", languages: ["eu", "es", "fr"], founded: 1998 },
  { id: "c-urumea", name: "Urumea Express", country: "ES", base: "donostia", rating: 4.7, jobs: 860, licence: "MDL", languages: ["es", "eu", "en"], founded: 2019 },
  { id: "c-kantauri", name: "Kantauri Frigo", country: "ES", base: "pasaia", rating: 4.6, jobs: 640, licence: "community", languages: ["es", "eu", "fr"], founded: 2006 },
  { id: "c-adour", name: "Adour Transports", country: "FR", base: "bayonne", rating: 4.5, jobs: 980, licence: "community", languages: ["fr", "eu", "es"], founded: 1987 },
  { id: "c-labourd", name: "Labourd Messagerie", country: "FR", base: "biarritz", rating: 4.4, jobs: 410, licence: "MDL", languages: ["fr", "en"], founded: 2015 },
  { id: "c-baltic", name: "Baltic Road Cargo", country: "LT", base: "zaisa", rating: 4.3, jobs: 2210, licence: "community", languages: ["ru", "en"], founded: 2009 },
  { id: "c-aiako", name: "Aiako Harria Logistika", country: "ES", base: "oiartzun", rating: 4.7, jobs: 530, licence: "MDP", languages: ["eu", "es"], founded: 2011 },
];

export const DRIVERS: Driver[] = [
  { id: "d-iker", name: "Iker Etxeberria", carrierId: "c-txingudi", languages: ["eu", "es", "fr"] },
  { id: "d-ane", name: "Ane Goikoetxea", carrierId: "c-txingudi", languages: ["eu", "es"] },
  { id: "d-jon", name: "Jon Larrañaga", carrierId: "c-txingudi", languages: ["eu", "es", "en"] },
  { id: "d-maialen", name: "Maialen Uranga", carrierId: "c-txingudi", languages: ["eu", "es", "fr"] },
  { id: "d-unai", name: "Unai Ibarguren", carrierId: "c-txingudi", languages: ["eu", "es"] },
  { id: "d-nerea", name: "Nerea Zubizarreta", carrierId: "c-urumea", languages: ["es", "eu", "en"] },
  { id: "d-asier", name: "Asier Mendizabal", carrierId: "c-urumea", languages: ["eu", "es"] },
  { id: "d-leire", name: "Leire Aranburu", carrierId: "c-urumea", languages: ["es", "eu"] },
  { id: "d-gorka", name: "Gorka Olano", carrierId: "c-urumea", languages: ["eu", "es"] },
  { id: "d-xabier", name: "Xabier Arrieta", carrierId: "c-kantauri", languages: ["eu", "es", "fr"] },
  { id: "d-itziar", name: "Itziar Lasa", carrierId: "c-kantauri", languages: ["es", "eu"] },
  { id: "d-peio", name: "Peio Garmendia", carrierId: "c-kantauri", languages: ["eu", "es", "fr"] },
  { id: "d-julien", name: "Julien Etcheverry", carrierId: "c-adour", languages: ["fr", "eu", "es"] },
  { id: "d-maite", name: "Maite Dufau", carrierId: "c-adour", languages: ["fr", "es"] },
  { id: "d-pierre", name: "Pierre Lascaray", carrierId: "c-adour", languages: ["fr", "eu"] },
  { id: "d-celine", name: "Céline Harriet", carrierId: "c-adour", languages: ["fr", "en"] },
  { id: "d-thomas", name: "Thomas Bidegain", carrierId: "c-labourd", languages: ["fr", "eu"] },
  { id: "d-amaia", name: "Amaia Darritchon", carrierId: "c-labourd", languages: ["fr", "eu", "es"] },
  { id: "d-lucas", name: "Lucas Oyarzabal", carrierId: "c-labourd", languages: ["fr", "es"] },
  { id: "d-andrei", name: "Андрей Волков", carrierId: "c-baltic", languages: ["ru", "en"] },
  { id: "d-tomas", name: "Tomas Kazlauskas", carrierId: "c-baltic", languages: ["ru", "en"] },
  { id: "d-olga", name: "Ольга Петрова", carrierId: "c-baltic", languages: ["ru"] },
  { id: "d-mikel", name: "Mikel Arrieta", carrierId: "c-aiako", languages: ["eu", "es"] },
  { id: "d-eneko", name: "Eneko Zabala", carrierId: "c-aiako", languages: ["eu", "es", "en"] },
  { id: "d-josu", name: "Josu Etxaniz", carrierId: "c-aiako", languages: ["eu", "es"] },
];

export const VEHICLES: Vehicle[] = [
  { id: "v-tx1", carrierId: "c-txingudi", plate: "4821 LKM", type: "artic", eco: "C", driverId: "d-iker", home: "irun" },
  { id: "v-tx2", carrierId: "c-txingudi", plate: "7310 LMB", type: "artic", eco: "C", driverId: "d-ane", home: "irun" },
  { id: "v-tx3", carrierId: "c-txingudi", plate: "2954 LGT", type: "rigid", eco: "C", driverId: "d-jon", home: "zaisa" },
  { id: "v-tx4", carrierId: "c-txingudi", plate: "6047 LRS", type: "reefer", eco: "C", driverId: "d-maialen", home: "irun" },
  { id: "v-tx5", carrierId: "c-txingudi", plate: "8812 MBC", type: "van", eco: "ECO", driverId: "d-unai", home: "irun" },
  { id: "v-ur1", carrierId: "c-urumea", plate: "0193 MFJ", type: "van", eco: "0", driverId: "d-nerea", home: "donostia", electric: true },
  { id: "v-ur2", carrierId: "c-urumea", plate: "0277 MFJ", type: "van", eco: "0", driverId: "d-asier", home: "belartza", electric: true },
  { id: "v-ur3", carrierId: "c-urumea", plate: "3318 LXP", type: "van", eco: "ECO", driverId: "d-leire", home: "donostia" },
  { id: "v-ur4", carrierId: "c-urumea", plate: "5590 LWD", type: "rigid", eco: "ECO", driverId: "d-gorka", home: "belartza" },
  { id: "v-kf1", carrierId: "c-kantauri", plate: "5521 LZR", type: "reefer", eco: "C", driverId: "d-xabier", home: "pasaia" },
  { id: "v-kf2", carrierId: "c-kantauri", plate: "1876 MCH", type: "reefer", eco: "C", driverId: "d-itziar", home: "lezo" },
  { id: "v-kf3", carrierId: "c-kantauri", plate: "9043 LTV", type: "reefer", eco: "B", driverId: "d-peio", home: "pasaia" },
  { id: "v-ad1", carrierId: "c-adour", plate: "FT-482-KZ", type: "artic", eco: "C", driverId: "d-julien", home: "bayonne" },
  { id: "v-ad2", carrierId: "c-adour", plate: "GB-315-RA", type: "artic", eco: "C", driverId: "d-maite", home: "bayonnePort" },
  { id: "v-ad3", carrierId: "c-adour", plate: "FX-907-LM", type: "rigid", eco: "C", driverId: "d-pierre", home: "anglet" },
  { id: "v-ad4", carrierId: "c-adour", plate: "GE-140-TB", type: "flatbed", eco: "C", driverId: "d-celine", home: "bayonnePort" },
  { id: "v-lb1", carrierId: "c-labourd", plate: "GH-221-PB", type: "van", eco: "ECO", driverId: "d-thomas", home: "biarritz" },
  { id: "v-lb2", carrierId: "c-labourd", plate: "GK-604-EA", type: "van", eco: "0", driverId: "d-amaia", home: "anglet", electric: true },
  { id: "v-lb3", carrierId: "c-labourd", plate: "FZ-388-HN", type: "rigid", eco: "C", driverId: "d-lucas", home: "biarritz" },
  { id: "v-br1", carrierId: "c-baltic", plate: "KTA 418", type: "artic", eco: "C", driverId: "d-andrei", home: "zaisa" },
  { id: "v-br2", carrierId: "c-baltic", plate: "LHN 702", type: "artic", eco: "C", driverId: "d-tomas", home: "zaisa" },
  { id: "v-br3", carrierId: "c-baltic", plate: "MZK 113", type: "reefer", eco: "C", driverId: "d-olga", home: "zaisa" },
  { id: "v-ai1", carrierId: "c-aiako", plate: "6634 LFW", type: "flatbed", eco: "C", driverId: "d-mikel", home: "oiartzun" },
  { id: "v-ai2", carrierId: "c-aiako", plate: "7720 LHK", type: "flatbed", eco: "C", driverId: "d-eneko", home: "pasaia" },
  { id: "v-ai3", carrierId: "c-aiako", plate: "3105 MDN", type: "artic", eco: "ECO", driverId: "d-josu", home: "oiartzun" },
];

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
export const SHIPPER = byId(SHIPPERS);
export const CARRIER = byId(CARRIERS);
export const DRIVER = byId(DRIVERS);
export const VEHICLE = byId(VEHICLES);

/** Who "you" are in each role of the demo. */
export const ME = {
  shipperId: "s-itsaso",
  carrierId: "c-txingudi",
} as const;
