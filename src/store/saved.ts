// What this browser remembers between visits: the market clock, your role and
// map settings, the loads you posted (with every bid on them), your open bids,
// your return trips (and a seeded trip carrying one of your loads), dock
// bookings and bin moves. Everything else is re-seeded on every visit.
//
// Saved data is untrusted: it can come from an older build or be edited by
// hand. Every record is checked against the catalogues (places, vehicles,
// carriers, shippers, warehouses, SKUs) and dropped if it doesn't fit, so a
// bad record costs that record, never the app.
import { CARRIER, SHIPPER, VEHICLE } from "@/data/companies";
import { PLACES, type PlaceId } from "@/data/places";
import { CARRIES } from "@/data/seed";
import type { Abc, Bid, Bin, BinStatus, DockAppt, EcmrState, GoodsType, Load, LoadStatus, ReturnTrip, Role, WarehouseId } from "@/data/types";
import { binLoc, SKU, WAREHOUSE } from "@/data/warehouses";
import type { TimePreset } from "@/lib/sun";
import type { MapLayers, Settings } from "./market";

/** The key keeps its first name so older saves are found (and migrated); the payload carries the schema version. */
export const STORAGE_KEY = "zama-demo-v1";
/**
 * Version of the saved payload. Bump it whenever its shape changes, and
 * teach readSaved to read the older versions.
 * 1: the first release (later builds added an optional `clock`).
 * 2: `clock` is always there, and `seq` (the number of your next load) is new.
 */
export const STORAGE_VERSION = 2;

/** The market clock when the state was saved: every time in it is market time. */
export interface SavedClock {
  real: number;
  sim: number;
  speed: number;
}

/** Loads you post: ZM-5001, ZM-5002, … (older builds saved ZM-5<time><n>). */
const USER_LOAD = /^ZM-5(\d{1,12})$/;
export const isUserLoadId = (id: string) => USER_LOAD.test(id);
export const userLoadId = (n: number) => `ZM-5${String(n).padStart(3, "0")}`;
/** The number after ZM-5, or 0. */
export const userLoadNumber = (id: string) => Number(USER_LOAD.exec(id)?.[1] ?? 0);
export const isUserReturnId = (id: string) => id.startsWith("rt-me-");

export interface Saved {
  v: typeof STORAGE_VERSION;
  clock: SavedClock;
  role: Role;
  settings: Settings;
  /** Number of the next load you post, so a load id is never handed out twice. */
  seq: number;
  loads: Load[];
  bids: Bid[];
  returns: ReturnTrip[];
  docks: DockAppt[];
  /** Keyed "<warehouse>|<location>". */
  binPatches: Record<string, Partial<Bin>>;
}

/** A saved state that passed the checks. Settings are partial: missing or invalid ones fall back to the defaults. */
export interface Restored {
  clock?: SavedClock;
  role?: Role;
  settings: Partial<Omit<Settings, "layers">> & { layers?: Partial<MapLayers> };
  seq: number;
  loads: Load[];
  bids: Bid[];
  returns: ReturnTrip[];
  docks: DockAppt[];
  binPatches: Record<string, Partial<Bin>>;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 500;
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const opt = (v: unknown, check: (v: unknown) => boolean) => v === undefined || check(v);
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const oneOf =
  <K extends string>(set: Record<K, unknown>) =>
  (v: unknown): v is K =>
    typeof v === "string" && own(set, v);

// Every value of each union, checked against the type so a new member can't be forgotten.
const isRole = oneOf<Role>({ shipper: 1, carrier: 1, dispatcher: 1, warehouse: 1 } satisfies Record<Role, 1>);
const isGoods = oneOf<GoodsType>({ pallets: 1, food: 1, chilled: 1, frozen: 1, steel: 1, paper: 1, furniture: 1, beverages: 1, pharma: 1, surf: 1, agri: 1, parts: 1 } satisfies Record<GoodsType, 1>);
const isLoadStatus = oneOf<LoadStatus>({ open: 1, booked: 1, assigned: 1, inTransit: 1, delivered: 1, cancelled: 1 } satisfies Record<LoadStatus, 1>);
const isEcmr = oneOf<EcmrState>({ none: 1, draft: 1, shipper: 1, carrier: 1, delivered: 1 } satisfies Record<EcmrState, 1>);
const isBinStatus = oneOf<BinStatus>({ empty: 1, stored: 1, reserved: 1, picking: 1, blocked: 1, quarantine: 1 } satisfies Record<BinStatus, 1>);
const isAbc = oneOf<Abc>({ A: 1, B: 1, C: 1 } satisfies Record<Abc, 1>);
const isTime = oneOf<TimePreset>({ live: 1, dawn: 1, morning: 1, noon: 1, golden: 1, dusk: 1, night: 1 } satisfies Record<TimePreset, 1>);
const isDockStatus = oneOf<DockAppt["status"]>({ scheduled: 1, arrived: 1, loading: 1, done: 1, late: 1 } satisfies Record<DockAppt["status"], 1>);
const LAYERS = { trucks: 1, lanes: 1, returns: 1, warehouses: 1, network: 1, buildings: 1 } satisfies Record<keyof MapLayers, 1>;
const isVehicleType = oneOf(CARRIES);
const isPlace = oneOf<PlaceId>(PLACES);
const isCarrier = (v: unknown): v is string => typeof v === "string" && CARRIER.has(v);
const isVehicle = (v: unknown): v is string => typeof v === "string" && VEHICLE.has(v);
const isWarehouse = (v: unknown): v is WarehouseId => typeof v === "string" && WAREHOUSE.has(v as WarehouseId);

function isLoad(v: unknown): v is Load {
  if (!isRec(v)) return false;
  const placed = v.status === "open" || v.status === "cancelled";
  return (
    isStr(v.id) &&
    isUserLoadId(v.id) &&
    typeof v.shipperId === "string" &&
    SHIPPER.has(v.shipperId) &&
    isPlace(v.from) &&
    isPlace(v.to) &&
    v.from !== v.to &&
    isGoods(v.goods) &&
    isVehicleType(v.vehicle) &&
    isNum(v.pallets) &&
    v.pallets > 0 &&
    isNum(v.kg) &&
    v.kg > 0 &&
    isNum(v.pickupAt) &&
    isNum(v.deliverBy) &&
    isNum(v.createdAt) &&
    (v.mode === "bids" || v.mode === "instant") &&
    isNum(v.target) &&
    v.target > 0 &&
    isLoadStatus(v.status) &&
    isEcmr(v.ecmr) &&
    // Booked, moving or delivered loads have a carrier; a truck on the road has left at some time.
    (placed ? opt(v.carrierId, isCarrier) : isCarrier(v.carrierId)) &&
    (v.status !== "inTransit" || isNum(v.departedAt)) &&
    opt(v.vehicleId, isVehicle) &&
    opt(v.price, isNum) &&
    opt(v.express, isBool) &&
    opt(v.tailLift, isBool) &&
    opt(v.adr, isBool) &&
    opt(v.departedAt, isNum) &&
    opt(v.deliveredAt, isNum) &&
    opt(v.mine, isBool) &&
    opt(v.returnTripId, isStr) &&
    opt(v.viaWarehouse, isWarehouse)
  );
}

function isBid(v: unknown): v is Bid {
  return (
    isRec(v) &&
    isStr(v.id) &&
    isStr(v.loadId) &&
    isCarrier(v.carrierId) &&
    isVehicle(v.vehicleId) &&
    VEHICLE.get(v.vehicleId)?.carrierId === v.carrierId &&
    isNum(v.amount) &&
    v.amount > 0 &&
    isNum(v.pickupEta) &&
    isNum(v.at) &&
    (v.status === "pending" || v.status === "accepted" || v.status === "rejected") &&
    opt(v.note, isStr) &&
    opt(v.mine, isBool)
  );
}

/** Your trips, or another carrier's trip that carries one of your loads (it replaces the re-seeded copy). */
function isReturn(v: unknown): v is ReturnTrip {
  return (
    isRec(v) &&
    isStr(v.id) &&
    (isUserReturnId(v.id) || (v.status === "matched" && typeof v.matchedLoadId === "string" && isUserLoadId(v.matchedLoadId))) &&
    isCarrier(v.carrierId) &&
    isVehicle(v.vehicleId) &&
    isPlace(v.from) &&
    isPlace(v.to) &&
    v.from !== v.to &&
    isNum(v.departAt) &&
    isNum(v.freePallets) &&
    v.freePallets >= 0 &&
    isNum(v.discount) &&
    v.discount >= 0 &&
    v.discount < 1 &&
    (v.status === "open" || v.status === "matched") &&
    opt(v.matchedLoadId, isStr) &&
    opt(v.mine, isBool)
  );
}

function isDock(v: unknown): v is DockAppt {
  if (!isRec(v) || !isWarehouse(v.warehouseId)) return false;
  const doors = WAREHOUSE.get(v.warehouseId)!.doors;
  return (
    isStr(v.id) &&
    Number.isInteger(v.door) &&
    (v.door as number) >= 0 &&
    (v.door as number) < doors &&
    isNum(v.start) &&
    isNum(v.end) &&
    v.end > v.start &&
    (v.direction === "in" || v.direction === "out") &&
    isCarrier(v.carrierId) &&
    opt(v.loadId, isStr) &&
    isNum(v.pallets) &&
    v.pallets >= 0 &&
    isDockStatus(v.status) &&
    opt(v.mine, isBool)
  );
}

const PATCH: Record<keyof Bin, ((v: unknown) => boolean) | null> = {
  status: isBinStatus,
  sku: (v) => typeof v === "string" && SKU.has(v),
  qty: (v) => isNum(v) && v >= 0,
  lot: isStr,
  expiryDays: isNum,
  abc: isAbc,
  picksPerDay: (v) => isNum(v) && v >= 0,
  countedDaysAgo: (v) => isNum(v) && v >= 0,
  tempC: isNum,
  heldFrom: isBinStatus,
  // Where a bin is and what it is never comes from saved data.
  loc: null,
  row: null,
  bay: null,
  level: null,
  zone: null,
};
const LOC = /^R(\d{2})-B(\d{2})-L(\d)$/;

/** Bin patches keyed "<warehouse>|<location>" for a real position, with known fields of the right type. */
function cleanPatches(v: unknown): Record<string, Partial<Bin>> {
  const out: Record<string, Partial<Bin>> = {};
  if (!isRec(v)) return out;
  for (const [key, patch] of Object.entries(v)) {
    const [wid, loc, ...rest] = key.split("|");
    const w = WAREHOUSE.get(wid as WarehouseId);
    const m = loc ? LOC.exec(loc) : null;
    if (!w || rest.length || !m || !isRec(patch)) continue;
    const [row, bay, level] = [Number(m[1]) - 1, Number(m[2]) - 1, Number(m[3]) - 1];
    if (row >= w.rows || bay >= w.bays || level >= w.levels || binLoc(row, bay, level) !== loc) continue;
    // (A patch that empties a position only keeps its status: applyBinPatch clears the rest.)
    if (Object.entries(patch).every(([k, x]) => own(PATCH, k) && PATCH[k as keyof Bin]?.(x))) out[key] = patch as Partial<Bin>;
  }
  return out;
}

function cleanSettings(v: unknown): Restored["settings"] {
  const out: Restored["settings"] = {};
  if (!isRec(v)) return out;
  if (isRec(v.layers)) {
    const layers: Partial<MapLayers> = {};
    for (const k of Object.keys(LAYERS) as (keyof MapLayers)[]) if (isBool(v.layers[k])) layers[k] = v.layers[k];
    out.layers = layers;
  }
  if (isBool(v.terrain)) out.terrain = v.terrain;
  if (isTime(v.time)) out.time = v.time;
  return out;
}

/** The valid records of a list, first copy of each id. */
function valid<T extends { id: string }>(v: unknown, check: (x: unknown) => x is T): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (!check(x) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

/** The saved state, checked record by record; null when there is none or it can't be read at all. */
export function readSaved(): Restored | null {
  let s: unknown;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    s = JSON.parse(raw);
  } catch {
    return null;
  }
  // Version 1 holds the same records as version 2, minus the load sequence (and, before the saved clock, the clock).
  if (!isRec(s) || (s.v !== 1 && s.v !== STORAGE_VERSION)) return null;
  const c = s.clock;
  return {
    clock: isRec(c) && isNum(c.real) && isNum(c.sim) ? { real: c.real, sim: c.sim, speed: isNum(c.speed) && c.speed > 0 && c.speed <= 1000 ? c.speed : 20 } : undefined,
    role: isRole(s.role) ? s.role : undefined,
    settings: cleanSettings(s.settings),
    seq: Number.isSafeInteger(s.seq) && (s.seq as number) > 0 ? (s.seq as number) : 1,
    loads: valid(s.loads, isLoad),
    bids: valid(s.bids, isBid),
    returns: valid(s.returns, isReturn),
    docks: valid(s.docks, isDock),
    binPatches: cleanPatches(s.binPatches),
  };
}

export interface Yours {
  loads: Load[];
  bids: Bid[];
  returns: ReturnTrip[];
  docks: DockAppt[];
}

/** Your records in the market: what is saved, and what survives a re-seed. */
export function yours(s: Yours): Yours {
  const loads = s.loads.filter((l) => isUserLoadId(l.id));
  const ids = new Set(loads.map((l) => l.id));
  const underway = new Set(loads.filter((l) => l.status === "booked" || l.status === "assigned" || l.status === "inTransit").map((l) => l.id));
  return {
    loads,
    // Seeded and market loads are rebuilt (open again), so only your open bids on them can come back.
    bids: s.bids.filter((b) => ids.has(b.loadId) || (b.mine && b.status === "pending")),
    // Your own trips, and a seeded trip while it carries one of your loads (the fresh day would bring it back empty).
    returns: s.returns.filter((r) => (r.mine && isUserReturnId(r.id) && (r.status === "open" || ids.has(r.matchedLoadId ?? ""))) || underway.has(r.matchedLoadId ?? "")),
    docks: s.docks.filter((d) => d.mine),
  };
}

/** What gets saved from the market state (without the clock, which changes all the time). */
export function toSaved(s: Yours & { role: Role; settings: Settings; userSeq: number; binPatches: Record<string, Partial<Bin>> }): Omit<Saved, "clock"> {
  return { v: STORAGE_VERSION, role: s.role, settings: s.settings, seq: s.userSeq, ...yours(s), binPatches: s.binPatches };
}
