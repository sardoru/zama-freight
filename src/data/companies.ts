// Demo network. Every company, person and plate here is fictional; the names
// were web-checked against real businesses (docs/fictional-names.md) and the
// plates use a "DEMO-" format that no registration system issues.
import type { Carrier, Driver, Shipper, Vehicle, VehicleEvent } from "./types";

export const SHIPPERS: Shipper[] = [
  { id: "s-itsaso", name: "Itsaso Kontserbak", sector: "food", place: "lezo" },
  { id: "s-burdin", name: "Burdin Steel Coils", sector: "steel", place: "pasaia" },
  { id: "s-paper", name: "Urumea Paper", sector: "paper", place: "hernani" },
  { id: "s-sagardoa", name: "Astigarraga Sagardo Koop.", sector: "beverages", place: "astigarraga" },
  { id: "s-surf", name: "Côte Basque Surf", sector: "surf", place: "anglet" },
  { id: "s-horeca", name: "Donosti Horeca Supply", sector: "food", place: "belartza" },
  { id: "s-mobel", name: "Lizarzur Altzariak", sector: "furniture", place: "irun" },
  { id: "s-agri", name: "Adour Agri", sector: "agri", place: "bayonnePort" },
  { id: "s-pharma", name: "Txingudi Pharma", sector: "pharma", place: "hondarribia" },
  { id: "s-parts", name: "Lasarte Auto Parts", sector: "parts", place: "lasarte" },
];

// Licences follow what each carrier actually runs: anyone with international
// jobs holds its own country's Community licence; Urumea Express works only
// inside Spain (a 12 t rigid, so MDP rather than MDL).
export const CARRIERS: Carrier[] = [
  { id: "c-txingudi", name: "Txingudi Garraioak", country: "ES", base: "irun", rating: 4.8, jobs: 1240, licence: "community", languages: ["eu", "es", "fr"], founded: 1998 },
  { id: "c-urumea", name: "Urumea Express", country: "ES", base: "donostia", rating: 4.7, jobs: 860, licence: "MDP", languages: ["es", "eu", "en"], founded: 2019 },
  { id: "c-kantauri", name: "Kantauri Frigo", country: "ES", base: "pasaia", rating: 4.6, jobs: 640, licence: "community", languages: ["es", "eu", "fr"], founded: 2006 },
  { id: "c-adour", name: "Adour Transports", country: "FR", base: "bayonne", rating: 4.5, jobs: 980, licence: "community", languages: ["fr", "eu", "es"], founded: 1987 },
  { id: "c-labourd", name: "Labourd Messagerie", country: "FR", base: "biarritz", rating: 4.4, jobs: 410, licence: "community", languages: ["fr", "en"], founded: 2015 },
  { id: "c-baltic", name: "Rūkagiris Cargo", country: "LT", base: "zaisa", rating: 4.3, jobs: 2210, licence: "community", languages: ["ru", "en"], founded: 2009 },
  { id: "c-aiako", name: "Aiako Harria Logistika", country: "ES", base: "oiartzun", rating: 4.7, jobs: 530, licence: "community", languages: ["eu", "es"], founded: 2011 },
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

const ARTIC = 40_000;
const RIGID = 12_000;
const VAN = 3_500;

// Plates: DEMO-<digits> for Spanish vehicles, DEMO-F-… for French and DEMO-LT-…
// for Lithuanian ones. Every vehicle over 3.5 t has a tachograph; light vans
// have one only where fitted. Two vans have no DGT label: v-ur3 holds the ZBE
// delivery authorisation, v-tx5 doesn't (and has no tachograph either).
export const VEHICLES: Vehicle[] = [
  { id: "v-tx1", carrierId: "c-txingudi", plate: "DEMO-4821", type: "artic", eco: "C", driverId: "d-iker", home: "irun", mma: ARTIC, tachograph: true },
  { id: "v-tx2", carrierId: "c-txingudi", plate: "DEMO-7310", type: "artic", eco: "C", driverId: "d-ane", home: "irun", mma: ARTIC, tachograph: true },
  { id: "v-tx3", carrierId: "c-txingudi", plate: "DEMO-2954", type: "rigid", eco: "C", driverId: "d-jon", home: "zaisa", mma: RIGID, tachograph: true },
  { id: "v-tx4", carrierId: "c-txingudi", plate: "DEMO-6047", type: "reefer", eco: "C", driverId: "d-maialen", home: "irun", mma: ARTIC, tachograph: true },
  { id: "v-tx5", carrierId: "c-txingudi", plate: "DEMO-8812", type: "van", eco: "none", driverId: "d-unai", home: "irun", mma: VAN, tachograph: false },
  { id: "v-ur1", carrierId: "c-urumea", plate: "DEMO-0193", type: "van", eco: "0", driverId: "d-nerea", home: "donostia", mma: VAN, tachograph: false, electric: true },
  { id: "v-ur2", carrierId: "c-urumea", plate: "DEMO-0277", type: "van", eco: "0", driverId: "d-asier", home: "belartza", mma: VAN, tachograph: false, electric: true },
  { id: "v-ur3", carrierId: "c-urumea", plate: "DEMO-3318", type: "van", eco: "none", driverId: "d-leire", home: "donostia", mma: VAN, tachograph: false, zbeDeliveryAuth: true },
  { id: "v-ur4", carrierId: "c-urumea", plate: "DEMO-5590", type: "rigid", eco: "ECO", driverId: "d-gorka", home: "belartza", mma: RIGID, tachograph: true },
  { id: "v-kf1", carrierId: "c-kantauri", plate: "DEMO-5521", type: "reefer", eco: "C", driverId: "d-xabier", home: "pasaia", mma: ARTIC, tachograph: true },
  { id: "v-kf2", carrierId: "c-kantauri", plate: "DEMO-1876", type: "reefer", eco: "C", driverId: "d-itziar", home: "lezo", mma: ARTIC, tachograph: true },
  { id: "v-kf3", carrierId: "c-kantauri", plate: "DEMO-9043", type: "reefer", eco: "B", driverId: "d-peio", home: "pasaia", mma: ARTIC, tachograph: true },
  { id: "v-ad1", carrierId: "c-adour", plate: "DEMO-F-482", type: "artic", eco: "C", driverId: "d-julien", home: "bayonne", mma: ARTIC, tachograph: true },
  { id: "v-ad2", carrierId: "c-adour", plate: "DEMO-F-315", type: "artic", eco: "C", driverId: "d-maite", home: "bayonnePort", mma: ARTIC, tachograph: true },
  { id: "v-ad3", carrierId: "c-adour", plate: "DEMO-F-907", type: "rigid", eco: "C", driverId: "d-pierre", home: "anglet", mma: RIGID, tachograph: true },
  { id: "v-ad4", carrierId: "c-adour", plate: "DEMO-F-140", type: "flatbed", eco: "C", driverId: "d-celine", home: "bayonnePort", mma: ARTIC, tachograph: true },
  { id: "v-lb1", carrierId: "c-labourd", plate: "DEMO-F-221", type: "van", eco: "ECO", driverId: "d-thomas", home: "biarritz", mma: VAN, tachograph: true },
  { id: "v-lb2", carrierId: "c-labourd", plate: "DEMO-F-604", type: "van", eco: "0", driverId: "d-amaia", home: "anglet", mma: VAN, tachograph: true, electric: true },
  { id: "v-lb3", carrierId: "c-labourd", plate: "DEMO-F-388", type: "rigid", eco: "C", driverId: "d-lucas", home: "biarritz", mma: RIGID, tachograph: true },
  { id: "v-br1", carrierId: "c-baltic", plate: "DEMO-LT-418", type: "artic", eco: "C", driverId: "d-andrei", home: "zaisa", mma: ARTIC, tachograph: true },
  { id: "v-br2", carrierId: "c-baltic", plate: "DEMO-LT-702", type: "artic", eco: "C", driverId: "d-tomas", home: "zaisa", mma: ARTIC, tachograph: true },
  { id: "v-br3", carrierId: "c-baltic", plate: "DEMO-LT-113", type: "reefer", eco: "C", driverId: "d-olga", home: "zaisa", mma: ARTIC, tachograph: true },
  { id: "v-ai1", carrierId: "c-aiako", plate: "DEMO-6634", type: "flatbed", eco: "C", driverId: "d-mikel", home: "oiartzun", mma: ARTIC, tachograph: true },
  { id: "v-ai2", carrierId: "c-aiako", plate: "DEMO-7720", type: "flatbed", eco: "C", driverId: "d-eneko", home: "pasaia", mma: ARTIC, tachograph: true },
  { id: "v-ai3", carrierId: "c-aiako", plate: "DEMO-3105", type: "artic", eco: "ECO", driverId: "d-josu", home: "oiartzun", mma: ARTIC, tachograph: true },
];

/**
 * Where the foreign-registered work of each vehicle stood when the demo
 * opened (see VehicleEvent). Together with the loads in the store this is the
 * cabotage ledger in lib/cabotage.ts. Chosen so the demo shows every case:
 *  • v-tx2 (ES) unloaded in France this morning: a fresh window, 0 of 3.
 *  • v-tx1 (ES) has used 2 of 3 in France; v-tx3 (ES) has used all 3.
 *  • v-ad1 (FR), v-lb1 (FR) and v-br1 (LT) did cabotage in Spain and have left
 *    it, so a 4-day cooling-off runs there; v-br2 (LT) likewise in France.
 *  • v-ad3, v-lb2, v-lb3 (FR) and v-br3 (LT) unloaded in Spain recently and
 *    may start cabotage there; v-kf2 (ES) may in France.
 */
export const VEHICLE_HISTORY: VehicleEvent[] = [
  { vehicleId: "v-tx1", kind: "international", country: "FR", daysAgo: 2 },
  { vehicleId: "v-tx1", kind: "cabotage", country: "FR", daysAgo: 1.6 },
  { vehicleId: "v-tx1", kind: "cabotage", country: "FR", daysAgo: 1.1 },
  { vehicleId: "v-tx2", kind: "international", country: "FR", daysAgo: 0.6 },
  { vehicleId: "v-tx3", kind: "international", country: "FR", daysAgo: 3 },
  { vehicleId: "v-tx3", kind: "cabotage", country: "FR", daysAgo: 2.5 },
  { vehicleId: "v-tx3", kind: "cabotage", country: "FR", daysAgo: 2 },
  { vehicleId: "v-tx3", kind: "cabotage", country: "FR", daysAgo: 1.5 },
  { vehicleId: "v-kf2", kind: "international", country: "FR", daysAgo: 0.3 },
  { vehicleId: "v-ad1", kind: "international", country: "ES", daysAgo: 2.5 },
  { vehicleId: "v-ad1", kind: "cabotage", country: "ES", daysAgo: 1.8 },
  { vehicleId: "v-ad1", kind: "cabotage", country: "ES", daysAgo: 1 },
  { vehicleId: "v-ad3", kind: "international", country: "ES", daysAgo: 0.5 },
  { vehicleId: "v-lb1", kind: "international", country: "ES", daysAgo: 1.2 },
  { vehicleId: "v-lb1", kind: "cabotage", country: "ES", daysAgo: 0.9 },
  { vehicleId: "v-lb2", kind: "international", country: "ES", daysAgo: 0.4 },
  { vehicleId: "v-lb3", kind: "international", country: "ES", daysAgo: 0.7 },
  { vehicleId: "v-br1", kind: "international", country: "ES", daysAgo: 3 },
  { vehicleId: "v-br1", kind: "cabotage", country: "ES", daysAgo: 2.2 },
  { vehicleId: "v-br1", kind: "cabotage", country: "ES", daysAgo: 1.4 },
  { vehicleId: "v-br2", kind: "international", country: "FR", daysAgo: 5 },
  { vehicleId: "v-br2", kind: "cabotage", country: "FR", daysAgo: 4.2 },
  { vehicleId: "v-br2", kind: "cabotage", country: "FR", daysAgo: 3.1 },
  { vehicleId: "v-br2", kind: "cabotage", country: "FR", daysAgo: 2 },
  { vehicleId: "v-br3", kind: "international", country: "ES", daysAgo: 1 },
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
