// Rules checked before a booking, so a dispatcher hears about them first.
//  • ZBE (San Sebastián/Donostia): in force since Dec 2024, fines since 14 Mar
//    2025. Until the end of 2027 only vehicles without a DGT label are barred;
//    from 2028 B is barred too. Foreign plates carry no DGT label and need the
//    city's prior authorisation.
//  • ZFE-m Pays Basque: from Tarnos to Hendaye (every French place here),
//    06:00–20:00, unclassified and Crit'Air 5 vehicles barred. Informational
//    here: every demo vehicle passes.
//  • Cabotage (Reg. 1072/2009 as amended by Reg. 2020/1055): up to 3 domestic
//    operations within 7 days of an international delivery, then 4 days off in
//    that country. Applies to any carrier working inside a country that isn't
//    its own (a Spanish truck on a France-only job too).
//  • Documents: from 5 Oct 2026 Spain requires the electronic DeCA for for-hire
//    domestic road freight (Ley 9/2025); cross-border trips need a CMR (e-CMR
//    optional); French domestic trips travel on a lettre de voiture.
import { CARRIER, VEHICLE } from "@/data/companies";
import { PLACES } from "@/data/places";
import type { EcoLabel, Load, Vehicle } from "@/data/types";

/** Labels allowed in San Sebastián's ZBE from 2028 (phase 2). */
export const ZBE_OK = new Set(["0", "ECO", "C"]);
/** 1 January 2028, 00:00 Madrid: phase 2 bars B labels too. */
export const ZBE_PHASE2_FROM = Date.UTC(2027, 11, 31, 23);

/** Whether a DGT label may enter the ZBE at a given (market) time. */
export const zbeAllows = (eco: EcoLabel, at: number) => eco !== "B" || at < ZBE_PHASE2_FROM;

/** Allowed today but barred once phase 2 starts. */
export const zbeEndsSoon = (eco: EcoLabel, at: number) => eco === "B" && at < ZBE_PHASE2_FROM;

/** Spanish-registered vehicles carry a DGT environmental label; foreign plates don't. */
export const hasDgtLabel = (v: Pick<Vehicle, "carrierId">) => CARRIER.get(v.carrierId)?.country === "ES";

export function touchesZbe(load: Pick<Load, "from" | "to">): boolean {
  return Boolean(PLACES[load.from].zbe || PLACES[load.to].zbe);
}

/** Pays Basque ZFE-m (French Basque coast). */
export function touchesZfe(load: Pick<Load, "from" | "to">): boolean {
  return Boolean(PLACES[load.from].zfe || PLACES[load.to].zfe);
}

/** A Spanish vehicle whose label can't enter the ZBE at `at` (no case before 2028 in the demo data). */
export function zbeProblem(load: Pick<Load, "from" | "to">, vehicle?: Vehicle, at = 0): boolean {
  return touchesZbe(load) && !!vehicle && hasDgtLabel(vehicle) && !zbeAllows(vehicle.eco, at);
}

/** A foreign-plated vehicle entering the ZBE: it needs the city's prior authorisation. */
export function zbeNeedsAuth(load: Pick<Load, "from" | "to">, vehicle?: Vehicle): boolean {
  return touchesZbe(load) && !!vehicle && !hasDgtLabel(vehicle);
}

export function isDomesticSpain(load: Pick<Load, "from" | "to">): boolean {
  return PLACES[load.from].country === "ES" && PLACES[load.to].country === "ES";
}

/** A domestic job in a country that isn't the carrier's own (a Spanish truck inside France is cabotage too). */
export function isCabotage(load: Pick<Load, "from" | "to">, carrierId?: string): boolean {
  const c = carrierId ? CARRIER.get(carrierId) : undefined;
  if (!c) return false;
  const from = PLACES[load.from].country;
  return from === PLACES[load.to].country && from !== c.country;
}

/** Cabotage operations already used in the current 7-day window (demo starting figures). */
export const CABOTAGE_USED: Record<string, number> = { "c-baltic": 2, "c-adour": 1, "c-labourd": 0 };
export const CABOTAGE_LIMIT = 3;

/** Cabotage used: the demo's starting figures plus every cabotage job booked since. */
export function cabotageUsed(carrierId: string, loads: Pick<Load, "from" | "to" | "carrierId" | "status">[]): number {
  return (
    (CABOTAGE_USED[carrierId] ?? 0) +
    loads.filter((l) => l.carrierId === carrierId && l.status !== "open" && l.status !== "cancelled" && isCabotage(l, carrierId)).length
  );
}

/** Which consignment document a trip travels on. */
export function needsEcmr(load: Pick<Load, "from" | "to">): "deca" | "lv" | "ecmr" {
  const a = PLACES[load.from].country;
  const b = PLACES[load.to].country;
  return a !== b ? "ecmr" : a === "ES" ? "deca" : "lv";
}

export function vehicleOf(load: Pick<Load, "vehicleId">) {
  return load.vehicleId ? VEHICLE.get(load.vehicleId) : undefined;
}
