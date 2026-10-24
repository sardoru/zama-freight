// A hand-traced road graph of the corridor: the GI-20 round the south of
// Donostia, the AP-8 and A-63 motorways, the N-1/GI-636 and D-810 roads and the
// urban links to every place. Routes are shortest-time paths over it, smoothed
// so they read as roads. This is a prototype stand-in for a routing engine
// (OSRM / Valhalla): close at regional zoom, approximate street by street.
import { cumulative, smooth, type LngLat } from "@/lib/geo";
import { PLACES, type PlaceId } from "./places";

type Junction =
  | "j_zubieta" | "j_anorga" | "j_errekalde" | "j_amara" | "j_martutene" | "j_intxaurrondo" | "j_herrera"
  | "j_errenteria" | "j_oiartzun" | "j_ap8_irun_w" | "j_irun_s" | "j_irun_e" | "j_border" | "j_biriatou"
  | "j_urrugne" | "j_sjdl_s" | "j_sjdl_n" | "j_guethary" | "j_bidart" | "j_negresse" | "j_anglet"
  | "j_bayonne_s" | "j_bayonne_n" | "j_gaintxurizketa" | "j_behobia" | "j_santiago";

export type NodeId = PlaceId | Junction;
export type RoadClass = "motorway" | "road" | "urban";

const JUNCTIONS: Record<Junction, LngLat> = {
  j_zubieta: [-2.04, 43.283],
  j_anorga: [-2.018, 43.292],
  j_errekalde: [-2.0, 43.296],
  j_amara: [-1.985, 43.299],
  j_martutene: [-1.965, 43.2975],
  j_intxaurrondo: [-1.95, 43.3045],
  j_herrera: [-1.933, 43.3085],
  j_errenteria: [-1.903, 43.306],
  j_oiartzun: [-1.864, 43.302],
  j_ap8_irun_w: [-1.82, 43.3215],
  j_irun_s: [-1.796, 43.329],
  j_irun_e: [-1.772, 43.3335],
  j_border: [-1.748, 43.337],
  j_biriatou: [-1.733, 43.3378],
  j_urrugne: [-1.688, 43.364],
  j_sjdl_s: [-1.662, 43.379],
  j_sjdl_n: [-1.642, 43.397],
  j_guethary: [-1.612, 43.418],
  j_bidart: [-1.584, 43.438],
  j_negresse: [-1.546, 43.457],
  j_anglet: [-1.505, 43.472],
  j_bayonne_s: [-1.48, 43.48],
  j_bayonne_n: [-1.456, 43.495],
  j_gaintxurizketa: [-1.853, 43.327],
  j_behobia: [-1.759, 43.344],
  j_santiago: [-1.783, 43.347],
};

export function nodePoint(id: NodeId): LngLat {
  return id in JUNCTIONS ? JUNCTIONS[id as Junction] : PLACES[id as PlaceId].lnglat;
}

interface EdgeSpec {
  a: NodeId;
  b: NodeId;
  via?: LngLat[];
  road: RoadClass;
  ref: string;
}

const E = (a: NodeId, b: NodeId, road: RoadClass, ref: string, via: LngLat[] = []): EdgeSpec => ({ a, b, road, ref, via });

const EDGES: EdgeSpec[] = [
  // GI-20, the free motorway through the south of Donostia, then the tolled
  // AP-8 from Errenteria to the Bidasoa
  E("j_zubieta", "j_anorga", "motorway", "GI-20", [[-2.029, 43.2885]]),
  E("j_anorga", "j_errekalde", "motorway", "GI-20"),
  E("j_errekalde", "j_amara", "motorway", "GI-20", [[-1.9925, 43.2985]]),
  E("j_amara", "j_martutene", "motorway", "GI-20", [[-1.975, 43.297]]),
  E("j_martutene", "j_intxaurrondo", "motorway", "GI-20", [[-1.958, 43.301]]),
  E("j_intxaurrondo", "j_herrera", "motorway", "GI-20", [[-1.942, 43.3075]]),
  E("j_herrera", "j_errenteria", "motorway", "GI-20", [[-1.918, 43.3075]]),
  E("j_errenteria", "j_oiartzun", "motorway", "AP-8", [[-1.885, 43.305]]),
  E("j_oiartzun", "j_ap8_irun_w", "motorway", "AP-8", [[-1.845, 43.311]]),
  E("j_ap8_irun_w", "j_irun_s", "motorway", "AP-8", [[-1.808, 43.326]]),
  E("j_irun_s", "j_irun_e", "motorway", "AP-8", [[-1.784, 43.3315]]),
  E("j_irun_e", "j_border", "motorway", "AP-8", [[-1.76, 43.336]]),
  E("j_border", "j_biriatou", "motorway", "A-63"),
  // A-63 up the Basque coast to Bayonne
  E("j_biriatou", "j_urrugne", "motorway", "A-63", [[-1.715, 43.347]]),
  E("j_urrugne", "j_sjdl_s", "motorway", "A-63", [[-1.675, 43.372]]),
  E("j_sjdl_s", "j_sjdl_n", "motorway", "A-63"),
  E("j_sjdl_n", "j_guethary", "motorway", "A-63", [[-1.627, 43.407]]),
  E("j_guethary", "j_bidart", "motorway", "A-63"),
  E("j_bidart", "j_negresse", "motorway", "A-63", [[-1.565, 43.448]]),
  E("j_negresse", "j_anglet", "motorway", "A-63", [[-1.525, 43.465]]),
  E("j_anglet", "j_bayonne_s", "motorway", "A-63"),
  E("j_bayonne_s", "j_bayonne_n", "motorway", "A-63", [[-1.468, 43.487]]),
  // GI-636 / N-1 between Errenteria, Lezo and Irun; the old bridges into France
  E("errenteria", "lezo", "road", "GI-636"),
  E("lezo", "j_gaintxurizketa", "road", "GI-636", [[-1.878, 43.324]]),
  E("j_gaintxurizketa", "irun", "road", "GI-636", [[-1.825, 43.333], [-1.805, 43.337]]),
  E("irun", "j_behobia", "road", "N-1", [[-1.774, 43.341]]),
  E("j_behobia", "j_urrugne", "road", "D-810", [[-1.74, 43.352], [-1.71, 43.36]]),
  E("irun", "j_santiago", "urban", "N-638"),
  E("j_santiago", "hendaye", "urban", "D-810", [[-1.779, 43.353]]),
  E("hendaye", "j_urrugne", "road", "D-810", [[-1.75, 43.361], [-1.715, 43.364]]),
  // D-810 along the French coast
  E("sjdl", "bidart", "road", "D-810", [[-1.63, 43.405], [-1.605, 43.421]]),
  E("bidart", "biarritz", "road", "D-810", [[-1.575, 43.46]]),
  E("biarritz", "anglet", "urban", "D-810", [[-1.54, 43.487]]),
  E("anglet", "bayonne", "urban", "D-810", [[-1.495, 43.49]]),
  E("donostia", "pasaia", "urban", "N-1", [[-1.96, 43.317], [-1.94, 43.319]]),
  // Links from places to the network
  E("donostia", "j_amara", "urban", "GI-20", [[-1.9805, 43.312], [-1.983, 43.305]]),
  E("belartza", "j_errekalde", "road", "GI-20"),
  E("pasaia", "j_herrera", "road", "GI-2638", [[-1.929, 43.316]]),
  E("errenteria", "j_errenteria", "road", "GI-2132"),
  E("oiartzun", "j_oiartzun", "road", "GI-2134"),
  E("hernani", "j_martutene", "road", "GI-131", [[-1.973, 43.28]]),
  E("lasarte", "j_anorga", "road", "GI-40", [[-2.02, 43.28]]),
  E("astigarraga", "j_intxaurrondo", "road", "GI-2132", [[-1.948, 43.293]]),
  E("zaisa", "j_irun_e", "road", "N-121-A"),
  E("irun", "j_irun_s", "urban", "N-1", [[-1.793, 43.333]]),
  E("hondarribia", "irun", "road", "GI-636", [[-1.793, 43.352]]),
  E("sjdl", "j_sjdl_s", "road", "D-810"),
  E("bidart", "j_bidart", "road", "D-655"),
  E("biarritz", "j_negresse", "road", "D-810", [[-1.556, 43.47]]),
  E("anglet", "j_anglet", "road", "D-260", [[-1.511, 43.479]]),
  E("bayonne", "j_bayonne_n", "road", "D-936", [[-1.465, 43.493]]),
  E("bayonnePort", "bayonne", "road", "D-309", [[-1.482, 43.503]]),
];

/** Average truck speed by road class (km/h), stops included. */
export const SPEED_KMH: Record<RoadClass, number> = { motorway: 82, road: 52, urban: 30 };

interface Edge extends EdgeSpec {
  path: LngLat[];
  meters: number;
  seconds: number;
}

const edges: Edge[] = EDGES.map((e) => {
  const path = [nodePoint(e.a), ...(e.via ?? []), nodePoint(e.b)];
  const c = cumulative(path);
  const meters = c[c.length - 1];
  return { ...e, path, meters, seconds: meters / ((SPEED_KMH[e.road] * 1000) / 3600) };
});

const adjacency = new Map<NodeId, { edge: Edge; forward: boolean }[]>();
for (const edge of edges) {
  for (const [from, forward] of [
    [edge.a, true],
    [edge.b, false],
  ] as const) {
    const list = adjacency.get(from) ?? [];
    list.push({ edge, forward });
    adjacency.set(from, list);
  }
}

export interface Route {
  from: PlaceId;
  to: PlaceId;
  path: LngLat[];
  /** Cumulative metres at each vertex of `path`. */
  cum: number[];
  km: number;
  minutes: number;
  roads: string[];
  crossesBorder: boolean;
  /** Km on toll motorways (AP-8 east of Errenteria, A-63). */
  tollKm: number;
}

const cache = new Map<string, Route>();

/** Fastest route between two places (Dijkstra on travel time). */
export function route(from: PlaceId, to: PlaceId): Route {
  const key = `${from}>${to}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dist = new Map<NodeId, number>([[from, 0]]);
  const prev = new Map<NodeId, { node: NodeId; edge: Edge; forward: boolean }>();
  const open = new Set<NodeId>([from]);
  while (open.size) {
    let u: NodeId | null = null;
    for (const v of open) if (u === null || (dist.get(v) ?? Infinity) < (dist.get(u) ?? Infinity)) u = v;
    if (u === null || u === to) break;
    open.delete(u);
    for (const { edge, forward } of adjacency.get(u) ?? []) {
      const v = forward ? edge.b : edge.a;
      const d = (dist.get(u) ?? Infinity) + edge.seconds;
      if (d < (dist.get(v) ?? Infinity)) {
        dist.set(v, d);
        prev.set(v, { node: u, edge, forward });
        open.add(v);
      }
    }
  }
  const steps: { edge: Edge; forward: boolean }[] = [];
  let cur: NodeId = to;
  while (cur !== from) {
    const p = prev.get(cur);
    if (!p) break;
    steps.unshift({ edge: p.edge, forward: p.forward });
    cur = p.node;
  }
  const raw: LngLat[] = [];
  let meters = 0;
  let seconds = 0;
  let tollMeters = 0;
  const roads: string[] = [];
  for (const { edge, forward } of steps) {
    const pts = forward ? edge.path : [...edge.path].reverse();
    raw.push(...(raw.length ? pts.slice(1) : pts));
    meters += edge.meters;
    seconds += edge.seconds;
    if (edge.ref === "A-63" || (edge.ref === "AP-8" && edge.road === "motorway")) tollMeters += edge.meters;
    if (roads[roads.length - 1] !== edge.ref) roads.push(edge.ref);
  }
  const path = smooth(raw.length ? raw : [PLACES[from].lnglat, PLACES[to].lnglat], 2);
  const result: Route = {
    from,
    to,
    path,
    cum: cumulative(path),
    km: Math.round(meters / 100) / 10,
    // Loading/unloading is priced separately; this is driving time.
    minutes: Math.max(6, Math.round(seconds / 60)),
    roads,
    crossesBorder: PLACES[from].country !== PLACES[to].country,
    tollKm: Math.round(tollMeters / 100) / 10,
  };
  cache.set(key, result);
  return result;
}

/** Every road of the graph, for drawing the corridor network. */
export function networkLines(): { path: LngLat[]; road: RoadClass; ref: string }[] {
  return edges.map((e) => ({ path: smooth(e.path, 2), road: e.road, ref: e.ref }));
}
