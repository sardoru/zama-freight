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
// The ledger is derived, never stored: the loads already in the store plus
// what each vehicle did before the demo opened (VEHICLE_HISTORY). Not
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

/** The last millisecond of the Madrid calendar day `plusDays` after the one containing `t`. */
export function endOfMadridDay(t: number, plusDays = 0): number {
  const [y, m, d] = ymd.format(t).split("-").map(Number);
  const nextMidnightUtc = Date.UTC(y, m - 1, d + plusDays + 1);
  return nextMidnightUtc - madridOffsetMinutes(new Date(nextMidnightUtc)) * MIN - 1;
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

export interface LedgerContext {
  /** The moment the demo opened: VEHICLE_HISTORY counts back from it. */
  anchor: number;
  history?: VehicleEvent[];
}

type LoadTimes = Pick<Load, "id" | "from" | "to" | "status" | "vehicleId" | "pickupAt" | "departedAt" | "deliveredAt">;

const driveMs = (from: PlaceId, to: PlaceId) => route(from, to).minutes * MIN;
const startOf = (l: Pick<Load, "pickupAt" | "departedAt">) => l.departedAt ?? l.pickupAt;
const endOf = (l: LoadTimes) => l.deliveredAt ?? startOf(l) + driveMs(l.from, l.to);

/** Everything that counts for a vehicle's cabotage: its seeded history and its loads (assigned, moving or delivered). */
export function vehicleEvents(vehicleId: string, loads: LoadTimes[], ctx: LedgerContext, except?: string): LedgerEvent[] {
  const carrier = CARRIER.get(VEHICLE.get(vehicleId)?.carrierId ?? "");
  if (!carrier) return [];
  const events: LedgerEvent[] = (ctx.history ?? VEHICLE_HISTORY)
    .filter((e) => e.vehicleId === vehicleId)
    .map((e) => {
      const at = ctx.anchor - e.daysAgo * DAY;
      return { kind: e.kind, country: e.country, start: at, end: at };
    });
  for (const l of loads) {
    if (l.vehicleId !== vehicleId || l.id === except) continue;
    if (l.status !== "assigned" && l.status !== "inTransit" && l.status !== "delivered") continue;
    const scope = jobScope(l, carrier.country);
    if (scope === "domestic") continue;
    events.push({ kind: scope, country: PLACES[l.to].country, start: startOf(l), end: endOf(l), loadId: l.id });
  }
  return events.sort((a, b) => a.end - b.end);
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
export function cabotageCheck(load: Pick<Load, "id" | "from" | "to" | "pickupAt" | "departedAt">, vehicleId: string, loads: LoadTimes[], ctx: LedgerContext): CabotageCheck {
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
export function ledgerAt(vehicleId: string, country: Country, at: number, loads: LoadTimes[], ctx: LedgerContext): CabotageCheck | null {
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

export function runVerdict(load: Pick<Load, "id" | "from" | "to" | "pickupAt" | "departedAt">, vehicle: Vehicle, loads: LoadTimes[], ctx: LedgerContext): RunVerdict {
  const carrier = CARRIER.get(vehicle.carrierId);
  if (!carrier) return { ok: false, licence: [], cabotage: { cabotage: false, used: 0 }, posting: false };
  const licence = licenceProblems(carrier, vehicle, load, startOf(load));
  const cabotage = cabotageCheck(load, vehicle.id, loads, ctx);
  return { ok: !licence.length && !cabotage.block, licence, cabotage, posting: needsPostingDeclaration(load, carrier.country) };
}

// ── The demo's anchor ───────────────────────────────────────────────────────

let anchorAt: number | null = null;

/**
 * The moment the demo opened, for VEHICLE_HISTORY: the first market time the
 * UI asks about. Resetting the demo moves the clock back, which re-anchors.
 */
export function historyAnchor(now: number): number {
  // 0 means the market hasn't opened yet: don't anchor on it.
  if (now > 0 && (anchorAt === null || now < anchorAt)) anchorAt = now;
  return anchorAt ?? now;
}
