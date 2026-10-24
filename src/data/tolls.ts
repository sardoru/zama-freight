// Published motorway tolls on the corridor. Both operators charge by entry
// point, exit point and vehicle class, never per kilometre:
//  • AP-8, Bidegi (Gipuzkoa): tariffs in force from 1 January 2026,
//    https://www.bidegi.eus (2026 AP-8 / AP-1 / AP-636 tarifak). Refresh every
//    1 January. Classes by axles (Decreto Foral Norma 4/2010, art. 1): Ligeros
//    (vans), Pesados I (2–3 axles), Pesados II (4 or more).
//  • A-63, ASF / VINCI Autoroutes: the grid applicable from 1 February 2024
//    (C2/C3/C4-TARIFS-WEB-2024), the newest per-station grid we could verify.
//    ASF revises it every 1 February: refresh it then. Classes 2 (vans 2–3 m
//    high, ≤ 3.5 t), 3 (2-axle trucks) and 4 (3 axles or more).
// Before Zama routes inland, add Gipuzkoa's N-I / A-15 heavy-vehicle charge
// (Norma Foral 5/2021): it is not on any road of today's corridor.
import type { VehicleType } from "./types";

export type TollRoad = "AP-8" | "A-63";
export type TollClass = "light" | "heavy1" | "heavy2";

/** Bidegi Ligeros / ASF class 2 · Pesados I / class 3 · Pesados II / class 4. */
export const TOLL_CLASS: Record<VehicleType, TollClass> = {
  van: "light",
  rigid: "heavy1",
  artic: "heavy2",
  reefer: "heavy2",
  flatbed: "heavy2",
};

export const TARIFFS: Record<TollRoad, { operator: string; year: number; validFrom: string }> = {
  "AP-8": { operator: "Bidegi", year: 2026, validFrom: "2026-01-01" },
  "A-63": { operator: "ASF", year: 2024, validFrom: "2024-02-01" },
};

// ── AP-8 (Bidegi 2026) ─────────────────────────────────────────────────────
// Entry and exit points. Bidegi prices "Donostia - SS. E / Hernani,
// Astigarraga, Lasarte" as one entry, so every junction from Donostia E
// (Astigarraga) westwards is that entry; Pasaia (Herrera) and Errenteria have
// no row of their own and are charged as Donostia E too. The toll section
// therefore starts at Donostia E, not at Errenteria.
type BidegiStop = "donostiaE" | "oiartzun" | "irun" | "behobia";

const BIDEGI_STOP: Record<string, BidegiStop> = {
  j_zubieta: "donostiaE",
  j_anorga: "donostiaE",
  j_errekalde: "donostiaE",
  j_amara: "donostiaE",
  j_martutene: "donostiaE",
  j_intxaurrondo: "donostiaE",
  j_herrera: "donostiaE",
  j_errenteria: "donostiaE",
  j_oiartzun: "oiartzun",
  // Irun M/O and Irun Ventas; towards Behobia Zaisa traffic pays the Irun
  // Ventas row, which is the only Irun entry with an eastbound fare.
  j_irun_s: "irun",
  j_irun_e: "irun",
  j_border: "behobia",
};

/** € for [Ligeros, Pesados I, Pesados II], either direction. */
const BIDEGI_2026: Record<string, [number, number, number]> = {
  "donostiaE|oiartzun": [1.61, 2.65, 3.06],
  "donostiaE|irun": [2.24, 3.83, 4.57],
  "donostiaE|behobia": [3.15, 5.45, 6.53],
  "oiartzun|irun": [2.24, 3.83, 4.57],
  "oiartzun|behobia": [3.15, 5.45, 6.53],
  "irun|behobia": [1.17, 2.0, 2.26],
};

// ── A-63 (ASF 2024) ────────────────────────────────────────────────────────
// Stations in order from the Spanish border, as on the ASF grid. Biarritz has
// two half-interchanges either side of the Négresse barrier: the south one
// only connects towards Spain, the north one only towards Bayonne.
const ASF_STATIONS = [
  "biriatou",
  "peageBiriatou",
  "sjlSud",
  "sjlNord",
  "biarritzSud",
  "peageNegresse",
  "biarritzNord",
  "bayonneSud",
  "bayonneMousserolles",
  "bayonneNord",
] as const;
type AsfStation = (typeof ASF_STATIONS)[number];

// Row r is station r + 1; its values are the fares to stations 0…r, exactly as
// printed on the grid (null = "·", no such trip).
const n = null;
const ASF_2024: Record<TollClass, (number | null)[][]> = {
  light: [
    [3],
    [3, 3],
    [3, 3, 1.2],
    [5, 5, 3.2, 2],
    [7, 7, 5.2, 4, n],
    [n, n, n, n, n, n],
    [7, 7, 5.2, 4, n, 4, 2],
    [7, 7, 5.2, 4, n, 4, 2, 1.3],
    [7, 7, 5.2, 4, n, 4, 2, 1.3, 0],
  ],
  heavy1: [
    [4.4],
    [4.4, 4.4],
    [4.4, 4.4, 1.6],
    [7.3, 7.3, 4.5, 2.9],
    [10.6, 10.6, 7.8, 6.2, n],
    [n, n, n, n, n, n],
    [10.6, 10.6, 7.8, 6.2, n, 6.2, 2.9],
    [10.6, 10.6, 7.8, 6.2, n, 6.2, 2.9, 1.6],
    [10.6, 10.6, 7.8, 6.2, n, 6.2, 2.9, 1.6, 0],
  ],
  heavy2: [
    [5.8],
    [5.8, 5.8],
    [5.8, 5.8, 2.2],
    [9.6, 9.6, 6, 3.8],
    [14.4, 14.4, 10.8, 8.6, n],
    [n, n, n, n, n, n],
    [14.4, 14.4, 10.8, 8.6, n, 8.6, 3.8],
    [14.4, 14.4, 10.8, 8.6, n, 8.6, 3.8, 2.1],
    [14.4, 14.4, 10.8, 8.6, n, 8.6, 3.8, 2.1, 0],
  ],
};

/** Junctions of the road graph along the A-63, south to north. */
const A63_ORDER = ["j_border", "j_biriatou", "j_urrugne", "j_sjdl_s", "j_sjdl_n", "j_guethary", "j_bidart", "j_negresse", "j_anglet", "j_bayonne_s", "j_bayonne_n"];

/** Which station a junction stands for; Bidart and Biarritz use the half that faces the other end of the trip. */
function asfStation(node: string, otherEnd: string): AsfStation | null {
  const north = A63_ORDER.indexOf(otherEnd) > A63_ORDER.indexOf(node);
  switch (node) {
    case "j_border":
    case "j_biriatou":
      return "biriatou";
    case "j_urrugne":
    case "j_sjdl_s":
      return "sjlSud";
    case "j_sjdl_n":
      return "sjlNord";
    case "j_bidart":
    case "j_negresse":
      return north ? "biarritzNord" : "biarritzSud";
    case "j_anglet":
      return "bayonneSud";
    case "j_bayonne_s":
      return "bayonneMousserolles";
    case "j_bayonne_n":
      return "bayonneNord";
    default:
      return null;
  }
}

const BIDEGI_NAME: Record<BidegiStop, string> = { donostiaE: "Donostia E", oiartzun: "Oiartzun", irun: "Irun", behobia: "Behobia" };
const ASF_NAME: Record<AsfStation, string> = {
  biriatou: "Biriatou",
  peageBiriatou: "Biriatou (péage)",
  sjlSud: "Saint-Jean-de-Luz sud",
  sjlNord: "Saint-Jean-de-Luz nord",
  biarritzSud: "Biarritz sud",
  peageNegresse: "La Négresse (péage)",
  biarritzNord: "Biarritz nord",
  bayonneSud: "Bayonne sud",
  bayonneMousserolles: "Bayonne Mousserolles",
  bayonneNord: "Bayonne nord",
};

/** The operator's names for a leg's entry and exit, e.g. ["Donostia E", "Behobia"]. */
export function legStations(road: TollRoad, entry: string, exit: string): [string, string] {
  if (road === "AP-8") return [BIDEGI_NAME[BIDEGI_STOP[entry]] ?? entry, BIDEGI_NAME[BIDEGI_STOP[exit]] ?? exit];
  const a = asfStation(entry, exit);
  const b = asfStation(exit, entry);
  return [a ? ASF_NAME[a] : entry, b ? ASF_NAME[b] : exit];
}

const CLASS_INDEX: Record<TollClass, 0 | 1 | 2> = { light: 0, heavy1: 1, heavy2: 2 };

/**
 * The published toll between two junctions of the graph on one toll road, or
 * 0 when the operator has no fare for that pair (same station, or a trip the
 * interchanges don't allow).
 */
export function legFare(road: TollRoad, entry: string, exit: string, cls: TollClass): number {
  if (road === "AP-8") {
    const a = BIDEGI_STOP[entry];
    const b = BIDEGI_STOP[exit];
    if (!a || !b || a === b) return 0;
    const fares = BIDEGI_2026[`${a}|${b}`] ?? BIDEGI_2026[`${b}|${a}`];
    return fares ? fares[CLASS_INDEX[cls]] : 0;
  }
  const a = asfStation(entry, exit);
  const b = asfStation(exit, entry);
  if (!a || !b || a === b) return 0;
  const [i, j] = [ASF_STATIONS.indexOf(a), ASF_STATIONS.indexOf(b)].sort((x, y) => y - x);
  return ASF_2024[cls][i - 1]?.[j] ?? 0;
}

/** Whether a leg is charged at all (any class), for the "km on toll roads" figure. */
export const isTolled = (road: TollRoad, entry: string, exit: string) => legFare(road, entry, exit, "heavy2") > 0;
