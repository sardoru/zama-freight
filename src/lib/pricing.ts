// The instant price: a demo estimate for a lane and vehicle, before any bid.
// It is not a market rate: no market data feeds it. Lines:
//  • handling and distance: Zama's hand-calibrated demo model;
//  • tolls: the operators' published tariffs by entry, exit and vehicle class
//    (data/tolls.ts: Bidegi 2026 on the AP-8, ASF 2024 on the A-63);
//  • surcharges: demo assumptions (cross-border, express, tail-lift, ADR).
// The lines add up to the price exactly; the last one absorbs the rounding to
// €5. An articulated truck Pasaia → Bayonne comes out around €240.
import { route, type Route } from "@/data/network";
import type { PlaceId } from "@/data/places";
import { legFare, legStations, TARIFFS, TOLL_CLASS, type TollRoad } from "@/data/tolls";
import type { VehicleType } from "@/data/types";

export interface VehicleSpec {
  pallets: number;
  kg: number;
  /** Handling: positioning, loading and unloading (€). */
  base: number;
  perKm: number;
  /** kg CO₂e per km, Euro VI diesel (electric vans ~0.05 grid mix). */
  co2: number;
}

export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {
  van: { pallets: 4, kg: 1_200, base: 45, perKm: 0.62, co2: 0.24 },
  rigid: { pallets: 14, kg: 7_000, base: 85, perKm: 0.95, co2: 0.55 },
  artic: { pallets: 33, kg: 24_000, base: 130, perKm: 1.22, co2: 0.82 },
  reefer: { pallets: 33, kg: 22_000, base: 150, perKm: 1.45, co2: 0.95 },
  flatbed: { pallets: 26, kg: 25_000, base: 140, perKm: 1.3, co2: 0.85 },
};

/** Zama's demo assumptions: none of these is a market figure. */
export const DEMO_ASSUMPTIONS = {
  /** Flat surcharge on ES ⇄ FR trips (paperwork, longer waits). No customs step exists inside the EU. */
  crossBorder: 28,
  tailLift: 18,
  /** Share of handling + distance + tolls + cross-border. */
  adr: 0.15,
  express: 0.25,
  /** Price on an empty return trip, as a share of the instant price (the "−30 %" on the landing page). */
  returnTrip: 0.68,
  /** The demo range around the price. */
  range: [0.88, 1.14] as const,
};

export interface QuoteInput {
  from: PlaceId;
  to: PlaceId;
  vehicle: VehicleType;
  express?: boolean;
  tailLift?: boolean;
  adr?: boolean;
}

export type PriceLineKey = "handling" | "distance" | "tolls" | "crossBorder" | "express" | "tailLift" | "adr" | "rounding";

export interface PriceLine {
  key: PriceLineKey;
  /** Whole euros; the lines of a quote add up to its `fair` price. */
  amount: number;
  /** A demo assumption (surcharges), as opposed to the model or a published tariff. */
  demo?: boolean;
}

export interface TollCharge {
  road: TollRoad;
  operator: string;
  /** The tariff year applied. */
  year: number;
  from: string;
  to: string;
  /** €, to the cent, as published. */
  amount: number;
}

export interface Quote {
  route: Route;
  low: number;
  fair: number;
  high: number;
  /** The price on a matching empty return trip. */
  returnPrice: number;
  /** The breakdown, in display order; sums to `fair`. */
  lines: PriceLine[];
  /** The toll legs behind the "tolls" line. */
  tolls: TollCharge[];
  co2Kg: number;
}

const round5 = (v: number) => Math.round(v / 5) * 5;

/** The published tolls for a route and vehicle, leg by leg. */
export function tollsFor(r: Route, vehicle: VehicleType): TollCharge[] {
  const cls = TOLL_CLASS[vehicle];
  return r.tolls.map((leg) => {
    const [from, to] = legStations(leg.road, leg.entry, leg.exit);
    return { road: leg.road, operator: TARIFFS[leg.road].operator, year: TARIFFS[leg.road].year, from, to, amount: legFare(leg.road, leg.entry, leg.exit, cls) };
  });
}

export function quote(q: QuoteInput, electric = false): Quote {
  const r = route(q.from, q.to);
  const v = VEHICLE_SPECS[q.vehicle];
  const tolls = tollsFor(r, q.vehicle);
  const tollSum = tolls.reduce((s, t) => s + t.amount, 0);
  const crossBorder = r.crossesBorder ? DEMO_ASSUMPTIONS.crossBorder : 0;
  const base = v.base + r.km * v.perKm + tollSum + crossBorder;
  const tailLift = q.tailLift ? DEMO_ASSUMPTIONS.tailLift : 0;
  const adr = q.adr ? base * DEMO_ASSUMPTIONS.adr : 0;
  const express = q.express ? base * DEMO_ASSUMPTIONS.express : 0;
  const fair = round5(base + tailLift + adr + express);

  const lines: PriceLine[] = [
    { key: "handling", amount: Math.round(v.base) },
    { key: "distance", amount: Math.round(r.km * v.perKm) },
    { key: "tolls", amount: Math.round(tollSum) },
  ];
  if (crossBorder) lines.push({ key: "crossBorder", amount: crossBorder, demo: true });
  if (q.express) lines.push({ key: "express", amount: Math.round(express), demo: true });
  if (q.tailLift) lines.push({ key: "tailLift", amount: tailLift, demo: true });
  if (q.adr) lines.push({ key: "adr", amount: Math.round(adr), demo: true });
  const rounding = fair - lines.reduce((s, l) => s + l.amount, 0);
  if (rounding) lines.push({ key: "rounding", amount: rounding });

  const [lowF, highF] = DEMO_ASSUMPTIONS.range;
  return {
    route: r,
    low: round5(fair * lowF),
    fair,
    high: round5(fair * highF),
    returnPrice: round5(fair * DEMO_ASSUMPTIONS.returnTrip),
    lines,
    tolls,
    co2Kg: Math.round(r.km * (electric ? 0.05 : v.co2) * 10) / 10,
  };
}

/** Which vehicle suits a load (the smallest that carries it). */
export function suggestVehicle(pallets: number, kg: number, temp?: "chilled" | "frozen"): VehicleType {
  if (temp) return "reefer";
  const order: VehicleType[] = ["van", "rigid", "artic"];
  return order.find((t) => VEHICLE_SPECS[t].pallets >= pallets && VEHICLE_SPECS[t].kg >= kg) ?? "artic";
}
