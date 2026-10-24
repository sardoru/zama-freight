"use client";

// The live 3D map: MapLibre GL draws the basemap (vector tiles, 3D buildings,
// relief, sky and a sun placed where it really is), deck.gl draws the market
// on top, interleaved in the same WebGL context so trucks and arcs sit
// between the buildings: trucks with trails, open loads as arcs, empty return
// trips, warehouses as columns as tall as they are full.
import "maplibre-gl/dist/maplibre-gl.css";
import type { PickingInfo } from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import { ArcLayer, ColumnLayer, PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { MapLibreOverlay } from "@deck.gl/maplibre";
import { AttributionControl, Map as MLMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike, type LngLatLike } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { VEHICLE } from "@/data/companies";
import { networkLines, route } from "@/data/network";
import { PLACE_IDS, PLACES, VIEWS, type PlaceId, type ViewId } from "@/data/places";
import { driveMs } from "@/data/seed";
import type { Load, ReturnTrip, Warehouse } from "@/data/types";
import { buildBins, occupancy, WAREHOUSES } from "@/data/warehouses";
import type { Locale } from "@/i18n/config";
import { makeFmt } from "@/lib/format";
import { along, bbox, type LngLat } from "@/lib/geo";
import { lightingFor, presetInstant, solarPosition, type Lighting, type SunPosition, type TimePreset } from "@/lib/sun";
import { simNow, useMarket, type Settings } from "@/store/market";
import { buildStyle, fallbackStyle, lightSpec, skySpec, TERRAIN } from "./style";

export type Selection = { kind: "load" | "return" | "warehouse"; id: string } | null;
export type MapStatus = "loading" | "ready" | "fallback" | "nowebgl";

export interface CorridorMapProps {
  dark: boolean;
  lang: Locale;
  settings: Settings;
  /** Fly to a preset view; `n` makes repeated requests for the same view count. */
  flyTo: { view: ViewId; n: number } | null;
  /** Frame a load (its truck if it is moving, otherwise its route). */
  focus: { loadId: string; n: number } | null;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onStatus: (s: MapStatus) => void;
  onSun: (s: SunPosition) => void;
  /** The WebGL context was lost and restored: remount the map on a fresh canvas. */
  onRestart: () => void;
  /** Names for tooltips, already in the reader's language. */
  tooltip: (info: Selection) => string | null;
}

// MapLibre 6 ships its worker as a separate ES module; scripts/copy-worker.mjs
// copies it into public/ on install so the bundler doesn't have to find it.
const WORKER_URL = "/vendor/maplibre-gl-worker.mjs";
const CENTER = PLACES.irun.lnglat;

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

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

function webgl2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    // Hand the probe's context back: browsers cap how many can be alive at once.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** Light and sky for a time preset (or the market clock when "live"). */
export function lightingAt(time: TimePreset, simMs: number, dark: boolean): Lighting {
  const date = time === "live" ? new Date(simMs) : presetInstant(new Date(simMs), time, CENTER[1], CENTER[0]);
  return lightingFor(solarPosition(date, CENTER[1], CENTER[0]), dark);
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

interface Derived {
  loads: Load[] | null;
  returns: ReturnTrip[] | null;
  trucks: Truck[];
  open: Load[];
  rts: ReturnTrip[];
}

const network = networkLines();

/** Every place on the map, for framing "the whole corridor". */
const CORRIDOR_POINTS = PLACE_IDS.map((id) => PLACES[id].lnglat);

type Camera = { center: LngLatLike; zoom: number; bearing: number; pitch: number };

/**
 * Which floating panels are on screen. They follow the window's width (Tailwind's md, lg and xl), not the map's: the
 * side navigation takes 72 px from md and 224 px from xl.
 */
function layout(): "phone" | "tablet" | "laptop" | "desktop" {
  const vw = window.innerWidth;
  return vw < 768 ? "phone" : vw < 1024 ? "tablet" : vw < 1280 ? "laptop" : "desktop";
}

/**
 * The whole corridor, framed for this container: every place inside the part of the screen the floating panels leave
 * free. When that part is taller than wide (phones, tablets, a desktop between its two side panels) the map turns so
 * the corridor (it heads about 58° east of north) runs up the screen instead of lying across it as a thin strip. The
 * fit is measured on the camera itself, so the pitch's perspective counts (cameraForBounds fits the bounding box seen
 * from straight above).
 */
function corridorCamera(m: MLMap): Camera {
  const v = VIEWS.corridor;
  const { clientWidth: w, clientHeight: h } = m.getContainer();
  // The free rectangle, in map pixels. Phones: KPI chips on top, buttons on the right, map controls bottom right.
  // Tablets: the chips wrap to two rows and the live feed sits top right. Laptops add the legend bottom left;
  // desktops open the settings panel on the left.
  const box = {
    phone: { l: 28, r: w - 64, t: 120, b: h - 70 },
    tablet: { l: 30, r: w - 350, t: 170, b: h - 50 },
    laptop: { l: 30, r: w - 410, t: 170, b: h - 110 },
    desktop: { l: 314, r: w - 410, t: 100, b: h - 60 },
  }[layout()];
  const upright = box.b - box.t > (box.r - box.l) * 1.1;
  const bearing = upright ? 55 : v[4];
  const pitch = upright ? 45 : v[3];
  let cam: Camera = { center: [v[0], v[1]], zoom: v[2] - (w < 640 ? 0.9 : 0), bearing, pitch };
  if (box.r - box.l < 80 || box.b - box.t < 80) return cam;
  const was: Camera = { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() };
  // Measure, move the places' middle onto the rectangle's, rescale, again: a few rounds settle the perspective. The
  // jumps all happen before the next frame, and the camera goes back to where it was.
  for (let i = 0; i < 5; i++) {
    m.jumpTo(cam);
    const pts = CORRIDOR_POINTS.map((p) => m.project(p));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min((box.r - box.l) / Math.max(1, x1 - x0), (box.b - box.t) / Math.max(1, y1 - y0));
    const c = m.project(m.getCenter());
    const center = m.unproject([c.x + (x0 + x1 - box.l - box.r) / 2, c.y + (y0 + y1 - box.t - box.b) / 2]);
    cam = { center, zoom: m.getZoom() + Math.log2(k), bearing, pitch };
  }
  m.jumpTo(was);
  return cam;
}
const fill = new Map(WAREHOUSES.map((w) => [w.id, occupancy(buildBins(w))]));

export default function CorridorMap(props: CorridorMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const map = useRef<MLMap | null>(null);
  const overlay = useRef<MapLibreOverlay | null>(null);
  const mode = useRef<"vector" | "fallback">("vector");
  const styleReady = useRef(false);
  const derived = useRef<Derived>({ loads: null, returns: null, trucks: [], open: [], rts: [] });
  const fontFamily = useRef("system-ui, sans-serif");
  const t0 = useRef(0);
  const styled = useRef<{ dark: boolean; lang: Locale } | null>(null);

  useEffect(() => {
    live.current = props;
  });

  // Create the map once.
  useEffect(() => {
    const container = el.current;
    if (!container) return;
    if (!webgl2()) {
      live.current.onStatus("nowebgl");
      return;
    }
    setWorkerUrl(new URL(WORKER_URL, window.location.origin).href);
    const root = getComputedStyle(document.documentElement);
    fontFamily.current = `${root.getPropertyValue("--font-manrope").trim() || "Manrope"}, system-ui, sans-serif`;
    t0.current = simNow(useMarket.getState().clock);

    const p = live.current;
    const v = VIEWS.corridor;
    const lighting = lightingAt(p.settings.time, t0.current, p.dark);
    let m: MLMap;
    try {
      m = new MLMap({
        container,
        style: buildStyle({ dark: p.dark, lang: p.lang, lighting, buildings: p.settings.layers.buildings, terrain: p.settings.terrain }),
        // Framed for this screen by corridorCamera() right below.
        center: [v[0], v[1]],
        zoom: v[2],
        pitch: v[3],
        bearing: v[4],
        minZoom: 7.5,
        maxZoom: 18.5,
        maxPitch: 78,
        maxBounds: [
          [-3.4, 42.6],
          [-0.2, 44.3],
        ],
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
        fadeDuration: 150,
      });
    } catch (err) {
      // The probe got a WebGL2 context but MapLibre couldn't get one with the attributes it needs.
      console.warn("map:", err);
      live.current.onStatus("nowebgl");
      return;
    }
    map.current = m;
    styled.current = { dark: p.dark, lang: p.lang };
    // Keep the views clear of the floating panels on wide screens: the feed on the right, and on desktops the settings
    // panel, open by default, on the left.
    const screen = layout();
    if (screen === "laptop" || screen === "desktop") m.setPadding({ left: screen === "desktop" ? 284 : 0, right: 380, top: 60, bottom: 0 });
    m.jumpTo(corridorCamera(m));
    m.addControl(new AttributionControl({ compact: true }), "bottom-right");
    m.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right");
    p.onSun(lighting.sun);

    const ov = new MapLibreOverlay({
      interleaved: true,
      layers: [],
      // Trucks move 15-100 px/s at street zoom; give the pointer some slack.
      pickingRadius: 8,
      onClick: (info: PickingInfo) => live.current.onSelect(pick(info)),
      onHover: (info: PickingInfo) => {
        m.getCanvas().style.cursor = info.object ? "pointer" : "";
      },
      getTooltip: (info: PickingInfo) => {
        const sel = pick(info);
        const text = sel ? live.current.tooltip(sel) : null;
        return text
          ? {
              text,
              style: {
                background: "var(--z-surface)",
                color: "var(--z-ink)",
                border: "1px solid var(--z-line)",
                borderRadius: "10px",
                padding: "6px 9px",
                fontFamily: "var(--font-manrope), system-ui",
                fontSize: "12px",
                fontWeight: "600",
                boxShadow: "var(--z-shadow)",
              },
            }
          : null;
      },
    });
    overlay.current = ov;
    m.addControl(ov);

    // If the vector tiles can't be reached, switch to the schematic corridor.
    let gotTiles = false;
    let tileErrors = 0;
    const toFallback = () => {
      if (mode.current === "fallback" || !map.current) return;
      mode.current = "fallback";
      styleReady.current = false;
      const q = live.current;
      const l = lightingAt(q.settings.time, simNow(useMarket.getState().clock), q.dark);
      m.setStyle(fallbackStyle({ dark: q.dark, lighting: l, terrain: q.settings.terrain }), { diff: false });
      q.onStatus("fallback");
    };
    m.on("sourcedata", (e) => {
      if (e.sourceId === "omt" && e.tile) gotTiles = true;
    });
    m.on("error", (e) => {
      const { sourceId, tile } = e as { sourceId?: string; tile?: unknown };
      const err = e.error as (Error & { url?: string }) | undefined;
      const fromOmt = sourceId === "omt" || /openfreemap/.test(`${err?.url ?? ""} ${err?.message ?? ""}`);
      if (!fromOmt) return console.warn("map:", err?.message ?? e);
      if (mode.current !== "vector" || gotTiles) return;
      // Give up on the basemap when its TileJSON fails (no tile attached) or the first tiles all
      // fail; one failed tile (a 503, a network blip on a phone) is just a gap.
      if (!tile || ++tileErrors >= 6) toFallback();
    });
    const arm = () =>
      setTimeout(() => {
        if (!gotTiles) toFallback();
      }, 25_000);
    let watchdog = arm();
    // Back online after a fallback: try the real basemap again.
    const retry = () => {
      if (mode.current !== "fallback" || !map.current) return;
      mode.current = "vector";
      gotTiles = false;
      tileErrors = 0;
      styleReady.current = false;
      clearTimeout(watchdog);
      watchdog = arm();
      const q = live.current;
      const l = lightingAt(q.settings.time, simNow(useMarket.getState().clock), q.dark);
      m.setStyle(buildStyle({ dark: q.dark, lang: q.lang, lighting: l, buildings: q.settings.layers.buildings, terrain: q.settings.terrain }), { diff: false });
      q.onStatus("loading");
    };
    window.addEventListener("online", retry);
    // deck.gl can't follow MapLibre through a lost WebGL context (its buffers and programs die with
    // it and luma keeps stale state on the context object): start again on a fresh canvas.
    m.on("webglcontextrestored", () => live.current.onRestart());

    m.on("style.load", () => {
      styleReady.current = true;
      applySettings();
    });
    m.once("load", () => {
      if (mode.current === "vector") live.current.onStatus(gotTiles ? "ready" : "loading");
    });
    m.on("idle", () => {
      if (mode.current === "vector" && gotTiles) live.current.onStatus("ready");
    });

    // deck.gl layers, redrawn ~30 times a second so trucks glide.
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 33 || document.hidden) return;
      last = t;
      ov.setProps({ layers: layers() });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
      window.removeEventListener("online", retry);
      overlay.current = null;
      map.current = null;
      try {
        m.removeControl(ov);
      } catch {
        /* already gone */
      }
      m.remove();
    };
    // Built once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Terrain, building visibility, light and sky from the current settings. */
  function applySettings() {
    const m = map.current;
    if (!m || !styleReady.current) return;
    const { settings, dark } = live.current;
    try {
      // setTerrain rebuilds the terrain (meshes, render targets) every call: only call it on a change.
      if (settings.terrain !== !!m.getTerrain()) m.setTerrain(settings.terrain ? TERRAIN : null);
      if (m.getLayer("buildings-3d")) m.setLayoutProperty("buildings-3d", "visibility", settings.layers.buildings ? "visible" : "none");
      const l = lightingAt(settings.time, simNow(useMarket.getState().clock), dark);
      m.setLight(lightSpec(l));
      m.setSky(skySpec(l)!);
      live.current.onSun(l.sun);
    } catch {
      /* style swapped mid-way; style.load will apply again */
    }
  }

  // Theme or language: restyle (diffed, so tiles stay).
  useEffect(() => {
    const m = map.current;
    if (!m || (styled.current?.dark === props.dark && styled.current?.lang === props.lang)) return;
    styled.current = { dark: props.dark, lang: props.lang };
    const l = lightingAt(props.settings.time, simNow(useMarket.getState().clock), props.dark);
    const style =
      mode.current === "fallback"
        ? fallbackStyle({ dark: props.dark, lighting: l, terrain: props.settings.terrain })
        : buildStyle({ dark: props.dark, lang: props.lang, lighting: l, buildings: props.settings.layers.buildings, terrain: props.settings.terrain });
    m.setStyle(style);
    // style.load doesn't fire for a diffed update: apply right away too.
    applySettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.dark, props.lang]);

  useEffect(() => {
    applySettings();
  }, [props.settings.terrain, props.settings.time, props.settings.layers.buildings]);

  // The live sun moves with the market clock.
  useEffect(() => {
    if (props.settings.time !== "live") return;
    const id = setInterval(applySettings, 10_000);
    return () => clearInterval(id);
  }, [props.settings.time]);

  useEffect(() => {
    const m = map.current;
    if (!m || !props.flyTo) return;
    const v = VIEWS[props.flyTo.view];
    const w = m.getContainer().clientWidth;
    const cam: Camera =
      props.flyTo.view === "corridor" ? corridorCamera(m) : { center: [v[0], v[1]], zoom: v[2] - (w < 640 ? 0.8 : w >= 1024 ? 0.45 : 0), pitch: v[3], bearing: v[4] };
    m.flyTo({ ...cam, duration: 2400, essential: true });
  }, [props.flyTo]);

  useEffect(() => {
    const m = map.current;
    if (!m || !props.focus) return;
    const l = useMarket.getState().loads.find((x) => x.id === props.focus?.loadId);
    if (!l) return;
    const r = route(l.from, l.to);
    if (l.status === "inTransit" && l.departedAt) {
      const now = simNow(useMarket.getState().clock);
      const { point, heading } = along(r.path, r.cum, (now - l.departedAt) / driveMs(l));
      m.flyTo({ center: point, zoom: 13.4, pitch: 62, bearing: heading - 20, duration: 2200, essential: true });
    } else {
      const b = bbox(r.path);
      m.fitBounds([b[0], b[1], b[2], b[3]] as LngLatBoundsLike, {
        // Clear of the chips and the load's card (at the bottom on phones, bottom right on tablets, under the feed
        // further up); on wider screens the camera padding already clears the side panels.
        padding: {
          phone: { top: 130, bottom: 280, left: 30, right: 64 },
          tablet: { top: 180, bottom: 60, left: 40, right: 400 },
          laptop: { top: 70, bottom: 110, left: 50, right: 50 },
          desktop: { top: 70, bottom: 90, left: 50, right: 50 },
        }[layout()],
        pitch: 50,
        duration: 2000,
        maxZoom: 13.5,
      });
    }
  }, [props.focus]);

  /** What a deck.gl pick refers to. */
  function pick(info: PickingInfo): Selection {
    const o = info.object as { load?: Load; id?: string } | undefined;
    if (!o || !info.layer) return null;
    const id = info.layer.id;
    if (id === "trucks" || id === "truck-halo" || id === "trails") return { kind: "load", id: (o as Truck).load.id };
    if (id === "lanes") return { kind: "load", id: (o as Load).id };
    if (id === "returns") return { kind: "return", id: (o as ReturnTrip).id };
    if (id === "warehouses") return { kind: "warehouse", id: (o as Warehouse).id };
    return null;
  }

  function derive(loads: Load[], returns: ReturnTrip[]): Derived {
    const d = derived.current;
    if (d.loads === loads && d.returns === returns) return d;
    const base = t0.current;
    const trucks: Truck[] = [];
    for (const l of loads) {
      if (l.status !== "inTransit" || !l.departedAt) continue;
      const r = route(l.from, l.to);
      const dur = driveMs(l);
      const total = r.cum[r.cum.length - 1] || 1;
      trucks.push({
        load: l,
        path: r.path,
        cum: r.cum,
        ts: r.cum.map((c) => (l.departedAt! - base + (c / total) * dur) / 1000),
        dep: l.departedAt,
        dur,
        electric: !!(l.vehicleId && VEHICLE.get(l.vehicleId)?.electric),
      });
    }
    const next = { loads, returns, trucks, open: loads.filter((l) => l.status === "open"), rts: returns.filter((r) => r.status === "open") };
    derived.current = next;
    return next;
  }

  function layers() {
    const m = map.current;
    if (!m) return [];
    const { settings, dark, selection } = live.current;
    const s = useMarket.getState();
    const now = simNow(s.clock);
    const d = derive(s.loads, s.returns);
    const c = palette(dark);
    const fallback = mode.current === "fallback";
    const zoom = m.getZoom();
    const mpp = (156543.03 * Math.cos((CENTER[1] * Math.PI) / 180)) / 2 ** zoom;
    const colR = Math.min(700, Math.max(45, mpp * 9));
    const colH = (id: string) => colR * (1.2 + (fill.get(id as Warehouse["id"]) ?? 0) * 3.2);
    const time = (now - t0.current) / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 380);
    const selLoad = selection?.kind === "load" ? s.loads.find((l) => l.id === selection.id) : undefined;
    const L = settings.layers;
    const out = [];

    if (L.network || fallback) {
      out.push(
        new PathLayer({
          id: "network",
          data: network,
          getPath: (r) => r.path,
          getColor: (r) => withAlpha(c.road, fallback ? (r.road === "motorway" ? 230 : 150) : r.road === "motorway" ? 120 : 70),
          getWidth: (r) => (r.road === "motorway" ? 3 : r.road === "road" ? 1.8 : 1.2),
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
          parameters: { depthCompare: "always", depthWriteEnabled: false },
          updateTriggers: { getColor: [dark, fallback] },
        }),
      );
    }

    if (selLoad) {
      const r = route(selLoad.from, selLoad.to);
      out.push(
        new PathLayer({
          id: "selected-route",
          data: [r.path],
          getPath: (p) => p,
          getColor: withAlpha(c.select, 200),
          getWidth: 6,
          widthUnits: "pixels",
          capRounded: true,
          jointRounded: true,
          parameters: { depthCompare: "always", depthWriteEnabled: false },
        }),
        new ScatterplotLayer({
          id: "selected-ends",
          data: [PLACES[selLoad.from].lnglat, PLACES[selLoad.to].lnglat],
          getPosition: (p) => p,
          getFillColor: withAlpha(c.select, 255),
          getLineColor: withAlpha(c.halo, 255),
          getRadius: 7,
          radiusUnits: "pixels",
          stroked: true,
          lineWidthUnits: "pixels",
          getLineWidth: 2,
          parameters: { depthCompare: "always", depthWriteEnabled: false },
        }),
      );
    }

    if (L.lanes) {
      out.push(
        new ArcLayer<Load>({
          id: "lanes",
          data: d.open,
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
          updateTriggers: { getWidth: selLoad?.id, getSourceColor: [selLoad?.id, dark], getTargetColor: [selLoad?.id, dark] },
        }),
      );
    }

    if (L.returns) {
      out.push(
        new ArcLayer<ReturnTrip>({
          id: "returns",
          data: d.rts,
          getSourcePosition: (r) => PLACES[r.from].lnglat,
          getTargetPosition: (r) => PLACES[r.to].lnglat,
          getSourceColor: withAlpha(c.ret, 235),
          getTargetColor: withAlpha(c.retTo, 235),
          getWidth: (r) => (selection?.kind === "return" && selection.id === r.id ? 6 : 3.2),
          getHeight: 0.18,
          getTilt: 18,
          widthUnits: "pixels",
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 90],
          updateTriggers: { getWidth: selection?.id, getSourceColor: dark, getTargetColor: dark },
        }),
      );
    }

    if (L.warehouses) {
      out.push(
        new ColumnLayer<Warehouse>({
          id: "warehouses",
          data: WAREHOUSES,
          getPosition: (w) => PLACES[w.place].lnglat,
          getElevation: (w) => colH(w.id),
          getFillColor: (w) => withAlpha(c.wh, selection?.kind === "warehouse" && selection.id === w.id ? 255 : 200),
          radius: colR,
          diskResolution: 6,
          angle: 30,
          extruded: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 70],
          material: { ambient: 0.55, diffuse: 0.6, shininess: 24 },
          updateTriggers: { getElevation: Math.round(colR), getFillColor: [selection?.id, dark] },
        }),
      );
    }

    if (L.trucks) {
      out.push(
        new TripsLayer<Truck>({
          id: "trails",
          data: d.trucks,
          getPath: (t) => t.path,
          getTimestamps: (t) => t.ts,
          getColor: (t) => (t.electric ? c.electric : c.truck),
          currentTime: time,
          trailLength: 520,
          fadeTrail: true,
          widthMinPixels: 4,
          capRounded: true,
          jointRounded: true,
          parameters: { depthCompare: "always", depthWriteEnabled: false },
          updateTriggers: { getColor: dark },
        }),
        new ScatterplotLayer<Truck>({
          id: "truck-halo",
          data: d.trucks,
          getPosition: (t) => along(t.path, t.cum, (now - t.dep) / t.dur).point,
          getFillColor: (t) => withAlpha(t.electric ? c.electric : c.truck, Math.round(50 + 50 * pulse)),
          getRadius: 11 + 5 * pulse,
          radiusUnits: "pixels",
          // The halo is the bigger target: moving trucks are hard to hit on the 6 px dot alone.
          pickable: true,
          parameters: { depthCompare: "always", depthWriteEnabled: false },
          updateTriggers: { getPosition: time, getFillColor: [pulse, dark], getRadius: pulse },
        }),
        new ScatterplotLayer<Truck>({
          id: "trucks",
          data: d.trucks,
          getPosition: (t) => along(t.path, t.cum, (now - t.dep) / t.dur).point,
          getFillColor: (t) => (t.electric ? c.electric : c.truck),
          getLineColor: withAlpha(c.halo, 255),
          getRadius: (t) => (t.load.id === selLoad?.id ? 8 : 6),
          radiusUnits: "pixels",
          stroked: true,
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          pickable: true,
          parameters: { depthCompare: "always", depthWriteEnabled: false },
          updateTriggers: { getPosition: time, getRadius: selLoad?.id, getFillColor: dark, getLineColor: dark },
        }),
      );
    }

    // Labels: warehouses always; every place when the basemap (and its labels) is missing.
    const labels: { pos: [number, number, number]; text: string; size: number; tone: RGB }[] = [];
    // Fewer names when zoomed out on a small screen, so they don't pile up.
    const narrow = m.getContainer().clientWidth < 640;
    if (L.warehouses && zoom >= (narrow ? 11.6 : 10.4)) {
      const pct = makeFmt(live.current.lang).pct;
      for (const w of WAREHOUSES) {
        const [lng, lat] = PLACES[w.place].lnglat;
        labels.push({ pos: [lng, lat, colH(w.id) + colR * 0.6], text: `${w.name} · ${pct(fill.get(w.id) ?? 0)}`, size: 12, tone: c.wh });
      }
    }
    if (fallback) {
      for (const id of PLACE_IDS) {
        const pl = PLACES[id as PlaceId];
        if (!pl.hub && zoom < (narrow ? 12 : 11)) continue;
        labels.push({ pos: [pl.lnglat[0], pl.lnglat[1], 0], text: pl.names[live.current.lang], size: pl.hub ? 15 : 12, tone: c.text });
      }
    }
    if (labels.length) out.push(
      new TextLayer<(typeof labels)[number]>({
        id: "labels",
        data: labels,
        getPosition: (x) => x.pos,
        getText: (x) => x.text,
        getSize: (x) => x.size,
        getColor: (x) => withAlpha(x.tone, 255),
        getPixelOffset: [0, -10],
        fontFamily: fontFamily.current,
        fontWeight: 700,
        characterSet: "auto",
        fontSettings: { sdf: true, fontSize: 64, buffer: 8 },
        outlineWidth: 4,
        outlineColor: withAlpha(c.halo, 230),
        billboard: true,
        parameters: { depthCompare: "always", depthWriteEnabled: false },
        updateTriggers: { getPosition: Math.round(colR), getColor: dark },
      }),
    );
    return out;
  }

  // MapLibre's stylesheet makes its container position:relative (unlayered CSS beats
  // Tailwind's layers), so the container fills a positioned wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
