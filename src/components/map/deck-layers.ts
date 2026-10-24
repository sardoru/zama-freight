// The deck.gl half of the live map, in its own chunk. CorridorMap imports it after
// the basemap's first "idle", so a phone paints the map before deck.gl and luma.gl
// arrive and compile their shaders.
//
// Layer data stays stable: trucks, open loads and return trips are derived only
// when the market's arrays change, and the layers that don't move are rebuilt only
// when what they show changes (selection, theme, toggles, a zoom step). A frame
// only advances the trips' clock (TripsLayer.currentTime) and slides the few truck
// dots along their routes.
//
// deck.gl also keeps its own requestAnimationFrame loop running for as long as it
// lives. FrameGate lets that loop tick only while something can change (a layer
// update, a camera move, the pointer over the map), so an idle or hidden map does
// no work per frame.
import type { Layer, PickingInfo } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ArcLayer, ColumnLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { MapLibreOverlay, type MapLibreOverlayProps } from "@deck.gl/maplibre";
import type { Map as MLMap } from "maplibre-gl";
import { VEHICLE } from "@/data/companies";
import { networkLines, route } from "@/data/network";
import { PLACE_IDS, PLACES } from "@/data/places";
import { driveMs } from "@/data/seed";
import type { Load, ReturnTrip, Warehouse } from "@/data/types";
import { buildBins, occupancy, WAREHOUSES } from "@/data/warehouses";
import type { Locale } from "@/i18n/config";
import { makeFmt } from "@/lib/format";
import { along, type LngLat } from "@/lib/geo";
import type { MapLayers } from "@/store/market";
import { metersPerPixel, type Selection } from "./types";

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

const NETWORK = networkLines();
const FILL = new Map(WAREHOUSES.map((w) => [w.id, occupancy(buildBins(w))]));
const NO_DEPTH = { depthCompare: "always", depthWriteEnabled: false } as const;

function palette(dark: boolean) {
  return dark
    ? {
        truck: [255, 138, 61] as RGB,
        electric: [52, 211, 153] as RGB,
        lane: [45, 212, 191] as RGB,
        laneTo: [167, 243, 208] as RGB,
        instant: [96, 165, 250] as RGB,
        instantTo: [191, 219, 254] as RGB,
        ret: [163, 230, 53] as RGB,
        retTo: [236, 252, 203] as RGB,
        wh: [167, 139, 250] as RGB,
        road: [86, 104, 126] as RGB,
        select: [255, 255, 255] as RGB,
        text: [231, 237, 244] as RGB,
        halo: [9, 13, 18] as RGB,
      }
    : {
        truck: [228, 98, 12] as RGB,
        electric: [4, 120, 87] as RGB,
        lane: [12, 143, 129] as RGB,
        laneTo: [6, 95, 70] as RGB,
        instant: [29, 95, 209] as RGB,
        instantTo: [30, 64, 175] as RGB,
        ret: [77, 138, 11] as RGB,
        retTo: [54, 83, 20] as RGB,
        wh: [109, 63, 217] as RGB,
        road: [150, 140, 125] as RGB,
        select: [13, 18, 24] as RGB,
        text: [13, 18, 24] as RGB,
        halo: [248, 247, 243] as RGB,
      };
}

const withAlpha = (c: RGB, a: number): RGBA => [c[0], c[1], c[2], a];

/** Everything the layers depend on, gathered by CorridorMap. */
export interface Scene {
  layers: MapLayers;
  dark: boolean;
  lang: Locale;
  selection: Selection;
  loads: Load[];
  returns: ReturnTrip[];
  zoom: number;
  narrow: boolean;
  /** The schematic basemap is on: draw the roads and every place name ourselves. */
  fallback: boolean;
  fontFamily: string;
  /** prefers-reduced-motion: no pulsing halo. */
  still: boolean;
}

export interface Handlers {
  onSelect: (s: Selection) => void;
  tooltip: (s: Selection) => string | null;
}

export interface DeckHandle {
  /** New inputs (market, selection, settings, zoom). */
  update: (scene: Scene) => void;
  /** Move the trucks to market time `now` (epoch ms). */
  tick: (now: number) => void;
  /** Whether a frame would move anything: trucks are shown and at least one is on the road. */
  moving: () => boolean;
  /** Pause (screen hidden) or resume deck.gl's own frame loop. */
  setActive: (on: boolean) => void;
  destroy: () => void;
}

interface Truck {
  load: Load;
  path: LngLat[];
  cum: number[];
  ts: number[];
  dep: number;
  dur: number;
  electric: boolean;
}

interface Label {
  lnglat: LngLat;
  /** Lifted above this warehouse's column. */
  wh?: Warehouse["id"];
  text: string;
  size: number;
  tone: "wh" | "text";
}

/**
 * A requestAnimationFrame stand-in for deck.gl's luma.gl AnimationLoop: it only
 * passes frames through while awake (a short window after each wake) and while
 * the map is on screen; otherwise it holds the loop's next callback until woken.
 */
class FrameGate {
  active = true;
  private cb: FrameRequestCallback | null = null;
  private raf = 0;
  private until = 0;
  private n = 0;

  requestAnimationFrame = (cb: FrameRequestCallback): number => {
    this.cb = cb;
    this.pump();
    return ++this.n;
  };

  cancelAnimationFrame = (): void => {
    this.cb = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  /** Let deck.gl tick for at least `ms` more milliseconds. */
  wake = (ms = 400): void => {
    this.until = Math.max(this.until, performance.now() + ms);
    this.pump();
  };

  private pump() {
    if (this.raf || !this.cb || !this.active || performance.now() > this.until) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      const cb = this.cb;
      this.cb = null;
      cb?.(t);
    });
  }
}

/** What a deck.gl pick refers to. */
function pick(info: PickingInfo): Selection {
  const o = info.object as Truck | Load | ReturnTrip | Warehouse | undefined;
  if (!o || !info.layer) return null;
  const id = info.layer.id;
  if (id === "trucks" || id === "truck-halo" || id === "trails") return { kind: "load", id: (o as Truck).load.id };
  if (id === "lanes") return { kind: "load", id: (o as Load).id };
  if (id === "returns") return { kind: "return", id: (o as ReturnTrip).id };
  if (id === "warehouses") return { kind: "warehouse", id: (o as Warehouse).id };
  return null;
}

const TOOLTIP_STYLE = {
  background: "var(--z-surface)",
  color: "var(--z-ink)",
  border: "1px solid var(--z-line)",
  borderRadius: "10px",
  padding: "6px 9px",
  fontFamily: "var(--font-manrope), system-ui",
  fontSize: "12px",
  fontWeight: "600",
  boxShadow: "var(--z-shadow)",
};

/** Adds the market overlay to `map`, interleaved with the basemap so trucks and arcs sit between the buildings. */
export function createDeck(map: MLMap, handlers: Handlers, t0: number): DeckHandle {
  const gate = new FrameGate();
  // Held in an object that destroy() clears, so no deck.gl callback keeps the map's canvas alive.
  const target: { canvas: HTMLCanvasElement | null } = { canvas: map.getCanvas() };
  const props = {
    interleaved: true,
    layers: [],
    // Trucks move 15-100 px/s at street zoom; give the pointer some slack.
    pickingRadius: 8,
    onClick: (info: PickingInfo) => handlers.onSelect(pick(info)),
    onHover: (info: PickingInfo) => {
      if (target.canvas) target.canvas.style.cursor = info.object ? "pointer" : "";
    },
    getTooltip: (info: PickingInfo) => {
      const sel = pick(info);
      const text = sel ? handlers.tooltip(sel) : null;
      return text ? { text, style: TOOLTIP_STYLE } : null;
    },
    // Not in DeckProps' types: Deck hands it to its luma.gl AnimationLoop as the frame source.
    animationFrameProvider: gate,
  };
  const ov = new MapLibreOverlay(props as MapLibreOverlayProps);
  map.addControl(ov);

  // deck.gl draws inside MapLibre's render pass; its own loop is only needed to apply layer
  // updates, follow the camera and pick under the pointer.
  const container = map.getCanvasContainer();
  const wake = () => gate.wake(250);
  map.on("move", wake);
  for (const type of ["pointermove", "pointerdown", "wheel"]) container.addEventListener(type, wake, { passive: true });

  let scene: Scene | null = null;
  let time = 0;
  let pulseAt = 0;
  // Derived only when the market's arrays change.
  let src: { loads: Load[] | null; returns: ReturnTrip[] | null } = { loads: null, returns: null };
  let trucks: Truck[] = [];
  let open: Load[] = [];
  let rts: ReturnTrip[] = [];
  let fixed: { key: string; below: Layer[]; above: Layer[] } | null = null;
  let labelData: { key: string; data: Label[] } | null = null;
  let selected: { id: string; path: LngLat[][]; ends: LngLat[] } | null = null;

  /** Same items, as far as the layers can tell: keep the old array, so nothing is re-uploaded or redrawn. */
  const same = <T,>(a: T[], b: T[], key: (x: T) => string) => a.length === b.length && a.every((x, i) => key(x) === key(b[i]));

  function derive(loads: Load[], returns: ReturnTrip[]) {
    if (src.loads === loads && src.returns === returns) return;
    src = { loads, returns };
    const next: Truck[] = [];
    for (const l of loads) {
      if (l.status !== "inTransit" || !l.departedAt) continue;
      const r = route(l.from, l.to);
      const dur = driveMs(l);
      const total = r.cum[r.cum.length - 1] || 1;
      next.push({
        load: l,
        path: r.path,
        cum: r.cum,
        ts: r.cum.map((c) => (l.departedAt! - t0 + (c / total) * dur) / 1000),
        dep: l.departedAt,
        dur,
        electric: !!(l.vehicleId && VEHICLE.get(l.vehicleId)?.electric),
      });
    }
    const nextOpen = loads.filter((l) => l.status === "open");
    const nextRts = returns.filter((r) => r.status === "open");
    // The market changes every second or so; most changes (a bid, a booking) don't touch what is drawn.
    if (!same(next, trucks, (t) => `${t.load.id}|${t.dep}|${t.electric}`)) trucks = next;
    if (!same(nextOpen, open, (l) => `${l.id}|${l.mode}`)) {
      open = nextOpen;
      fixed = null;
    }
    if (!same(nextRts, rts, (r) => r.id)) {
      rts = nextRts;
      fixed = null;
    }
  }

  function labelsFor(s: Scene): Label[] {
    // Fewer names when zoomed out on a small screen, so they don't pile up.
    const whNames = s.layers.warehouses && s.zoom >= (s.narrow ? 11.6 : 10.4);
    const placeHubsOnly = s.zoom < (s.narrow ? 12 : 11);
    const key = `${whNames}|${s.fallback}|${placeHubsOnly}|${s.lang}`;
    if (labelData?.key === key) return labelData.data;
    const data: Label[] = [];
    const pct = makeFmt(s.lang).pct;
    if (whNames) for (const w of WAREHOUSES) data.push({ lnglat: PLACES[w.place].lnglat, wh: w.id, text: `${w.name} · ${pct(FILL.get(w.id) ?? 0)}`, size: 12, tone: "wh" });
    // Every place name when the basemap (and its labels) is missing.
    if (s.fallback) {
      for (const id of PLACE_IDS) {
        const pl = PLACES[id];
        if (!pl.hub && placeHubsOnly) continue;
        data.push({ lnglat: pl.lnglat, text: pl.names[s.lang], size: pl.hub ? 15 : 12, tone: "text" });
      }
    }
    labelData = { key, data };
    return data;
  }

  /** The layers that don't move, rebuilt only when what they show changes. */
  function build(s: Scene) {
    const colR = Math.round(Math.min(700, Math.max(45, metersPerPixel(s.zoom) * 9)));
    const selLoad = s.selection?.kind === "load" ? s.loads.find((l) => l.id === s.selection?.id) : undefined;
    const L = s.layers;
    const labels = labelsFor(s);
    // `fixed` is also dropped by derive() when the market's arrays change.
    const key = [s.dark, s.fallback, colR, s.selection?.kind, s.selection?.id, !!selLoad, L.network, L.lanes, L.returns, L.warehouses, s.fontFamily, labelData?.key].join("|");
    if (fixed?.key === key) return fixed;
    const c = palette(s.dark);
    const colH = (id: Warehouse["id"]) => colR * (1.2 + (FILL.get(id) ?? 0) * 3.2);
    const below: Layer[] = [];

    if (L.network || s.fallback) {
      below.push(
        new PathLayer<(typeof NETWORK)[number]>({
          id: "network",
          data: NETWORK,
          getPath: (r) => r.path,
          getColor: (r) => withAlpha(c.road, s.fallback ? (r.road === "motorway" ? 230 : 150) : r.road === "motorway" ? 120 : 70),
          getWidth: (r) => (r.road === "motorway" ? 3 : r.road === "road" ? 1.8 : 1.2),
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
          parameters: NO_DEPTH,
          updateTriggers: { getColor: [s.dark, s.fallback] },
        }),
      );
    }

    if (selLoad) {
      if (selected?.id !== selLoad.id) selected = { id: selLoad.id, path: [route(selLoad.from, selLoad.to).path], ends: [PLACES[selLoad.from].lnglat, PLACES[selLoad.to].lnglat] };
      below.push(
        new PathLayer<LngLat[]>({
          id: "selected-route",
          data: selected.path,
          getPath: (p) => p,
          getColor: withAlpha(c.select, 200),
          getWidth: 6,
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
          parameters: NO_DEPTH,
        }),
        new ScatterplotLayer<LngLat>({
          id: "selected-ends",
          data: selected.ends,
          getPosition: (p) => p,
          getFillColor: withAlpha(c.select, 255),
          getLineColor: withAlpha(c.halo, 255),
          getRadius: 7,
          radiusUnits: "pixels",
          stroked: true,
          lineWidthUnits: "pixels",
          getLineWidth: 2,
          parameters: NO_DEPTH,
        }),
      );
    }

    if (L.lanes) {
      below.push(
        new ArcLayer<Load>({
          id: "lanes",
          data: open,
          getSourcePosition: (l) => PLACES[l.from].lnglat,
          getTargetPosition: (l) => PLACES[l.to].lnglat,
          getSourceColor: (l) => withAlpha(l.mode === "instant" ? c.instant : c.lane, l.id === selLoad?.id ? 255 : 210),
          getTargetColor: (l) => withAlpha(l.mode === "instant" ? c.instantTo : c.laneTo, l.id === selLoad?.id ? 255 : 210),
          getWidth: (l) => (l.id === selLoad?.id ? 5 : 2.4),
          getHeight: 0.26,
          widthUnits: "pixels",
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 90],
          updateTriggers: { getWidth: selLoad?.id, getSourceColor: [selLoad?.id, s.dark], getTargetColor: [selLoad?.id, s.dark] },
        }),
      );
    }

    if (L.returns) {
      const selId = s.selection?.kind === "return" ? s.selection.id : null;
      below.push(
        new ArcLayer<ReturnTrip>({
          id: "returns",
          data: rts,
          getSourcePosition: (r) => PLACES[r.from].lnglat,
          getTargetPosition: (r) => PLACES[r.to].lnglat,
          getSourceColor: withAlpha(c.ret, 235),
          getTargetColor: withAlpha(c.retTo, 235),
          getWidth: (r) => (r.id === selId ? 6 : 3.2),
          getHeight: 0.18,
          getTilt: 18,
          widthUnits: "pixels",
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 90],
          updateTriggers: { getWidth: selId },
        }),
      );
    }

    if (L.warehouses) {
      const selId = s.selection?.kind === "warehouse" ? s.selection.id : null;
      below.push(
        new ColumnLayer<Warehouse>({
          id: "warehouses",
          data: WAREHOUSES,
          getPosition: (w) => PLACES[w.place].lnglat,
          getElevation: (w) => colH(w.id),
          getFillColor: (w) => withAlpha(c.wh, w.id === selId ? 255 : 200),
          radius: colR,
          diskResolution: 6,
          angle: 30,
          extruded: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 70],
          material: { ambient: 0.55, diffuse: 0.6, shininess: 24 },
          updateTriggers: { getElevation: colR, getFillColor: [selId, s.dark] },
        }),
      );
    }

    const above: Layer[] = [];
    if (labels.length) {
      above.push(
        new TextLayer<Label>({
          id: "labels",
          data: labels,
          getPosition: (x) => [x.lnglat[0], x.lnglat[1], x.wh ? colH(x.wh) + colR * 0.6 : 0],
          getText: (x) => x.text,
          getSize: (x) => x.size,
          getColor: (x) => withAlpha(x.tone === "wh" ? c.wh : c.text, 255),
          getPixelOffset: [0, -10],
          fontFamily: s.fontFamily,
          fontWeight: 700,
          characterSet: "auto",
          fontSettings: { sdf: true, fontSize: 64, buffer: 8 },
          outlineWidth: 4,
          outlineColor: withAlpha(c.halo, 230),
          billboard: true,
          parameters: NO_DEPTH,
          updateTriggers: { getPosition: colR, getColor: s.dark },
        }),
      );
    }
    fixed = { key, below, above };
    return fixed;
  }

  /** The trucks: trails on the GPU clock, and dots slid along their routes. */
  function movingLayers(s: Scene): Layer[] {
    if (!s.layers.trucks || !trucks.length) return [];
    const c = palette(s.dark);
    const now = t0 + time * 1000;
    const pulse = s.still ? 0.5 : 0.5 + 0.5 * Math.sin(pulseAt / 380);
    const selId = s.selection?.kind === "load" ? s.selection.id : null;
    const at = (t: Truck) => along(t.path, t.cum, (now - t.dep) / t.dur).point;
    return [
      new TripsLayer<Truck>({
        id: "trails",
        data: trucks,
        getPath: (t) => t.path,
        getTimestamps: (t) => t.ts,
        getColor: (t) => (t.electric ? c.electric : c.truck),
        currentTime: time,
        trailLength: 520,
        fadeTrail: true,
        widthMinPixels: 4,
        capRounded: true,
        jointRounded: true,
        parameters: NO_DEPTH,
        updateTriggers: { getColor: s.dark },
      }),
      new ScatterplotLayer<Truck>({
        id: "truck-halo",
        data: trucks,
        getPosition: at,
        getFillColor: (t) => withAlpha(t.electric ? c.electric : c.truck, 255),
        opacity: 0.2 + 0.2 * pulse,
        getRadius: 11 + 5 * pulse,
        radiusUnits: "pixels",
        // The halo is the bigger target: moving trucks are hard to hit on the 6 px dot alone.
        pickable: true,
        parameters: NO_DEPTH,
        updateTriggers: { getPosition: time, getFillColor: s.dark },
      }),
      new ScatterplotLayer<Truck>({
        id: "trucks",
        data: trucks,
        getPosition: at,
        getFillColor: (t) => (t.electric ? c.electric : c.truck),
        getLineColor: withAlpha(c.halo, 255),
        getRadius: (t) => (t.load.id === selId ? 8 : 6),
        radiusUnits: "pixels",
        stroked: true,
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        pickable: true,
        parameters: NO_DEPTH,
        updateTriggers: { getPosition: time, getRadius: selId, getFillColor: s.dark, getLineColor: s.dark },
      }),
    ];
  }

  // The first time, layer kinds come in one at a time (roads, arcs, columns, trucks, labels),
  // a few frames apart, so their shaders compile in short tasks rather than one long freeze.
  let staged = 1;
  const STAGES = 5;
  const stage = setInterval(() => {
    staged++;
    render();
    if (staged >= STAGES) clearInterval(stage);
  }, 60);
  const KIND: Record<string, number> = { network: 1, "selected-route": 1, "selected-ends": 4, lanes: 2, returns: 2, warehouses: 3, trails: 4, "truck-halo": 4, trucks: 4, labels: 5 };

  let shown: Layer[] = [];
  function render() {
    if (!scene) return;
    const f = build(scene);
    const all = [...f.below, ...movingLayers(scene), ...f.above];
    const layers = staged >= STAGES ? all : all.filter((l) => (KIND[l.id] ?? 1) <= staged);
    // Nothing new to draw: don't wake deck.gl (or repaint the map) for it.
    if (layers.length === shown.length && layers.every((l, i) => l === shown[i])) return;
    shown = layers;
    ov.setProps({ layers });
    gate.wake(60);
  }

  return {
    update(next) {
      scene = next;
      derive(next.loads, next.returns);
      render();
    },
    tick(now) {
      time = (now - t0) / 1000;
      pulseAt = performance.now();
      render();
    },
    moving: () => !!scene?.layers.trucks && trucks.length > 0,
    setActive(on) {
      gate.active = on;
      if (on) gate.wake();
    },
    destroy() {
      clearInterval(stage);
      map.off("move", wake);
      map.off("render", wake);
      for (const type of ["pointermove", "pointerdown", "wheel"]) container.removeEventListener(type, wake);
      target.canvas = null;
      gate.active = false;
      gate.cancelAnimationFrame();
      try {
        map.removeControl(ov);
      } catch {
        /* the map is already gone */
      }
    },
  };
}
