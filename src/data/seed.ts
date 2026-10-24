// The demo day, built relative to the moment the demo opens (t0), so trucks
// are already on the road and pickups are always "in a few hours".
import { cabotageCheck } from "@/lib/cabotage";
import { licenceProblems } from "@/lib/checks";
import { haversine } from "@/lib/geo";
import { quote, VEHICLE_SPECS } from "@/lib/pricing";
import { hash, rng } from "@/lib/random";
import { CARRIERS, ME, VEHICLE, VEHICLES } from "./companies";
import { route } from "./network";
import { PLACES, type PlaceId } from "./places";
import { WAREHOUSES } from "./warehouses";
import type { Bid, Carrier, DockAppt, EcmrState, FeedEvent, GoodsType, Load, LoadStatus, ReturnTrip, Vehicle, VehicleType, Warehouse } from "./types";

export const MIN = 60_000;
export const HOUR = 60 * MIN;

interface Spec {
  id: string;
  shipper: string;
  from: PlaceId;
  to: PlaceId;
  goods: GoodsType;
  vehicle: VehicleType;
  pallets: number;
  kg: number;
  status: LoadStatus;
  carrier?: string;
  veh?: string;
  /** open/booked/assigned: pickup in minutes from now · inTransit: progress 0–1 · delivered: minutes ago. */
  at: number;
  express?: boolean;
  tailLift?: boolean;
}

const S = (
  id: string,
  shipper: string,
  from: PlaceId,
  to: PlaceId,
  goods: GoodsType,
  vehicle: VehicleType,
  pallets: number,
  kg: number,
  status: LoadStatus,
  at: number,
  carrier?: string,
  veh?: string,
  extra: Partial<Spec> = {},
): Spec => ({ id, shipper, from, to, goods, vehicle, pallets, kg, status, at, carrier, veh, ...extra });

const SPECS: Spec[] = [
  S("ZM-4101", "s-burdin", "pasaia", "bayonnePort", "steel", "flatbed", 10, 22_000, "inTransit", 0.35, "c-aiako", "v-ai2"),
  S("ZM-4102", "s-itsaso", "lezo", "biarritz", "chilled", "reefer", 18, 9_000, "open", 180),
  S("ZM-4103", "s-mobel", "oiartzun", "bayonne", "furniture", "artic", 26, 8_000, "inTransit", 0.55, "c-adour", "v-ad1"),
  S("ZM-4104", "s-horeca", "zaisa", "donostia", "food", "van", 3, 900, "inTransit", 0.4, "c-urumea", "v-ur1"),
  S("ZM-4105", "s-agri", "bayonnePort", "astigarraga", "agri", "artic", 24, 23_000, "assigned", 50, "c-adour", "v-ad2"),
  S("ZM-4106", "s-paper", "hernani", "zaisa", "paper", "artic", 22, 21_000, "open", 240),
  S("ZM-4107", "s-sagardoa", "astigarraga", "biarritz", "beverages", "rigid", 10, 6_500, "open", 360),
  S("ZM-4108", "s-surf", "anglet", "donostia", "surf", "van", 2, 300, "open", 120, undefined, undefined, { express: true }),
  S("ZM-4109", "s-pharma", "hondarribia", "bayonne", "pharma", "reefer", 6, 1_800, "booked", 150, "c-kantauri"),
  S("ZM-4110", "s-burdin", "pasaia", "oiartzun", "steel", "flatbed", 8, 24_000, "delivered", 90, "c-aiako", "v-ai1"),
  S("ZM-4111", "s-horeca", "belartza", "irun", "food", "rigid", 8, 3_500, "inTransit", 0.7, "c-urumea", "v-ur4", { tailLift: true }),
  S("ZM-4112", "s-mobel", "zaisa", "bayonne", "furniture", "artic", 30, 12_000, "inTransit", 0.2, "c-baltic", "v-br1"),
  S("ZM-4113", "s-itsaso", "lezo", "zaisa", "frozen", "reefer", 20, 14_000, "inTransit", 0.5, "c-kantauri", "v-kf1"),
  S("ZM-4114", "s-surf", "biarritz", "belartza", "surf", "van", 3, 700, "open", 300),
  S("ZM-4115", "s-agri", "bayonne", "pasaia", "agri", "artic", 26, 24_000, "open", 330),
  S("ZM-4116", "s-mobel", "irun", "sjdl", "furniture", "rigid", 12, 4_200, "assigned", 90, "c-labourd", "v-lb3"),
  S("ZM-4117", "s-horeca", "oiartzun", "donostia", "beverages", "rigid", 9, 5_000, "open", 210),
  S("ZM-4118", "s-itsaso", "pasaia", "lezo", "food", "artic", 22, 16_000, "booked", 180, "c-aiako"),
  S("ZM-4119", "s-surf", "donostia", "bayonne", "surf", "van", 4, 1_100, "delivered", 180, "c-labourd", "v-lb1"),
  S("ZM-4120", "s-mobel", "hendaye", "oiartzun", "furniture", "artic", 28, 9_000, "assigned", 120, "c-txingudi", "v-tx1"),
  S("ZM-4121", "s-agri", "bayonnePort", "zaisa", "agri", "artic", 26, 23_500, "inTransit", 0.65, "c-baltic", "v-br2"),
  S("ZM-4122", "s-paper", "errenteria", "anglet", "paper", "rigid", 10, 6_000, "open", 270),
  S("ZM-4123", "s-parts", "lasarte", "zaisa", "parts", "rigid", 12, 5_200, "booked", 120, "c-txingudi"),
  S("ZM-4124", "s-sagardoa", "astigarraga", "donostia", "beverages", "van", 3, 1_100, "delivered", 60, "c-urumea", "v-ur2"),
  S("ZM-4125", "s-pharma", "hondarribia", "lezo", "pharma", "reefer", 8, 2_400, "assigned", 210, "c-txingudi", "v-tx4"),
  S("ZM-4126", "s-parts", "zaisa", "hernani", "parts", "artic", 20, 9_000, "open", 420),
  S("ZM-4127", "s-itsaso", "sjdl", "lezo", "frozen", "reefer", 12, 7_000, "open", 240),
  S("ZM-4128", "s-mobel", "irun", "bayonne", "furniture", "artic", 24, 8_500, "open", 150),
  S("ZM-4129", "s-horeca", "belartza", "donostia", "food", "van", 2, 600, "inTransit", 0.3, "c-urumea", "v-ur3"),
  S("ZM-4130", "s-paper", "hernani", "pasaia", "paper", "artic", 20, 20_000, "inTransit", 0.15, "c-aiako", "v-ai3"),
];

const ECMR: Record<LoadStatus, EcmrState> = { open: "none", booked: "draft", assigned: "shipper", inTransit: "carrier", delivered: "delivered", cancelled: "none" };

/** Which load types a vehicle can carry. */
export const CARRIES: Record<VehicleType, VehicleType[]> = {
  van: ["van"],
  rigid: ["van", "rigid"],
  artic: ["van", "rigid", "artic"],
  reefer: ["van", "rigid", "artic", "reefer"],
  flatbed: ["flatbed"],
};

export const driveMs = (l: Pick<Load, "from" | "to">) => route(l.from, l.to).minutes * MIN;

/**
 * The demo day's loads around t0. `rename` gives them fresh ids when the day is
 * re-seeded mid-session (the canonical ZM-4101…4130 are only used once).
 */
export function buildLoads(t0: number, rename: (id: string) => string = (id) => id): Load[] {
  return SPECS.map((s) => {
    const q = quote({ from: s.from, to: s.to, vehicle: s.vehicle, express: s.express, tailLift: s.tailLift });
    const r = rng(hash(s.id));
    const dur = q.route.minutes * MIN;
    let pickupAt = t0 + s.at * MIN;
    let departedAt: number | undefined;
    let deliveredAt: number | undefined;
    if (s.status === "inTransit") {
      departedAt = t0 - s.at * dur;
      pickupAt = departedAt - 25 * MIN;
    } else if (s.status === "delivered") {
      deliveredAt = t0 - s.at * MIN;
      departedAt = deliveredAt - dur;
      pickupAt = departedAt - 25 * MIN;
    }
    const booked = s.status !== "open";
    return {
      id: rename(s.id),
      shipperId: s.shipper,
      from: s.from,
      to: s.to,
      goods: s.goods,
      pallets: s.pallets,
      kg: s.kg,
      vehicle: s.vehicle,
      pickupAt,
      deliverBy: pickupAt + dur + 3 * HOUR,
      mode: r.chance(0.3) ? "instant" : "bids",
      target: q.fair,
      status: s.status,
      carrierId: s.carrier,
      vehicleId: s.veh,
      price: booked ? Math.round((q.fair * (0.9 + r.next() * 0.14)) / 5) * 5 : undefined,
      express: s.express,
      tailLift: s.tailLift,
      ecmr: ECMR[s.status],
      departedAt,
      deliveredAt,
      createdAt: pickupAt - (6 + r.int(1, 30)) * HOUR,
      mine: s.shipper === ME.shipperId || undefined,
    } satisfies Load;
  });
}

/** Can this vehicle take a load of this type and weight? */
export const canCarry = (v: Pick<Vehicle, "type">, type: VehicleType, kg = 0) => CARRIES[v.type].includes(type) && VEHICLE_SPECS[v.type].kg >= kg;

/** A job to staff: its vehicle type, weight and lane, and optionally its times (for cabotage). */
export type EligibilityJob = Pick<Load, "vehicle" | "from" | "to"> & Partial<Pick<Load, "id" | "kg" | "pickupAt" | "departedAt">>;

/** The market as the cabotage ledger needs it (lib/cabotage.ts). */
export interface EligibilityContext {
  loads: Load[];
  at: number;
  /** The moment the demo opened (historyAnchor). */
  anchor: number;
}

/**
 * Carriers that can serve a job: at least one vehicle that carries its type and
 * weight and may legally run it. Given a load, cross-border and cabotage jobs
 * need a Community licence above 2.5 t and, for light vans, a tachograph from
 * 1-7-2026 (lib/checks.ts); with `ctx` as well, that vehicle's cabotage ledger
 * must allow it (lib/cabotage.ts). Given only a type and weight, the vehicles
 * alone are checked.
 */
export function eligibleCarriers(vehicle: VehicleType, kg?: number): Carrier[];
export function eligibleCarriers(job: EligibilityJob, ctx?: EligibilityContext): Carrier[];
export function eligibleCarriers(job: VehicleType | EligibilityJob, arg?: number | EligibilityContext): Carrier[] {
  const lane = typeof job === "string" ? null : job;
  const type = typeof job === "string" ? job : job.vehicle;
  const kg = typeof job === "string" ? (typeof arg === "number" ? arg : 0) : (job.kg ?? 0);
  const ctx = typeof arg === "object" ? arg : undefined;
  const at = lane?.departedAt ?? lane?.pickupAt ?? ctx?.at ?? Date.now();
  return CARRIERS.filter((c) =>
    VEHICLES.some((v) => {
      if (v.carrierId !== c.id || !canCarry(v, type, kg)) return false;
      if (!lane) return true;
      if (licenceProblems(c, v, lane, at).length) return false;
      if (!ctx) return true;
      return !cabotageCheck({ id: lane.id ?? "job", from: lane.from, to: lane.to, pickupAt: at, departedAt: lane.departedAt }, v.id, ctx.loads, { anchor: ctx.anchor }).block;
    }),
  );
}

export function vehicleFor(carrierId: string, type: VehicleType, kg = 0) {
  return VEHICLES.find((v) => v.carrierId === carrierId && canCarry(v, type, kg));
}

let bidSeq = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(bidSeq++).toString(36)}`;

export function buildBids(loads: Load[], t0: number): Bid[] {
  const bids: Bid[] = [];
  for (const l of loads) {
    if (l.status === "cancelled") continue;
    const r = rng(hash(`bids:${l.id}`));
    const pool = eligibleCarriers(l.vehicle, l.kg).filter((c) => c.id !== ME.carrierId || l.status !== "open");
    const n = l.status === "open" ? r.int(1, Math.min(5, pool.length)) : r.int(1, 3);
    const chosen = new Set<string>();
    if (l.carrierId) chosen.add(l.carrierId);
    while (chosen.size < Math.min(pool.length, n + (l.carrierId ? 1 : 0))) chosen.add(r.pick(pool).id);
    for (const cid of chosen) {
      const accepted = cid === l.carrierId;
      // The winning bid names the truck that is doing the job.
      const v = (accepted && l.vehicleId ? VEHICLE.get(l.vehicleId) : undefined) ?? vehicleFor(cid, l.vehicle, l.kg);
      if (!v) continue;
      bids.push({
        id: `b-${l.id}-${cid}`,
        loadId: l.id,
        carrierId: cid,
        vehicleId: v.id,
        amount: accepted && l.price ? l.price : Math.round((l.target * (0.86 + r.next() * 0.24)) / 5) * 5,
        pickupEta: l.pickupAt + r.int(-45, 75) * MIN,
        // Never before the load was posted (a bid older than its load reads as left over from another one).
        at: Math.max(l.createdAt, Math.min(t0 - r.int(5, 240) * MIN, l.status === "open" ? t0 : l.pickupAt - HOUR)),
        status: l.status === "open" ? "pending" : accepted ? "accepted" : "rejected",
      });
    }
  }
  return bids;
}

export function buildReturns(t0: number): ReturnTrip[] {
  return [
    { id: "rt-1", carrierId: "c-adour", vehicleId: "v-ad3", from: "pasaia", to: "bayonnePort", departAt: t0 + 4 * HOUR, freePallets: 14, discount: 0.3, status: "open" },
    { id: "rt-2", carrierId: "c-kantauri", vehicleId: "v-kf2", from: "biarritz", to: "lezo", departAt: t0 + 3.5 * HOUR, freePallets: 33, discount: 0.28, status: "open" },
    { id: "rt-3", carrierId: "c-baltic", vehicleId: "v-br3", from: "zaisa", to: "bayonnePort", departAt: t0 + 2 * HOUR, freePallets: 33, discount: 0.33, status: "open" },
    { id: "rt-4", carrierId: ME.carrierId, vehicleId: "v-tx2", from: "bayonne", to: "irun", departAt: t0 + 5 * HOUR, freePallets: 33, discount: 0.32, status: "open", mine: true },
    { id: "rt-5", carrierId: "c-labourd", vehicleId: "v-lb2", from: "donostia", to: "anglet", departAt: t0 + 6 * HOUR, freePallets: 4, discount: 0.25, status: "open" },
  ];
}

/** Does an open load fit on a return trip? Same direction, close ends, right vehicle (room and payload), ±6 h. */
export function fitsReturn(l: Load, rt: ReturnTrip, vehicleType: VehicleType): boolean {
  if (l.status !== "open" || rt.status !== "open") return false;
  if (!canCarry({ type: vehicleType }, l.vehicle, l.kg)) return false;
  if (l.pallets > Math.min(rt.freePallets, VEHICLE_SPECS[vehicleType].pallets)) return false;
  const nearFrom = haversine(PLACES[l.from].lnglat, PLACES[rt.from].lnglat) <= 15_000;
  const nearTo = haversine(PLACES[l.to].lnglat, PLACES[rt.to].lnglat) <= 18_000;
  return nearFrom && nearTo && Math.abs(l.pickupAt - rt.departAt) <= 6 * HOUR;
}

type Rand = ReturnType<typeof rng>;

/** How far past t0 the seeded regular dock traffic reaches (the director schedules the rest). */
export const DOCKS_SEEDED_AHEAD = 10 * HOUR;

/** A door of the warehouse with nothing booked within 15 minutes of [start, end); a random door if all are taken. */
function freeDoor(appts: readonly DockAppt[], doors: number, start: number, end: number, r: Rand): number {
  const gap = 15 * MIN;
  const first = r.int(0, doors - 1);
  for (let d = 0; d < doors; d++) {
    const door = (first + d) % doors;
    if (appts.every((a) => a.door !== door || a.end + gap <= start || end + gap <= a.start)) return door;
  }
  return first;
}

/** The appointments a load needs at a warehouse: loading at its origin, unloading at its destination. */
export function loadDocks(l: Load, w: Warehouse, appts: readonly DockAppt[], r: Rand): DockAppt[] {
  const out: DockAppt[] = [];
  if (l.status === "cancelled") return out;
  if (l.from === w.place) {
    const start = l.pickupAt - 30 * MIN;
    const end = start + 45 * MIN;
    out.push({ id: `dk-${w.id}-${l.id}-o`, warehouseId: w.id, door: freeDoor(appts, w.doors, start, end, r), start, end, direction: "out", carrierId: l.carrierId ?? "c-txingudi", loadId: l.id, pallets: l.pallets, status: "scheduled" });
  }
  if (l.to === w.place) {
    const start = (l.departedAt ?? l.pickupAt) + driveMs(l);
    const end = start + 50 * MIN;
    out.push({ id: `dk-${w.id}-${l.id}-i`, warehouseId: w.id, door: freeDoor([...appts, ...out], w.doors, start, end, r), start, end, direction: "in", carrierId: l.carrierId ?? "c-baltic", loadId: l.id, pallets: l.pallets, status: "scheduled" });
  }
  return out;
}

const REGULARS = CARRIERS.filter((c) => c.id !== "c-labourd");

/**
 * The rest of a warehouse's traffic (regular suppliers, store deliveries)
 * starting in [from, to): about two appointments per door every 15 hours.
 */
export function regularDocks(w: Warehouse, from: number, to: number, appts: readonly DockAppt[], r: Rand): DockAppt[] {
  const q15 = 15 * MIN;
  const n = Math.floor((w.doors * 2 * (to - from)) / (15 * HOUR) + r.next());
  const out: DockAppt[] = [];
  for (let k = 0; k < n; k++) {
    const start = Math.round((from + r.next() * (to - from)) / q15) * q15;
    const len = r.pick([30, 45, 60, 75]) * MIN;
    out.push({
      // Unique per window: the windows of one session never start at the same moment.
      id: `dk-${w.id}-x${from.toString(36)}-${k}`,
      warehouseId: w.id,
      door: freeDoor([...appts, ...out], w.doors, start, start + len, r),
      start,
      end: start + len,
      direction: r.chance(0.5) ? "in" : "out",
      carrierId: r.pick(REGULARS).id,
      pallets: r.int(4, 33),
      status: r.chance(0.07) ? "late" : "scheduled",
    });
  }
  return out;
}

export function buildDocks(loads: Load[], t0: number): DockAppt[] {
  const appts: DockAppt[] = [];
  for (const w of WAREHOUSES) {
    const r = rng(hash(`docks:${w.id}`));
    const here: DockAppt[] = [];
    for (const l of loads) here.push(...loadDocks(l, w, here, r));
    // Spread around the moment the demo opens so the doors are busy at any hour.
    here.push(...regularDocks(w, t0 - 5 * HOUR, t0 + DOCKS_SEEDED_AHEAD, here, r));
    appts.push(...here);
  }
  return appts.sort((a, b) => a.start - b.start);
}

/** What a dock appointment looks like at a given time. */
export function dockStatus(a: DockAppt, now: number): DockAppt["status"] {
  if (a.status === "late" && now < a.start + 40 * MIN) return now > a.start + 10 * MIN ? "late" : "scheduled";
  if (now >= a.end) return "done";
  if (now >= a.start + 10 * MIN) return "loading";
  if (now >= a.start - 10 * MIN) return "arrived";
  return "scheduled";
}

export function buildFeed(loads: Load[], bids: Bid[], t0: number): FeedEvent[] {
  const events: FeedEvent[] = [];
  for (const b of bids.filter((x) => x.status === "pending").slice(0, 8)) {
    events.push({ id: `f-${b.id}`, at: b.at, kind: "bid", key: "bid", vars: { carrier: b.carrierId, amount: b.amount, load: b.loadId }, loadId: b.loadId });
  }
  for (const l of loads) {
    if (l.departedAt && l.status === "inTransit") events.push({ id: `f-dep-${l.id}`, at: l.departedAt, kind: "departed", key: "departed", vars: { load: l.id, from: l.from, to: l.to }, loadId: l.id });
    if (l.deliveredAt) events.push({ id: `f-del-${l.id}`, at: l.deliveredAt, kind: "delivered", key: "delivered", vars: { load: l.id, to: l.to }, loadId: l.id });
  }
  return events.filter((e) => e.at <= t0).sort((a, b) => b.at - a.at).slice(0, 14);
}
