// Zama's own basemap styles on OpenFreeMap vector tiles (OpenMapTiles schema):
// a "control room" dark and a "loading dock" light, both with 3D buildings,
// hillshaded relief from the Mapzen/AWS terrain tiles, motorway refs, and
// place names in the reader's language. Logistics land (industrial, port,
// railway) is tinted violet like the warehouses on top of it.
//
// The sources carry no attribution strings: the credits (OpenStreetMap,
// OpenFreeMap, OpenMapTiles and one line per terrain dataset) are drawn by the
// screen from the dictionaries, see credits.tsx.
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import { ADOUR, BIDASOA, COAST, LAND, URUMEA } from "@/data/coast";
import type { Locale } from "@/i18n/config";
import type { Lighting } from "@/lib/sun";

const OMT_TILEJSON = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const DEM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

interface Palette {
  bg: string;
  water: string;
  waterway: string;
  wood: string;
  grass: string;
  sand: string;
  residential: string;
  logistics: string;
  park: string;
  aeroway: string;
  casing: string;
  motorway: string;
  motorwayCasing: string;
  major: string;
  minor: string;
  rail: string;
  border: string;
  building: [string, string, string];
  label: string;
  labelMinor: string;
  halo: string;
  waterLabel: string;
  shieldText: string;
  hillShadow: string;
  hillHighlight: string;
  hillAccent: string;
  hillExaggeration: number;
}

const DARK: Palette = {
  bg: "#0d1319",
  water: "#0a1a26",
  waterway: "#10283a",
  wood: "#0f1a17",
  grass: "#101a16",
  sand: "#1d1d18",
  residential: "#121921",
  logistics: "#191629",
  park: "#0f1c18",
  aeroway: "#1a2230",
  casing: "#0b1015",
  motorway: "#5a6b80",
  motorwayCasing: "#1b2633",
  major: "#344253",
  minor: "#222c39",
  rail: "#2c3644",
  border: "#c08a2b",
  building: ["#1a222c", "#212b37", "#2a3645"],
  label: "#c3ccd8",
  labelMinor: "#8593a5",
  halo: "#0b1015",
  waterLabel: "#3d6683",
  shieldText: "#e7edf4",
  hillShadow: "#04070a",
  hillHighlight: "#2c3a4a",
  hillAccent: "#0c131a",
  hillExaggeration: 0.42,
};

const LIGHT: Palette = {
  bg: "#eeede7",
  water: "#b9d6e3",
  waterway: "#a6cadb",
  wood: "#d4e2c6",
  grass: "#e0e9d2",
  sand: "#f1e6c8",
  residential: "#e8e5de",
  logistics: "#e7e1ee",
  park: "#d3e4c3",
  aeroway: "#e0ddd6",
  casing: "#cfcac0",
  motorway: "#f7c873",
  motorwayCasing: "#d79a3a",
  major: "#ffffff",
  minor: "#ffffff",
  rail: "#b9b4aa",
  border: "#a86d0b",
  building: ["#e1ddd4", "#d9d4ca", "#cec8bd"],
  label: "#29323d",
  labelMinor: "#5c6875",
  halo: "#f8f7f3",
  waterLabel: "#4a7891",
  shieldText: "#4a3200",
  hillShadow: "#5c5646",
  hillHighlight: "#ffffff",
  hillAccent: "#a39d8a",
  hillExaggeration: 0.32,
};

const zoomWidth = (pairs: [number, number][]): ExpressionSpecification => ["interpolate", ["exponential", 1.5], ["zoom"], ...pairs.flat()] as ExpressionSpecification;

const nameExpr = (lang: Locale): ExpressionSpecification => ["coalesce", ["get", `name:${lang}`], ["get", "name:latin"], ["get", "name"]];

const classIn = (...classes: string[]): ExpressionSpecification => ["match", ["get", "class"], classes, true, false];

function sky(l: Lighting) {
  return {
    "sky-color": l.sky.sky,
    "horizon-color": l.sky.horizon,
    "fog-color": l.sky.fog,
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.7,
    "fog-ground-blend": 0.82,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 9, 0.2, 12, 0],
  } as StyleSpecification["sky"];
}

export function lightSpec(l: Lighting): NonNullable<StyleSpecification["light"]> {
  return { anchor: "map", position: l.position, color: l.color, intensity: l.intensity };
}
export const skySpec = sky;

const demSources = {
  dem: { type: "raster-dem", tiles: DEM_TILES, encoding: "terrarium", tileSize: 256, maxzoom: 15 },
  terrain: { type: "raster-dem", tiles: DEM_TILES, encoding: "terrarium", tileSize: 256, maxzoom: 15 },
} as const;

function hillshade(p: Palette): LayerSpecification {
  return {
    id: "hillshade",
    type: "hillshade",
    source: "dem",
    paint: {
      "hillshade-shadow-color": p.hillShadow,
      "hillshade-highlight-color": p.hillHighlight,
      "hillshade-accent-color": p.hillAccent,
      "hillshade-exaggeration": p.hillExaggeration,
      "hillshade-illumination-direction": 315,
    },
  };
}

/** 3D relief, part of the style so a diffed restyle (theme, language) keeps it. */
export const TERRAIN = { source: "terrain", exaggeration: 1.45 } as const;

export interface StyleOptions {
  dark: boolean;
  lang: Locale;
  lighting: Lighting;
  buildings: boolean;
  terrain: boolean;
}

export function buildStyle({ dark, lang, lighting, buildings, terrain }: StyleOptions): StyleSpecification {
  const p = dark ? DARK : LIGHT;
  const name = nameExpr(lang);
  const road = (id: string, classes: string[], color: string, widths: [number, number][], extra: Partial<LayerSpecification> = {}): LayerSpecification =>
    ({
      id,
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["all", classIn(...classes), ["!=", ["get", "brunnel"], "tunnel"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": zoomWidth(widths) },
      ...extra,
    }) as LayerSpecification;

  const layers: LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": p.bg } },
    { id: "landcover-wood", type: "fill", source: "omt", "source-layer": "landcover", filter: classIn("wood", "forest"), paint: { "fill-color": p.wood, "fill-opacity": 0.9 } },
    { id: "landcover-grass", type: "fill", source: "omt", "source-layer": "landcover", filter: classIn("grass", "meadow", "farmland", "scrub"), paint: { "fill-color": p.grass, "fill-opacity": 0.6 } },
    { id: "landcover-sand", type: "fill", source: "omt", "source-layer": "landcover", filter: classIn("sand", "beach"), paint: { "fill-color": p.sand } },
    { id: "landuse-residential", type: "fill", source: "omt", "source-layer": "landuse", filter: classIn("residential", "suburb", "neighbourhood"), paint: { "fill-color": p.residential, "fill-opacity": 0.8 } },
    { id: "landuse-logistics", type: "fill", source: "omt", "source-layer": "landuse", filter: classIn("industrial", "commercial", "retail", "railway", "garages", "quarry"), paint: { "fill-color": p.logistics } },
    { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": p.park, "fill-opacity": 0.7 } },
    hillshade(p),
    { id: "water", type: "fill", source: "omt", "source-layer": "water", filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": p.water } },
    {
      id: "waterway",
      type: "line",
      source: "omt",
      "source-layer": "waterway",
      filter: classIn("river", "canal", "stream"),
      paint: { "line-color": p.waterway, "line-width": zoomWidth([[8, 0.5], [12, 1.5], [16, 5]]) },
    },
    { id: "aeroway-area", type: "fill", source: "omt", "source-layer": "aeroway", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": p.aeroway } },
    {
      id: "aeroway-runway",
      type: "line",
      source: "omt",
      "source-layer": "aeroway",
      filter: ["all", ["==", ["geometry-type"], "LineString"], classIn("runway")],
      paint: { "line-color": p.aeroway, "line-width": zoomWidth([[10, 2], [14, 18], [17, 60]]) },
    },
    {
      id: "boundary-country",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      layout: { "line-join": "round" },
      paint: { "line-color": p.border, "line-width": zoomWidth([[6, 1], [12, 2.2]]), "line-dasharray": [3, 2], "line-opacity": 0.75 },
    },
    road("road-minor", ["minor", "service", "track"], p.minor, [[12, 0.4], [14, 1.6], [16, 5], [18, 14]], { minzoom: 12 }),
    road("road-major-casing", ["primary", "secondary", "tertiary", "trunk"], p.casing, [[8, 0.8], [12, 2.6], [14, 5.5], [18, 26]]),
    road("road-major", ["primary", "secondary", "tertiary", "trunk"], p.major, [[8, 0.5], [12, 1.6], [14, 4], [18, 22]]),
    road("road-motorway-casing", ["motorway"], p.motorwayCasing, [[6, 0.8], [10, 2.6], [14, 7], [18, 30]]),
    road("road-motorway", ["motorway"], p.motorway, [[6, 0.5], [10, 1.6], [14, 5], [18, 24]]),
    {
      id: "rail",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: classIn("rail"),
      minzoom: 10,
      paint: { "line-color": p.rail, "line-width": zoomWidth([[10, 0.6], [16, 2.5]]), "line-dasharray": [2, 2] },
    },
    {
      id: "buildings-3d",
      type: "fill-extrusion",
      source: "omt",
      "source-layer": "building",
      minzoom: 12.5,
      filter: ["!=", ["get", "hide_3d"], true],
      layout: { visibility: buildings ? "visible" : "none" },
      paint: {
        "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, p.building[0], 25, p.building[1], 70, p.building[2]],
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 13.5, ["coalesce", ["get", "render_height"], 6]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    {
      id: "water-name",
      type: "symbol",
      source: "omt",
      "source-layer": "water_name",
      filter: ["==", ["geometry-type"], "Point"],
      layout: { "text-field": name, "text-font": ["Noto Sans Italic"], "text-size": 13, "text-letter-spacing": 0.15, "text-max-width": 8 },
      paint: { "text-color": p.waterLabel, "text-halo-color": p.halo, "text-halo-width": 1 },
    },
    {
      id: "road-ref",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      filter: ["all", classIn("motorway", "trunk"), ["has", "ref"]],
      minzoom: 9,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 420,
        "text-field": ["get", "ref"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 10.5,
        "text-rotation-alignment": "viewport",
      },
      paint: { "text-color": p.shieldText, "text-halo-color": p.motorway, "text-halo-width": 3 },
    },
    {
      id: "place-minor",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      filter: classIn("village", "suburb", "neighbourhood", "hamlet"),
      minzoom: 11,
      layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": zoomWidth([[11, 10.5], [15, 13]]), "text-max-width": 8 },
      paint: { "text-color": p.labelMinor, "text-halo-color": p.halo, "text-halo-width": 1.2 },
    },
    {
      id: "place-town",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      filter: classIn("town"),
      minzoom: 8,
      layout: { "text-field": name, "text-font": ["Noto Sans Bold"], "text-size": zoomWidth([[8, 11], [13, 15]]), "text-max-width": 8 },
      paint: { "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.4 },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      filter: classIn("city"),
      layout: { "text-field": name, "text-font": ["Noto Sans Bold"], "text-size": zoomWidth([[6, 12], [12, 19]]), "text-max-width": 8, "text-letter-spacing": 0.02 },
      paint: { "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.6 },
    },
  ];

  return {
    version: 8,
    name: dark ? "Zama dark" : "Zama light",
    glyphs: GLYPHS,
    sources: {
      omt: { type: "vector", url: OMT_TILEJSON },
      ...demSources,
    },
    light: lightSpec(lighting),
    sky: sky(lighting),
    ...(terrain ? { terrain: TERRAIN } : {}),
    layers,
  } as StyleSpecification;
}

const line = (coords: [number, number][]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } });

/** The schematic corridor drawn from our own outline when vector tiles can't load. Labels come from deck.gl. */
export function fallbackStyle({ dark, lighting, terrain }: Pick<StyleOptions, "dark" | "lighting" | "terrain">): StyleSpecification {
  const p = dark ? DARK : LIGHT;
  return {
    version: 8,
    name: "Zama schematic",
    sources: {
      land: { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [LAND] } } },
      coast: { type: "geojson", data: line(COAST) },
      rivers: { type: "geojson", data: { type: "FeatureCollection", features: [line(ADOUR), line(URUMEA), line(BIDASOA)] } },
      border: { type: "geojson", data: line(BIDASOA) },
      ...demSources,
    },
    light: lightSpec(lighting),
    sky: sky(lighting),
    ...(terrain ? { terrain: TERRAIN } : {}),
    layers: [
      { id: "background", type: "background", paint: { "background-color": dark ? "#061019" : "#b3d2e0" } },
      { id: "land", type: "fill", source: "land", paint: { "fill-color": dark ? "#141c25" : "#efede6" } },
      hillshade(p),
      { id: "coast", type: "line", source: "coast", paint: { "line-color": p.waterway, "line-width": zoomWidth([[8, 1], [14, 3]]) } },
      { id: "rivers", type: "line", source: "rivers", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.water, "line-width": zoomWidth([[8, 1.5], [14, 6]]) } },
      { id: "border", type: "line", source: "border", paint: { "line-color": p.border, "line-width": 1.6, "line-dasharray": [3, 2], "line-opacity": 0.8 } },
    ],
  } as StyleSpecification;
}
