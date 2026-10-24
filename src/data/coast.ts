// A hand-simplified outline of the coast from Bilbao to the Landes (detailed
// between Igeldo and the Adour), the Bidasoa (the border) and the Adour. Good
// enough for illustrations, the OG image and the schematic map shown when
// basemap tiles can't load.
import type { LngLat } from "@/lib/geo";

/** West → east/north along the shore (roughly from Bilbao to the Landes; detailed in the corridor). */
export const COAST: LngLat[] = [
  [-3.4, 43.42], [-3.215, 43.385], [-3.1, 43.375], [-3.03, 43.33], [-3.0, 43.37], [-2.94, 43.42], [-2.85, 43.435], [-2.755, 43.455],
  [-2.69, 43.42], [-2.64, 43.405], [-2.585, 43.38], [-2.505, 43.365], [-2.42, 43.322], [-2.385, 43.31], [-2.355, 43.296],
  [-2.255, 43.297], [-2.204, 43.305], [-2.17, 43.288],
  [-2.12, 43.298], [-2.08, 43.302], [-2.05, 43.309], [-2.025, 43.316], [-2.011, 43.322],
  // La Concha bay
  [-2.002, 43.321], [-2.0, 43.316], [-1.992, 43.3145], [-1.987, 43.317], [-1.988, 43.322], [-1.986, 43.326],
  // Gros, Ulia
  [-1.978, 43.325], [-1.972, 43.327], [-1.96, 43.333], [-1.945, 43.336], [-1.935, 43.338],
  // Pasaia harbour
  [-1.932, 43.332], [-1.929, 43.326], [-1.922, 43.321], [-1.912, 43.318], [-1.915, 43.324], [-1.924, 43.329], [-1.928, 43.339],
  // Jaizkibel to Cabo Higer
  [-1.915, 43.343], [-1.89, 43.35], [-1.865, 43.358], [-1.84, 43.366], [-1.815, 43.374], [-1.801, 43.384], [-1.792, 43.393],
  // Txingudi bay and the Bidasoa mouth
  [-1.787, 43.38], [-1.786, 43.37], [-1.789, 43.363], [-1.779, 43.358], [-1.77, 43.363], [-1.766, 43.375], [-1.752, 43.384],
  // Côte basque
  [-1.735, 43.389], [-1.71, 43.392], [-1.686, 43.396], [-1.676, 43.392], [-1.665, 43.387], [-1.657, 43.393], [-1.652, 43.401],
  [-1.635, 43.41], [-1.612, 43.425], [-1.594, 43.438], [-1.578, 43.452], [-1.572, 43.465], [-1.568, 43.476], [-1.565, 43.484],
  [-1.557, 43.486], [-1.552, 43.495], [-1.537, 43.507], [-1.528, 43.522], [-1.525, 43.528],
  // Landes
  [-1.52, 43.536], [-1.505, 43.56], [-1.485, 43.6], [-1.468, 43.64], [-1.452, 43.68], [-1.43, 43.75], [-1.39, 43.9], [-1.34, 44.1], [-1.29, 44.3],
];

/** Land as one ring: the coast closed through inland corners beyond the map's pan limits. */
export const LAND: LngLat[] = [...COAST, [-0.2, 44.3], [-0.2, 42.6], [-3.4, 42.6], COAST[0]];

/** The Bidasoa from Txingudi upstream: the Spain–France border. */
export const BIDASOA: LngLat[] = [
  [-1.779, 43.358], [-1.77, 43.35], [-1.76, 43.343], [-1.745, 43.338], [-1.735, 43.333], [-1.72, 43.322], [-1.703, 43.308],
  [-1.69, 43.3], [-1.675, 43.284], [-1.66, 43.27], [-1.635, 43.258], [-1.6, 43.245],
];

export const ADOUR: LngLat[] = [
  [-1.525, 43.528], [-1.512, 43.522], [-1.497, 43.513], [-1.487, 43.505], [-1.477, 43.495], [-1.46, 43.49], [-1.43, 43.49], [-1.4, 43.496], [-1.36, 43.505],
];

export const URUMEA: LngLat[] = [
  [-1.978, 43.325], [-1.976, 43.315], [-1.972, 43.305], [-1.965, 43.29], [-1.972, 43.279], [-1.977, 43.268], [-1.99, 43.25],
];

export interface Projector {
  width: number;
  height: number;
  p: (pt: LngLat) => [number, number];
  path: (pts: LngLat[], close?: boolean) => string;
}

/** Equirectangular projection of a lng/lat box onto a `width`-wide canvas (height follows). */
export function projector(box: [number, number, number, number], width: number): Projector {
  const [minLng, minLat, maxLng, maxLat] = box;
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = (maxLng - minLng) * k;
  const h = maxLat - minLat;
  const height = Math.round((width * h) / w);
  const p = ([lng, lat]: LngLat): [number, number] => [((lng - minLng) * k * width) / w, ((maxLat - lat) * height) / h];
  const path = (pts: LngLat[], close = false) =>
    pts.map((pt, i) => `${i ? "L" : "M"}${p(pt)[0].toFixed(1)} ${p(pt)[1].toFixed(1)}`).join("") + (close ? "Z" : "");
  return { width, height, p, path };
}

/** A quadratic arc between two projected points, bowed to the left of travel. */
export function arcPath(a: [number, number], b: [number, number], bow = 0.22): string {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cx = mx + dy * bow;
  const cy = my - dx * bow;
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}
