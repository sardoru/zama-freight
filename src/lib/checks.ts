// Rules checked before a booking, so a dispatcher hears about them first.
//  • ZBE: Donostia's low-emission zone admits vehicles with the DGT 0, ECO or
//    C label (B and unlabelled diesel vans are turned away).
//  • Cabotage (EU 1072/2009, Mobility Package): a foreign carrier may run at
//    most 3 domestic jobs within 7 days of an international delivery.
//  • e-CMR / DeCA: from 5 Oct 2026 Spain requires an electronic control
//    document for domestic road freight (Ley 9/2025 de Movilidad Sostenible).
import { CARRIER, VEHICLE } from "@/data/companies";
import { PLACES } from "@/data/places";
import type { Load, Vehicle } from "@/data/types";

export const ZBE_OK = new Set(["0", "ECO", "C"]);

export function touchesZbe(load: Pick<Load, "from" | "to">): boolean {
  return Boolean(PLACES[load.from].zbe || PLACES[load.to].zbe);
}

export function zbeProblem(load: Pick<Load, "from" | "to">, vehicle?: Vehicle): boolean {
  return touchesZbe(load) && !!vehicle && !ZBE_OK.has(vehicle.eco);
}

export function isDomesticSpain(load: Pick<Load, "from" | "to">): boolean {
  return PLACES[load.from].country === "ES" && PLACES[load.to].country === "ES";
}

export function isCabotage(load: Pick<Load, "from" | "to">, carrierId?: string): boolean {
  if (!carrierId) return false;
  const c = CARRIER.get(carrierId);
  if (!c || c.country === "ES") return false;
  const from = PLACES[load.from].country;
  const to = PLACES[load.to].country;
  return from === to && from !== c.country;
}

/** Cabotage jobs already used this week by a foreign carrier (demo figures). */
export const CABOTAGE_USED: Record<string, number> = { "c-baltic": 2, "c-adour": 1, "c-labourd": 0 };
export const CABOTAGE_LIMIT = 3;

export function needsEcmr(load: Pick<Load, "from" | "to">): "deca" | "ecmr" {
  return isDomesticSpain(load) ? "deca" : "ecmr";
}

export function vehicleOf(load: Pick<Load, "vehicleId">) {
  return load.vehicleId ? VEHICLE.get(load.vehicleId) : undefined;
}
