// The instant price: what a fair spot rate for this lane and vehicle looks
// like, before any bid. Handling + distance + tolls + border + extras.
// Calibrated by hand for short-haul Basque corridor work (a demo model, not a
// tariff): an articulated truck Pasaia → Bayonne lands around €225 (a reefer €260).
import { route, type Route } from "@/data/network";
import type { PlaceId } from "@/data/places";
import type { VehicleType } from "@/data/types";

export interface VehicleSpec {
  pallets: number;
  kg: number;
  /** Handling: positioning, loading and unloading (€). */
  base: number;
  perKm: number;
  /** €/km on toll motorways. */
  toll: number;
  /** kg CO₂e per km, Euro VI diesel (electric vans ~0.05 grid mix). */
  co2: number;
}

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  van: { pallets: 4, kg: 1_200, base: 45, perKm: 0.62, toll: 0.07, co2: 0.24 },
  rigid: { pallets: 14, kg: 7_000, base: 85, perKm: 0.95, toll: 0.16, co2: 0.55 },
  artic: { pallets: 33, kg: 24_000, base: 130, perKm: 1.22, toll: 0.21, co2: 0.82 },
  reefer: { pallets: 33, kg: 22_000, base: 150, perKm: 1.45, toll: 0.21, co2: 0.95 },
  flatbed: { pallets: 26, kg: 25_000, base: 140, perKm: 1.3, toll: 0.21, co2: 0.85 },
};

export interface QuoteInput {
  from: PlaceId;
  to: PlaceId;
  vehicle: VehicleType;
  express?: boolean;
  tailLift?: boolean;
  adr?: boolean;
}

export interface Quote {
  route: Route;
  low: number;
  fair: number;
  high: number;
  /** The price on a matching empty return trip. */
  returnPrice: number;
  /** Whole euros that add up to `fair`. */
  breakdown: { handling: number; distance: number; tolls: number; border: number; extras: number };
  co2Kg: number;
}

const round5 = (v: number) => Math.round(v / 5) * 5;

export function quote(q: QuoteInput, electric = false): Quote {
  const r = route(q.from, q.to);
  const v = VEHICLE_SPECS[q.vehicle];
  const handling = v.base;
  const distance = r.km * v.perKm;
  const tolls = r.tollKm * v.toll;
  const border = r.crossesBorder ? 28 : 0;
  let subtotal = handling + distance + tolls + border;
  let extras = 0;
  if (q.tailLift) extras += 18;
  if (q.adr) extras += subtotal * 0.15;
  if (q.express) extras += subtotal * 0.25;
  subtotal += extras;
  const fair = round5(subtotal);
  const breakdown = { handling: Math.round(handling), distance: Math.round(distance), tolls: Math.round(tolls), border, extras: Math.round(extras) };
  // The rounding to €5 goes into handling, so the lines add up to the price shown above them.
  breakdown.handling += fair - (breakdown.handling + breakdown.distance + breakdown.tolls + breakdown.border + breakdown.extras);
  return {
    route: r,
    low: round5(fair * 0.88),
    fair,
    high: round5(fair * 1.14),
    returnPrice: round5(fair * 0.68),
    breakdown,
    co2Kg: Math.round(r.km * (electric ? 0.05 : v.co2) * 10) / 10,
  };
}

/** Which vehicle suits a load (the smallest that carries it). */
export function suggestVehicle(pallets: number, kg: number, temp?: "chilled" | "frozen"): VehicleType {
  if (temp) return "reefer";
  const order: VehicleType[] = ["van", "rigid", "artic"];
  return order.find((t) => VEHICLE_SPECS[t].pallets >= pallets && VEHICLE_SPECS[t].kg >= kg) ?? "artic";
}
