// Rules checked before a booking, so a dispatcher hears about them first. Each
// rule is a pure function of the lane, the vehicle and a date; cabotage, which
// also needs the vehicle's history, lives in lib/cabotage.ts.
//
// • Donostia ZBE: Ordenanza de la ZBE Donostia Centro, BOG nº 241 of
//   16-12-2024, in force the next day (final provision).
//   - Art. 7: an initial phase of 36 months, then the consolidation phase,
//     i.e. from 17-12-2027. donostia.eus says "from 2028": we use the
//     ordinance's date, the earlier of the two (ZBE_PHASE2).
//   - Art. 8.1(b): labels 0 (CERO), ECO, C and B enter freely.
//   - Art. 11.1: vehicles without a label are banned, unless they hold an
//     art. 8/9 authorisation. Regular deliveries can get one valid for all of
//     phase 1 (art. 8.3, 3.2 f).
//   - Art. 11.2: from phase 2, B is banned, and so are unlabelled delivery
//     vehicles. One-off authorisations (art. 8.3, 3.3) are not modelled.
//   - Art. 9: foreign-plated vehicles carry no DGT label; they file a
//     declaration before entering and get the city's authorisation.
//   Camera fines started on 14-3-2025.
//   - Annex 1: the zone is the Parte Vieja, the Ensanche (Centro) and part of
//     Amara, bounded by the Urumea, so Gros and Egia are outside. Stops are
//     checked against that perimeter, not the municipality.
//   Irun has announced its own ZBE, reported for spring 2028: not in force,
//   not checked.
// • ZFE-m Pays Basque: from Tarnos to Hendaye (every French place here),
//   06:00–20:00, unclassified and Crit'Air 5 vehicles barred. Informational
//   here: every demo vehicle passes.
// • Transport documents: DeCA for Spanish domestic trips (Orden FOM/2861/2012,
//   electronic from 5-10-2026 under Ley 9/2025 DT 8ª; cabotage included); a
//   CMR between Spain and France (paper, or e-CMR if both parties agree: both
//   countries ratified the e-CMR protocol, neither requires it); a lettre de
//   voiture inside France (arrêté of 9-11-1999, art. 4).
// • Licences: international jobs and cabotage need a Community licence for
//   vehicles over 2.5 t (Reg. 1072/2009 as amended by Reg. 2020/1055, from
//   21-5-2022), and vans of 2.5–3.5 t need a tachograph from 1-7-2026
//   (Reg. 2020/1054).
// • Posting: drivers on cabotage and cross-trade jobs count as posted and need
//   a posting declaration (Directive 2020/1057).
// • Cabotage itself is counted per vehicle in lib/cabotage.ts; cabotageUsed()
//   below is the carrier-level guard the market director uses.
import { CARRIER, VEHICLE } from "@/data/companies";
import { PLACE_IDS, PLACES, type PlaceId } from "@/data/places";
import type { Carrier, Country, Load, Vehicle } from "@/data/types";
import type { LngLat } from "./geo";

// ── Donostia ZBE ────────────────────────────────────────────────────────────

/** 17-12-2024, the day after publication in the BOG. */
export const ZBE_IN_FORCE = Date.parse("2024-12-17T00:00:00+01:00");
/** 36 months later (art. 7). The city's page says 2028; the ordinance gives this date. */
export const ZBE_PHASE2 = Date.parse("2027-12-17T00:00:00+01:00");

export type ZbeStatus = "free" | "authorised" | "banned";

export interface ZbeVerdict {
  status: ZbeStatus;
  phase: 0 | 1 | 2;
  /** When an allowed B label or delivery authorisation stops being enough (phase 2). */
  until?: number;
  /** Foreign plate: an art. 9 declaration is due before entering. */
  declaration: boolean;
}

/** May this vehicle enter the ZBE Donostia Centro at `at`? */
export function zbeVerdict(vehicle: Pick<Vehicle, "eco" | "zbeDeliveryAuth">, at: number, foreignPlate = false): ZbeVerdict {
  const phase = at < ZBE_IN_FORCE ? 0 : at < ZBE_PHASE2 ? 1 : 2;
  const declaration = foreignPlate && phase > 0;
  if (phase === 0) return { status: "free", phase, declaration };
  const label = vehicle.eco;
  if (label === "0" || label === "ECO" || label === "C") return { status: "free", phase, declaration };
  if (label === "B") return phase === 1 ? { status: "free", phase, until: ZBE_PHASE2, declaration } : { status: "banned", phase, declaration };
  // No label: banned, except with the phase-1 delivery authorisation.
  if (phase === 1 && vehicle.zbeDeliveryAuth) return { status: "authorised", phase, until: ZBE_PHASE2, declaration };
  return { status: "banned", phase, declaration };
}

/**
 * The annex-1 perimeter of the ZBE Donostia Centro, traced from its
 * description: Paseo Nuevo and Monte Urgull, the Parte Vieja, the Ensanche,
 * Amara Viejo down to the Plaza del Centenario and Parque Araba; west along
 * Miraconcha (Villa Almudena), Aldapeta, Beloka and San Roke; east along the
 * Urumea to its mouth. Accurate to about 100 m: enough for the demo's stops,
 * not for street addresses.
 */
export const ZBE_PERIMETER: LngLat[] = [
  [-1.9905, 43.3218],
  [-1.9908, 43.3255],
  [-1.9868, 43.328],
  [-1.9818, 43.3262],
  [-1.9787, 43.3242],
  [-1.9797, 43.3208],
  [-1.9787, 43.3164],
  [-1.9789, 43.312],
  [-1.979, 43.3088],
  [-1.983, 43.308],
  [-1.9868, 43.31],
  [-1.9885, 43.3115],
  [-1.9905, 43.3132],
  [-1.9948, 43.3142],
  [-1.9905, 43.3175],
  [-1.9866, 43.3204],
];

/** Point in polygon (ray casting), fine at city scale. */
export function insideZbe([x, y]: LngLat): boolean {
  let inside = false;
  const ring = ZBE_PERIMETER;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Stops inside the perimeter. Today only the San Sebastián stop in Centro; Belartza and the rest are outside. */
export const ZBE_STOPS: ReadonlySet<PlaceId> = new Set(PLACE_IDS.filter((p) => PLACES[p].country === "ES" && insideZbe(PLACES[p].lnglat)));

export function touchesZbe(load: Pick<Load, "from" | "to">): boolean {
  return ZBE_STOPS.has(load.from) || ZBE_STOPS.has(load.to);
}

/** Pays Basque ZFE-m (French Basque coast). */
export function touchesZfe(load: Pick<Load, "from" | "to">): boolean {
  return Boolean(PLACES[load.from].zfe || PLACES[load.to].zfe);
}

/** Spanish-registered vehicles carry a DGT environmental label; foreign plates don't. */
export const hasDgtLabel = (v: Pick<Vehicle, "carrierId">) => CARRIER.get(v.carrierId)?.country === "ES";

/** The ZBE verdict for a load and vehicle, or null when the trip doesn't touch the zone. */
export function zbeFor(load: Pick<Load, "from" | "to">, vehicle: Vehicle, at: number): ZbeVerdict | null {
  return touchesZbe(load) ? zbeVerdict(vehicle, at, !hasDgtLabel(vehicle)) : null;
}

/** A vehicle on this trip may not enter the ZBE (for Dispatch alerts). */
export function zbeProblem(load: Pick<Load, "from" | "to">, vehicle: Vehicle | undefined, at: number): boolean {
  return !!vehicle && zbeFor(load, vehicle, at)?.status === "banned";
}

/** A foreign-plated vehicle entering the ZBE: it needs the city's authorisation (art. 9 declaration). */
export function zbeNeedsAuth(load: Pick<Load, "from" | "to">, vehicle?: Vehicle): boolean {
  return touchesZbe(load) && !!vehicle && !hasDgtLabel(vehicle);
}

// ── Which kind of job ───────────────────────────────────────────────────────

export type JobScope = "domestic" | "international" | "cabotage";

const countryOf = (p: PlaceId): Country => PLACES[p].country;

export function isDomesticSpain(load: Pick<Load, "from" | "to">): boolean {
  return countryOf(load.from) === "ES" && countryOf(load.to) === "ES";
}

/** Domestic for this carrier, international, or cabotage (a domestic trip in another country). */
export function jobScope(load: Pick<Load, "from" | "to">, carrierCountry: Country): JobScope {
  const from = countryOf(load.from);
  if (from !== countryOf(load.to)) return "international";
  return from === carrierCountry ? "domestic" : "cabotage";
}

export function isCabotage(load: Pick<Load, "from" | "to">, carrierId?: string): boolean {
  const c = carrierId ? CARRIER.get(carrierId) : undefined;
  return !!c && jobScope(load, c.country) === "cabotage";
}

/** International, but neither end is in the carrier's country. */
export function isCrossTrade(load: Pick<Load, "from" | "to">, carrierCountry: Country): boolean {
  return jobScope(load, carrierCountry) === "international" && countryOf(load.from) !== carrierCountry && countryOf(load.to) !== carrierCountry;
}

/** Cabotage and cross-trade post the driver; bilateral trips and transit don't. */
export function needsPostingDeclaration(load: Pick<Load, "from" | "to">, carrierCountry: Country): boolean {
  return jobScope(load, carrierCountry) === "cabotage" || isCrossTrade(load, carrierCountry);
}

/** Cabotage operations already used in the current 7-day window (the director's starting figures). */
export const CABOTAGE_USED: Record<string, number> = { "c-baltic": 2, "c-adour": 1, "c-labourd": 0 };
export const CABOTAGE_LIMIT = 3;

/**
 * Carrier-level cabotage count: the starting figures plus every cabotage job
 * booked since. The market director (store) uses it as a quick guard when
 * simulated carriers bid or win; screens check each vehicle with
 * cabotageCheck() in lib/cabotage.ts, which is what the rules count.
 */
export function cabotageUsed(carrierId: string, loads: Pick<Load, "from" | "to" | "carrierId" | "status">[]): number {
  return (
    (CABOTAGE_USED[carrierId] ?? 0) +
    loads.filter((l) => l.carrierId === carrierId && l.status !== "open" && l.status !== "cancelled" && isCabotage(l, carrierId)).length
  );
}

// ── Licences and tachographs ────────────────────────────────────────────────

/** Vans over 2.5 t on international jobs or cabotage need a tachograph from this date. */
export const LIGHT_VAN_TACHOGRAPH_FROM = Date.parse("2026-07-01T00:00:00+02:00");
/** Above this mass a cross-border or cabotage job needs a Community licence. */
export const COMMUNITY_LICENCE_ABOVE_KG = 2_500;

export type LicenceProblem = "communityLicence" | "tachograph";

/** What stops this carrier's vehicle from taking the job; empty when nothing does. */
export function licenceProblems(carrier: Pick<Carrier, "country" | "licence">, vehicle: Pick<Vehicle, "mma" | "tachograph">, load: Pick<Load, "from" | "to">, at: number): LicenceProblem[] {
  if (jobScope(load, carrier.country) === "domestic") return [];
  const out: LicenceProblem[] = [];
  if (vehicle.mma > COMMUNITY_LICENCE_ABOVE_KG && carrier.licence !== "community") out.push("communityLicence");
  if (vehicle.mma > COMMUNITY_LICENCE_ABOVE_KG && vehicle.mma <= 3_500 && at >= LIGHT_VAN_TACHOGRAPH_FROM && !vehicle.tachograph) out.push("tachograph");
  return out;
}

/** The licence as its issuing country names it (shown next to the translated description). */
export function licenceLocalName(carrier: Pick<Carrier, "country" | "licence">): string {
  if (carrier.licence === "community") return { ES: "Licencia comunitaria", FR: "Licence communautaire", LT: "Bendrijos licencija" }[carrier.country];
  return { MDL: "Autorización MDL", MDP: "Autorización MDP", LTI: "Licence de transport intérieur" }[carrier.licence];
}

// ── Transport documents ─────────────────────────────────────────────────────

/** Ley 9/2025 DT 8ª: the Spanish control document is electronic (DeCA) from this date. */
export const DECA_MANDATORY = Date.parse("2026-10-05T00:00:00+02:00");

export type DocKind = "deca" | "cmr" | "lettre";
/** Orden FOM/2861/2012 art. 2: no licence needed (≤ 2 t, or ≤ 2.5 t on alternative fuel), house removals, parcels. */
export type DecaExemption = "noLicence" | "removal" | "parcels";

export interface TransportDoc {
  kind: DocKind;
  /** "required" (DeCA from 5-10-2026), "optional" (paper or electronic) or "byAgreement" (e-CMR if both parties agree). */
  electronic: "required" | "optional" | "byAgreement";
  /** DeCA: the contracting shipper and the carrier (art. 4); CMR: the sender, signed by the carrier; lettre de voiture: the carrier. */
  issuer: "shipperAndCarrier" | "sender" | "carrier";
  /** DeCA exemptions that apply; when any does, no DeCA is needed. */
  exemptions: DecaExemption[];
  /** A cabotage leg: the DeCA covers it, and a lettre de voiture must also show the plate and unloading date. */
  cabotage: boolean;
}

export interface DocContext {
  at?: number;
  vehicle?: Pick<Vehicle, "mma" | "electric">;
  carrierCountry?: Country;
  removal?: boolean;
  parcels?: boolean;
}

export function transportDocument(load: Pick<Load, "from" | "to">, ctx: DocContext = {}): TransportDoc {
  const from = countryOf(load.from);
  const to = countryOf(load.to);
  const cabotage = !!ctx.carrierCountry && jobScope(load, ctx.carrierCountry) === "cabotage";
  if (from !== to) return { kind: "cmr", electronic: "byAgreement", issuer: "sender", exemptions: [], cabotage: false };
  if (from === "FR") return { kind: "lettre", electronic: "optional", issuer: "carrier", exemptions: [], cabotage };
  const exemptions: DecaExemption[] = [];
  const v = ctx.vehicle;
  if (v && (v.mma <= 2_000 || (v.electric && v.mma <= 2_500))) exemptions.push("noLicence");
  if (ctx.removal) exemptions.push("removal");
  if (ctx.parcels) exemptions.push("parcels");
  const electronic = (ctx.at ?? DECA_MANDATORY) >= DECA_MANDATORY ? "required" : "optional";
  return { kind: "deca", electronic, issuer: "shipperAndCarrier", exemptions, cabotage };
}

export function vehicleOf(load: Pick<Load, "vehicleId">) {
  return load.vehicleId ? VEHICLE.get(load.vehicleId) : undefined;
}
