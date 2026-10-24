// Types shared by the map screen, MapLibre (corridor-map) and the deck.gl chunk
// (deck-layers), kept here so importing them never pulls either library in.
export type Selection = { kind: "load" | "return" | "warehouse"; id: string } | null;

export type MapStatus = "loading" | "ready" | "fallback" | "nowebgl";

/** What is drawn under the market: OpenFreeMap vector tiles, our schematic outline over the relief (MapLibre), or the SVG schematic (no WebGL). */
export type Basemap = "vector" | "schematic" | "svg";

/** Metres per screen pixel at the corridor's latitude (Irun, 43.34° N). */
export const metersPerPixel = (zoom: number) => (156543.03 * Math.cos((43.34 * Math.PI) / 180)) / 2 ** zoom;
