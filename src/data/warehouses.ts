// The six warehouses of the demo network and what is on their racks. Operators
// are fictional; the locations are the corridor's real logistics areas.
import { hash, rng } from "@/lib/random";
import type { Abc, Bin, Sku, TempZone, Warehouse, WarehouseId } from "./types";

export const SKUS: Sku[] = [
  { id: "sku-bonito", name: "Bonito del Norte en aceite · 24×250 g", goods: "food", ownerId: "s-itsaso", velocity: 22, unit: "cs", perPallet: 120, temp: "ambient", shelfLifeDays: 1460 },
  { id: "sku-anchoa", name: "Anchoas del Cantábrico · 48×50 g", goods: "chilled", ownerId: "s-itsaso", velocity: 18, unit: "cs", perPallet: 160, temp: "chilled", shelfLifeDays: 180 },
  { id: "sku-merluza", name: "Merluza congelada · caja 10 kg", goods: "frozen", ownerId: "s-itsaso", velocity: 14, unit: "cs", perPallet: 80, temp: "frozen", shelfLifeDays: 540 },
  { id: "sku-txangurro", name: "Txangurro gratinado · 12×300 g", goods: "frozen", ownerId: "s-itsaso", velocity: 6, unit: "cs", perPallet: 96, temp: "frozen", shelfLifeDays: 365 },
  { id: "sku-aceite", name: "Aceite de oliva virgen extra · 6×1 L", goods: "food", ownerId: "s-horeca", velocity: 16, unit: "cs", perPallet: 90, temp: "ambient", shelfLifeDays: 540 },
  { id: "sku-txakoli", name: "Getariako Txakolina · 6×75 cl", goods: "beverages", ownerId: "s-horeca", velocity: 12, unit: "cs", perPallet: 100, temp: "ambient", shelfLifeDays: 730 },
  { id: "sku-idiazabal", name: "Idiazabal D.O. · 12×1 kg", goods: "chilled", ownerId: "s-horeca", velocity: 9, unit: "cs", perPallet: 72, temp: "chilled", shelfLifeDays: 120 },
  { id: "sku-servilleta", name: "Servilletas 40×40 · 2.400 u.", goods: "pallets", ownerId: "s-horeca", velocity: 5, unit: "cs", perPallet: 40, temp: "ambient" },
  { id: "sku-sagardo", name: "Sagardo naturala · 12×70 cl", goods: "beverages", ownerId: "s-sagardoa", velocity: 15, unit: "cs", perPallet: 84, temp: "ambient", shelfLifeDays: 365 },
  { id: "sku-sagardo-berria", name: "Sagardo berria · 12×70 cl", goods: "beverages", ownerId: "s-sagardoa", velocity: 20, unit: "cs", perPallet: 84, temp: "ambient", shelfLifeDays: 270 },
  { id: "sku-board", name: "Planche de surf 7'2 · lot de 4", goods: "surf", ownerId: "s-surf", velocity: 4, unit: "lot", perPallet: 12, temp: "ambient" },
  { id: "sku-wetsuit", name: "Combinaison 4/3 · carton de 20", goods: "surf", ownerId: "s-surf", velocity: 11, unit: "ctn", perPallet: 30, temp: "ambient" },
  { id: "sku-wax", name: "Wax tropical · carton de 200", goods: "surf", ownerId: "s-surf", velocity: 3, unit: "ctn", perPallet: 48, temp: "ambient" },
  { id: "sku-sofa", name: "Sofá 3 plazas · embalado", goods: "furniture", ownerId: "s-mobel", velocity: 3, unit: "pc", perPallet: 2, temp: "ambient" },
  { id: "sku-mesa", name: "Mesa roble 180 cm · embalada", goods: "furniture", ownerId: "s-mobel", velocity: 4, unit: "pc", perPallet: 6, temp: "ambient" },
  { id: "sku-silla", name: "Silla de haya · caja de 4", goods: "furniture", ownerId: "s-mobel", velocity: 8, unit: "ctn", perPallet: 16, temp: "ambient" },
  { id: "sku-kraft", name: "Bobina kraft 125 g/m² · 1,2 t", goods: "paper", ownerId: "s-paper", velocity: 5, unit: "roll", perPallet: 1, temp: "ambient" },
  { id: "sku-carton", name: "Cartón ondulado BC · 400 planchas", goods: "paper", ownerId: "s-paper", velocity: 7, unit: "pal", perPallet: 1, temp: "ambient" },
  { id: "sku-pastilla", name: "Pastillas de freno · caja de 400", goods: "parts", ownerId: "s-parts", velocity: 19, unit: "ctn", perPallet: 24, temp: "ambient" },
  { id: "sku-filtro", name: "Filtro de aceite · caja de 600", goods: "parts", ownerId: "s-parts", velocity: 24, unit: "ctn", perPallet: 20, temp: "ambient" },
  { id: "sku-amortiguador", name: "Amortiguador · caja de 60", goods: "parts", ownerId: "s-parts", velocity: 7, unit: "ctn", perPallet: 18, temp: "ambient" },
  { id: "sku-mais", name: "Maïs grain · big bag 1 t", goods: "agri", ownerId: "s-agri", velocity: 6, unit: "bag", perPallet: 1, temp: "ambient" },
  { id: "sku-engrais", name: "Engrais NPK 15-15-15 · big bag 600 kg", goods: "agri", ownerId: "s-agri", velocity: 4, unit: "bag", perPallet: 1, temp: "ambient" },
  { id: "sku-vaccin", name: "Vaccins 2–8 °C · caisse isotherme", goods: "pharma", ownerId: "s-pharma", velocity: 10, unit: "box", perPallet: 40, temp: "chilled", shelfLifeDays: 270 },
  { id: "sku-insuline", name: "Insuline 2–8 °C · carton de 500", goods: "pharma", ownerId: "s-pharma", velocity: 13, unit: "ctn", perPallet: 30, temp: "chilled", shelfLifeDays: 240 },
  { id: "sku-chapa", name: "Chapa galvanizada 1,5 mm · paquete 2 t", goods: "steel", ownerId: "s-burdin", velocity: 3, unit: "pk", perPallet: 1, temp: "ambient" },
  { id: "sku-perfil", name: "Perfil IPE 160 · haz 1,8 t", goods: "steel", ownerId: "s-burdin", velocity: 2, unit: "bdl", perPallet: 1, temp: "ambient" },
];

export const SKU = new Map(SKUS.map((s) => [s.id, s]));

const zones = (...parts: [TempZone, number][]): TempZone[] => parts.flatMap(([z, n]) => Array<TempZone>(n).fill(z));

export const WAREHOUSES: Warehouse[] = [
  {
    id: "w-zaisa",
    name: "Zaisa Cross-Dock",
    place: "zaisa",
    operator: "Bidasoa Logistika",
    kind: "crossdock",
    sqm: 14_500,
    doors: 10,
    rows: 10,
    bays: 14,
    levels: 4,
    amr: 6,
    rowZones: zones(["ambient", 8], ["bonded", 2]),
    hours: "24/7",
    assortment: ["sku-pastilla", "sku-filtro", "sku-amortiguador", "sku-sofa", "sku-mesa", "sku-silla", "sku-wetsuit", "sku-board", "sku-bonito", "sku-carton", "sku-mais"],
  },
  {
    id: "w-oiartzun",
    name: "Ugaldetxo DC",
    place: "oiartzun",
    operator: "Aiako Logistika Parkea",
    kind: "dc",
    sqm: 22_000,
    doors: 12,
    rows: 12,
    bays: 16,
    levels: 5,
    amr: 10,
    rowZones: zones(["ambient", 12]),
    hours: "06:00–22:00",
    assortment: ["sku-bonito", "sku-aceite", "sku-txakoli", "sku-servilleta", "sku-sagardo", "sku-sagardo-berria", "sku-sofa", "sku-mesa", "sku-silla", "sku-pastilla", "sku-filtro", "sku-wetsuit", "sku-wax", "sku-carton"],
  },
  {
    id: "w-pasaia",
    name: "Herrera Port Warehouse",
    place: "pasaia",
    operator: "Herrera Terminal",
    kind: "port",
    sqm: 9_000,
    doors: 8,
    rows: 6,
    bays: 12,
    levels: 3,
    amr: 2,
    rowZones: zones(["ambient", 4], ["bonded", 2]),
    hours: "06:00–22:00",
    assortment: ["sku-chapa", "sku-perfil", "sku-kraft", "sku-carton", "sku-bonito", "sku-mais"],
  },
  {
    id: "w-lezo",
    name: "Lezo Cold Store",
    place: "lezo",
    operator: "Kantauri Hotza",
    kind: "cold",
    sqm: 7_200,
    doors: 6,
    rows: 6,
    bays: 10,
    levels: 4,
    amr: 2,
    rowZones: zones(["chilled", 3], ["frozen", 3]),
    hours: "24/7",
    assortment: ["sku-anchoa", "sku-merluza", "sku-txangurro", "sku-idiazabal", "sku-vaccin", "sku-insuline"],
  },
  {
    id: "w-belartza",
    name: "Belartza Urban Hub",
    place: "belartza",
    operator: "Donostia Hiri Logistika",
    kind: "urban",
    sqm: 4_800,
    doors: 6,
    rows: 6,
    bays: 10,
    levels: 3,
    amr: 3,
    rowZones: zones(["ambient", 4], ["chilled", 2]),
    hours: "05:00–21:00",
    assortment: ["sku-aceite", "sku-txakoli", "sku-servilleta", "sku-sagardo", "sku-bonito", "sku-idiazabal", "sku-anchoa"],
  },
  {
    id: "w-bayonne",
    name: "Adour Depot",
    place: "bayonnePort",
    operator: "Entrepôts de l'Adour",
    kind: "depot",
    sqm: 11_000,
    doors: 8,
    rows: 8,
    bays: 12,
    levels: 4,
    amr: 4,
    rowZones: zones(["ambient", 7], ["chilled", 1]),
    hours: "06:00–21:00",
    assortment: ["sku-mais", "sku-engrais", "sku-board", "sku-wetsuit", "sku-wax", "sku-sagardo", "sku-mesa", "sku-vaccin"],
  },
];

export const WAREHOUSE = new Map(WAREHOUSES.map((w) => [w.id, w]));

const pad = (n: number) => String(n).padStart(2, "0");
export const binLoc = (row: number, bay: number, level: number) => `R${pad(row + 1)}-B${pad(bay + 1)}-L${level + 1}`;

export const abcOf = (picksPerDay: number): Abc => (picksPerDay >= 16 ? "A" : picksPerDay >= 7 ? "B" : "C");

const ZONE_TEMP: Record<TempZone, [number, number]> = { ambient: [17, 2.2], chilled: [3.1, 0.7], frozen: [-21, 1.3], bonded: [16, 2] };

/** Every pallet position of a warehouse with what is in it (deterministic). */
export function buildBins(w: Warehouse): Bin[] {
  const r = rng(hash(w.id));
  const bins: Bin[] = [];
  const skus = w.assortment.map((id) => SKU.get(id)!).filter(Boolean);
  for (let row = 0; row < w.rows; row++) {
    const zone = w.rowZones[row] ?? "ambient";
    const fit = skus.filter((s) => (zone === "bonded" ? s.temp === "ambient" : s.temp === zone));
    for (let bay = 0; bay < w.bays; bay++) {
      for (let level = 0; level < w.levels; level++) {
        const loc = binLoc(row, bay, level);
        const [t0, spread] = ZONE_TEMP[zone];
        const tempC = Math.round((t0 + (r.next() - 0.5) * 2 * spread) * 10) / 10;
        const emptyP = 0.16 + level * 0.035 + (bay > w.bays * 0.75 ? 0.08 : 0);
        if (!fit.length || r.chance(emptyP)) {
          bins.push({ loc, row, bay, level, zone, status: "empty", tempC, countedDaysAgo: r.int(0, 90) });
          continue;
        }
        const sku = r.pick(fit);
        const picksPerDay = Math.max(0, Math.round(sku.velocity * (0.5 + r.next()) * (level === 0 ? 1.15 : 0.85)));
        const roll = r.next();
        const status =
          zone === "bonded" && roll < 0.12
            ? "quarantine"
            : roll < 0.015
              ? "blocked"
              : roll < 0.06
                ? "reserved"
                : roll < 0.09 && level === 0
                  ? "picking"
                  : "stored";
        bins.push({
          loc,
          row,
          bay,
          level,
          zone,
          status,
          sku: sku.id,
          qty: Math.max(1, Math.round(sku.perPallet * (0.25 + r.next() * 0.75))),
          lot: `L${26}${pad(r.int(1, 43))}-${r.int(100, 999)}`,
          expiryDays: sku.shelfLifeDays ? r.int(Math.round(sku.shelfLifeDays * 0.04), sku.shelfLifeDays) : undefined,
          abc: abcOf(picksPerDay),
          picksPerDay,
          // Most positions were counted recently; a tail is overdue.
          countedDaysAgo: Math.round(r.next() ** 3 * 90),
          tempC,
        });
      }
    }
  }
  return bins;
}

const CONTENT = ["sku", "qty", "lot", "expiryDays", "abc", "picksPerDay"] as const;

/**
 * Applies a saved patch to a seeded bin. JSON drops `undefined`, so a patch that
 * empties a position or brings a pallet into it replaces the seeded contents
 * instead of merging with them.
 */
export function applyBinPatch(b: Bin, p: Partial<Bin> | undefined): Bin {
  if (!p) return b;
  const out: Bin = { ...b };
  if (p.status === "empty" || p.sku !== undefined) for (const k of CONTENT) delete out[k];
  return { ...out, ...p };
}

/** Walking metres from the dock face to a pick position (bays run away from the doors). */
export const travelMeters = (bin: Pick<Bin, "bay" | "level">) => 6 + bin.bay * 2.8 + bin.level * 4.5;

export interface SlotMove {
  from: Bin;
  to: Bin;
  /** Metres of walking saved a day (out and back for every pick). */
  savedMetersPerDay: number;
}

/**
 * Slotting advice: fast movers parked far from the doors or high up, paired
 * with empty, low, near-door positions in the same temperature zone.
 */
export function slottingAdvice(bins: Bin[], limit = 6): SlotMove[] {
  const movers = bins
    .filter((b) => b.status === "stored" && b.abc === "A")
    .sort((a, b) => (b.picksPerDay ?? 0) * travelMeters(b) - (a.picksPerDay ?? 0) * travelMeters(a));
  const free = bins.filter((b) => b.status === "empty" && b.level <= 1).sort((a, b) => travelMeters(a) - travelMeters(b));
  const taken = new Set<string>();
  const out: SlotMove[] = [];
  for (const m of movers) {
    const target = free.find((f) => !taken.has(f.loc) && f.zone === m.zone && travelMeters(f) + 8 < travelMeters(m));
    if (!target) continue;
    taken.add(target.loc);
    out.push({ from: m, to: target, savedMetersPerDay: Math.round((travelMeters(m) - travelMeters(target)) * 2 * (m.picksPerDay ?? 0)) });
    if (out.length >= limit) break;
  }
  return out;
}

export function occupancy(bins: Bin[]): number {
  return bins.length ? bins.filter((b) => b.status !== "empty").length / bins.length : 0;
}

/** Bins due for a cycle count: A every 30 days, B every 60, C every 120. */
export function countDue(bins: Bin[]): Bin[] {
  const every: Record<Abc, number> = { A: 30, B: 60, C: 120 };
  return bins.filter((b) => b.status !== "empty" && b.abc && (b.countedDaysAgo ?? 0) > every[b.abc]);
}

export type WarehouseCatalog = Record<WarehouseId, Bin[]>;
