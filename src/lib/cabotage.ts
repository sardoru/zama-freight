// Cabotage: a domestic job run by a carrier from another country. The rules
// (Reg. 1072/2009 art. 8 as amended by Reg. 2020/1055; Commission Q&A of
// 21-2-2022, Q4, Q7, Q8, Q10):
//  • only after an incoming international carriage, once all of it is
//    unloaded, and only with the same motor vehicle (Q7);
//  • at most 3 operations, the last unloaded by the end of the 7th calendar
//    day after that unloading (Q8: days run from 0h00 the next day);
//  • after cabotage in a country, once the vehicle leaves it, no cabotage
//    there with that vehicle for 4 calendar days (Q10, the "cooling-off"),
//    counted per vehicle and per country;
//  • a Community licence (lib/checks.ts) and, for drivers, a posting
//    declaration.
// The ledger is derived from the loads in the store, what each vehicle did
// before the demo opened (VEHICLE_HISTORY) and the foreign jobs of loads the
// market has since pruned from its board (PastJob, kept by the store). Not
// modelled: the single operation allowed in a third country within 3 days of
// an unladen entry (art. 8(2), second subparagraph). Zama treats that case as
// "no incoming international carriage", which errs on the safe side.
import { CARRIER, VEHICLE, VEHICLE_HISTORY } from "@/data/companies";
import { route } from "@/data/network";
import { PLACES, type PlaceId } from "@/data/places";
import type { Country, Load, Vehicle, VehicleEvent } from "@/data/types";
import { CABOTAGE_LIMIT, jobScope, licenceProblems, needsPostingDeclaration, type LicenceProblem } from "./checks";
import { madridOffsetMinutes } from "./sun";

export { CABOTAGE_LIMIT };
export const CABOTAGE_WINDOW_DAYS = 7;
export const COOLING_OFF_DAYS = 4;
export const DAY = 86_400_000;

const MIN = 60_000;

// ── Calendar days on the corridor's clock (Europe/Madrid = Europe/Paris) ─────

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });

// Madrid is a whole number of hours off UTC, so its date is the same all through a UTC hour: the answer is cached
// per hour (the market asks this many times a second).
const dayEnds = new Map<string, number>();

/** The last millisecond of the Madrid calendar day `plusDays` after the one containing `t`. */
export function endOfMadridDay(t: number, plusDays = 0): number {
  const key = `${Math.floor(t / (60 * MIN))}|${plusDays}`;
  const hit = dayEnds.get(key);
  if (hit !== undefined) return hit;
  const [y, m, d] = ymd.format(t).split("-").map(Number);
  const nextMidnightUtc = Date.UTC(y, m - 1, d + plusDays + 1);
  const end = nextMidnightUtc - madridOffsetMinutes(new Date(nextMidnightUtc)) * MIN - 1;
  if (dayEnds.size > 4_000) dayEnds.clear();
  dayEnds.set(key, end);
  return end;
}

// ── Events ──────────────────────────────────────────────────────────────────

export interface LedgerEvent {
  kind: "international" | "cabotage";
  /** Where it was unloaded. */
  country: Country;
  /** Loading (start) and last unloading (end). */
  start: number;
  end: number;
  loadId?: string;
}

/** A cross-border or cabotage job of a load that is no longer in the store (pruned from the board). */
export interface PastJob extends LedgerEvent {
  vehicleId: string;
  loadId: string;
}

export interface LedgerContext {
  /** The moment the demo opened: VEHICLE_HISTORY counts back from it (the store's `anchor`). */
  anchor: number;
  history?: VehicleEvent[];
  /** Foreign jobs of loads pruned from the store (the store's `ledger`): they still count. */
  past?: readonly PastJob[];
}

type LoadTimes = Pick<Load, "id" | "from" | "to" | "status" | "vehicleId" | "pickupAt" | "departedAt" | "deliveredAt">;

const driveMs = (from: PlaceId, to: PlaceId) => route(from, to).minutes * MIN;
const startOf = (l: Pick<Load, "pickupAt" | "departedAt">) => l.departedAt ?? l.pickupAt;
const endOf = (l: LoadTimes) => l.deliveredAt ?? startOf(l) + driveMs(l.from, l.to);

/** The ledger event of a load its vehicle runs (assigned, moving or delivered); null when it doesn't count. */
function loadEvent(l: LoadTimes, carrierCountry: Country): LedgerEvent | null {
  if (l.status !== "assigned" && l.status !== "inTransit" && l.status !== "delivered") return null;
  const scope = jobScope(l, carrierCountry);
  if (scope === "domestic") return null;
  return { kind: scope, country: PLACES[l.to].country, start: startOf(l), end: endOf(l), loadId: l.id };
}

/** Everything that counts for a vehicle's cabotage: its seeded history, its loads (assigned, moving or delivered) and its pruned jobs. */
export function vehicleEvents(vehicleId: string, loads: readonly LoadTimes[], ctx: LedgerContext, except?: string): LedgerEvent[] {
  const carrier = CARRIER.get(VEHICLE.get(vehicleId)?.carrierId ?? "");
  if (!carrier) return [];
  const events: LedgerEvent[] = (ctx.history ?? VEHICLE_HISTORY)
    .filter((e) => e.vehicleId === vehicleId)
    .map((e) => {
      const at = ctx.anchor - e.daysAgo * DAY;
      return { kind: e.kind, country: e.country, start: at, end: at };
    });
  const inStore = new Set<string>();
  for (const l of loads) {
    inStore.add(l.id);
    if (l.vehicleId !== vehicleId || l.id === except) continue;
    const e = loadEvent(l, carrier.country);
    if (e) events.push(e);
  }
  for (const e of ctx.past ?? []) if (e.vehicleId === vehicleId && e.loadId !== except && !inStore.has(e.loadId)) events.push(e);
  return events.sort((a, b) => a.end - b.end);
}

// ── Pruned jobs ─────────────────────────────────────────────────────────────

/** Older pruned jobs can't open a window (7 days) or a cooling-off (4 days) any more. */
export const PAST_KEEP = 12 * DAY;
/** Pruned jobs this recent are all kept, so a job starting up to this long ago is still checked exactly. */
const PAST_EXACT = 6 * 60 * MIN;

/** The ledger entries of delivered loads about to leave the store. */
export function pastJobs(loads: readonly LoadTimes[]): PastJob[] {
  const out: PastJob[] = [];
  for (const l of loads) {
    if (l.status !== "delivered" || !l.vehicleId) continue;
    const carrier = CARRIER.get(VEHICLE.get(l.vehicleId)?.carrierId ?? "");
    const e = carrier && loadEvent(l, carrier.country);
    if (e) out.push({ ...e, vehicleId: l.vehicleId, loadId: l.id });
  }
  return out;
}

/**
 * Only what a check can still use. Jobs of the last 6 hours are all kept;
 * of the older ones, per vehicle, its latest international carriage (the
 * window it opens), the cabotage since (the operations used) and its latest
 * cabotage in each country (a cooling-off once it leaves). For a job starting
 * after them, that is all the ledger reads, so the verdict doesn't change.
 */
export function compactPast(entries: readonly PastJob[], now: number): PastJob[] {
  const byVehicle = new Map<string, PastJob[]>();
  const keep = new Set<PastJob>();
  for (const e of entries) {
    if (e.end < now - PAST_KEEP) continue;
    if (e.end >= now - PAST_EXACT) {
      keep.add(e);
      continue;
    }
    const list = byVehicle.get(e.vehicleId);
    if (list) list.push(e);
    else byVehicle.set(e.vehicleId, [e]);
  }
  for (const list of byVehicle.values()) {
    list.sort((a, b) => a.end - b.end);
    const incoming = list.filter((e) => e.kind === "international").pop();
    if (incoming) keep.add(incoming);
    const lastIn = new Map<Country, PastJob>();
    for (const e of list) {
      if (e.kind !== "cabotage") continue;
      if (!incoming || e.end > incoming.end) keep.add(e);
      lastIn.set(e.country, e);
    }
    for (const e of lastIn.values()) keep.add(e);
  }
  return entries.filter((e) => keep.has(e));
}

// ── The check ───────────────────────────────────────────────────────────────

export type CabotageBlock = "coolingOff" | "noIncoming" | "window" | "limit";

export interface CabotageCheck {
  /** Is this job cabotage for the vehicle's carrier at all? */
  cabotage: boolean;
  /** The host country. */
  country?: Country;
  /** Last unloading of the incoming international carriage that opened the window. */
  incomingAt?: number;
  /** The last moment an operation of this window may finish unloading. */
  windowEnds?: number;
  /** Operations this vehicle has already used (or has planned) in this window, not counting this one. */
  used: number;
  /** A cooling-off in this country runs until then. */
  coolingOffUntil?: number;
  /** Why this job can't be cabotage for this vehicle; absent when it can. */
  block?: CabotageBlock;
}

/**
 * May this vehicle run this load as a cabotage operation? `load` may be a
 * draft or an open load (its pickup time is used) or one already assigned.
 */
export function cabotageCheck(load: Pick<Load, "id" | "from" | "to" | "pickupAt" | "departedAt">, vehicleId: string, loads: readonly LoadTimes[], ctx: LedgerContext): CabotageCheck {
  const carrier = CARRIER.get(VEHICLE.get(vehicleId)?.carrierId ?? "");
  if (!carrier || jobScope(load, carrier.country) !== "cabotage") return { cabotage: false, used: 0 };
  const host = PLACES[load.from].country;
  const start = startOf(load);
  const end = start + driveMs(load.from, load.to);
  const events = vehicleEvents(vehicleId, loads, ctx, load.id);

  // Cooling-off: the vehicle did cabotage here, then left (any international
  // carriage since), and 4 calendar days haven't passed.
  const lastHere = events.filter((e) => e.kind === "cabotage" && e.country === host && e.end <= start).pop();
  const left = !!lastHere && events.some((e) => e.kind === "international" && e.start >= lastHere.end && e.start <= start);
  const coolingOffUntil = left && lastHere ? endOfMadridDay(lastHere.end, COOLING_OFF_DAYS) : undefined;

  // The window opens with the latest international carriage unloaded before
  // this job starts, and only if it was unloaded here.
  const incoming = events.filter((e) => e.kind === "international" && e.end <= start).pop();
  const opens = incoming?.country === host;
  const windowEnds = opens && incoming ? endOfMadridDay(incoming.end, CABOTAGE_WINDOW_DAYS) : undefined;
  const used = opens && incoming && windowEnds ? events.filter((e) => e.kind === "cabotage" && e.country === host && e.end > incoming.end && e.end <= windowEnds).length : 0;

  const block: CabotageBlock | undefined =
    coolingOffUntil !== undefined && start <= coolingOffUntil
      ? "coolingOff"
      : !opens
        ? "noIncoming"
        : windowEnds !== undefined && end > windowEnds
          ? "window"
          : used >= CABOTAGE_LIMIT
            ? "limit"
            : undefined;
  return { cabotage: true, country: host, incomingAt: opens ? incoming?.end : undefined, windowEnds, used, coolingOffUntil, block };
}

/** Where a vehicle stands in a country right now, for the Dispatch overview. */
export function ledgerAt(vehicleId: string, country: Country, at: number, loads: readonly LoadTimes[], ctx: LedgerContext): CabotageCheck | null {
  const v = VEHICLE.get(vehicleId);
  const carrier = CARRIER.get(v?.carrierId ?? "");
  if (!v || !carrier || carrier.country === country) return null;
  const probe = (Object.keys(PLACES) as PlaceId[]).find((p) => PLACES[p].country === country);
  if (!probe) return null;
  // A zero-length probe job in that country, starting now.
  const check = cabotageCheck({ id: "probe", from: probe, to: probe, pickupAt: at }, vehicleId, loads, ctx);
  return check.incomingAt !== undefined || check.coolingOffUntil !== undefined ? check : null;
}

// ── Everything a vehicle needs to take a job ───────────────────────────────

export interface RunVerdict {
  ok: boolean;
  licence: LicenceProblem[];
  cabotage: CabotageCheck;
  /** The driver counts as posted: a posting declaration is due. */
  posting: boolean;
}

export function runVerdict(load: Pick<Load, "id" | "from" | "to" | "pickupAt" | "departedAt">, vehicle: Vehicle, loads: readonly LoadTimes[], ctx: LedgerContext): RunVerdict {
  const carrier = CARRIER.get(vehicle.carrierId);
  if (!carrier) return { ok: false, licence: [], cabotage: { cabotage: false, used: 0 }, posting: false };
  const licence = licenceProblems(carrier, vehicle, load, startOf(load));
  const cabotage = cabotageCheck(load, vehicle.id, loads, ctx);
  return { ok: !licence.length && !cabotage.block, licence, cabotage, posting: needsPostingDeclaration(load, carrier.country) };
}
