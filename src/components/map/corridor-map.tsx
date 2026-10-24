"use client";

// The live 3D map: MapLibre GL draws the basemap (vector tiles, 3D buildings,
// relief, sky and a sun placed where it really is) and deck.gl draws the market
// on top, interleaved in the same WebGL context so trucks and arcs sit between
// the buildings (deck-layers.ts, a separate chunk loaded after the basemap's
// first idle).
//
// The map is made once per app session. MapHost keeps this component mounted
// while other screens are shown (inside <Activity mode="hidden">), so tiles,
// shaders and the deck.gl overlay are not rebuilt, or leaked, on every visit.
// Hiding unmounts the effects below, which pauses everything; showing the screen
// again resumes it. The map is removed only when the app layout itself goes away
// (or a restored WebGL context asks for a fresh one: onRestart).
import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, Map as MLMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike, type LngLatLike } from "maplibre-gl";
import { useEffect, useInsertionEffect, useLayoutEffect, useRef } from "react";
import { route } from "@/data/network";
import { PLACE_IDS, PLACES, VIEWS, type ViewId } from "@/data/places";
import { driveMs } from "@/data/seed";
import type { Locale } from "@/i18n/config";
import { along, bbox } from "@/lib/geo";
import { lightingFor, presetInstant, solarPosition, type Lighting, type SunPosition, type TimePreset } from "@/lib/sun";
import { simNow, useMarket, type Settings } from "@/store/market";
import type { DeckHandle, Scene } from "./deck-layers";
import { buildStyle, fallbackStyle, lightSpec, skySpec, TERRAIN } from "./style";
import { metersPerPixel, type MapStatus, type Selection } from "./types";
import { webgl2 } from "./webgl";

export type { MapStatus, Selection } from "./types";

export interface CorridorMapProps {
  dark: boolean;
  lang: Locale;
  settings: Settings;
  /** MapLibre's own UI strings (zoom buttons, compass, the canvas label), from the dictionary. */
  locale: Record<string, string>;
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
  /** The reader panned, zoomed, turned or tilted the map for the first time. */
  onInteract: () => void;
  /** Names for tooltips, already in the reader's language. */
  tooltip: (info: Selection) => string | null;
}

// MapLibre 6 ships its worker as a separate ES module. scripts/copy-worker.mjs copies
// it into public/ under the package version, so it can be cached as immutable
// (next.config.ts) and a new MapLibre gets a new URL.
const WORKER_URL = `/vendor/maplibre-gl-worker-${getVersion()}.mjs`;
const CENTER = PLACES.irun.lnglat;
/** A fast truck on the motorway, m/s of market time: sets how often the trucks need redrawing. */
const TRUCK_SPEED = 25;

/** Light and sky for a time preset (or the market clock when "live"). */
export function lightingAt(time: TimePreset, simMs: number, dark: boolean): Lighting {
  const date = time === "live" ? new Date(simMs) : presetInstant(new Date(simMs), time, CENTER[1], CENTER[0]);
  return lightingFor(solarPosition(date, CENTER[1], CENTER[0]), dark);
}

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

export default function CorridorMap(props: CorridorMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const map = useRef<MLMap | null>(null);
  const deck = useRef<DeckHandle | null>(null);
  const deckLoading = useRef(false);
  const mode = useRef<"vector" | "fallback">("vector");
  const styleReady = useRef(false);
  const shown = useRef(false);
  const narrow = useRef(false);
  const fontFamily = useRef("system-ui, sans-serif");
  const t0 = useRef(0);
  const styled = useRef<{ dark: boolean; lang: Locale } | null>(null);
  const flown = useRef(0);
  const focused = useRef(0);
  const loop = useRef<{ on: boolean; raf: number; timer?: ReturnType<typeof setTimeout> }>({ on: false, raf: 0 });
  // Timers and window listeners made with the map, undone with it.
  const disposers = useRef<(() => void)[]>([]);

  useEffect(() => {
    live.current = props;
  });

  // Final removal only: insertion effects outlive <Activity> hiding (and StrictMode's replay).
  useInsertionEffect(() => () => destroy(), []);

  // Hidden, the container had no size; repaint at the right one before the browser paints.
  useLayoutEffect(() => {
    const m = map.current;
    if (!m) return;
    m.resize();
    m.redraw();
  }, []);

  // Create the map on the first show; resume on every show, pause on every hide.
  useEffect(() => {
    if (!map.current) create();
    shown.current = true;
    deck.current?.setActive(true);
    refresh();
    kick();
    const unsubscribe = useMarket.subscribe((s, prev) => {
      if (s.loads === prev.loads && s.returns === prev.returns && s.clock === prev.clock) return;
      refresh();
      kick();
    });
    const onVisibility = () => kick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      shown.current = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      stopLoop();
      deck.current?.setActive(false);
      map.current?.stop();
    };
    // Built once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function create() {
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
    narrow.current = container.clientWidth < 640;
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
        locale: p.locale,
        // The credits are drawn by the app layout from the dictionaries (credits.tsx), with the first paint.
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
    m.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right");
    p.onSun(lighting.sun);

    for (const type of ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const) {
      m.on(type, (e) => {
        if (e.originalEvent) live.current.onInteract();
      });
    }
    m.on("zoom", refresh);
    m.on("resize", () => {
      narrow.current = m.getContainer().clientWidth < 640;
      refresh();
    });

    // If the vector tiles can't be reached, switch to the schematic corridor.
    let gotTiles = false;
    let tileErrors = 0;
    const toFallback = () => {
      if (mode.current === "fallback" || map.current !== m) return;
      mode.current = "fallback";
      styleReady.current = false;
      const q = live.current;
      const l = lightingAt(q.settings.time, simNow(useMarket.getState().clock), q.dark);
      m.setStyle(fallbackStyle({ dark: q.dark, lighting: l, terrain: q.settings.terrain }), { diff: false });
      q.onStatus("fallback");
      refresh();
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
      if (mode.current !== "fallback" || map.current !== m) return;
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
      refresh();
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

    // The market overlay waits for the basemap: its first idle, or 8 s at the latest.
    m.once("idle", () => void loadDeck(m));
    const late = setTimeout(() => void loadDeck(m), 8_000);
    disposers.current.push(() => {
      clearTimeout(watchdog);
      clearTimeout(late);
      window.removeEventListener("online", retry);
    });
  }

  async function loadDeck(m: MLMap) {
    if (deckLoading.current) return;
    deckLoading.current = true;
    try {
      const { createDeck } = await import("./deck-layers");
      if (map.current !== m) return;
      deck.current = createDeck(m, { onSelect: (s) => live.current.onSelect(s), tooltip: (s) => live.current.tooltip(s) }, t0.current);
      deck.current.setActive(shown.current);
      refresh();
      kick();
    } catch (err) {
      // The basemap still works; the market just isn't drawn on it.
      console.warn("map: the market overlay failed to load", err);
    }
  }

  function destroy() {
    stopLoop();
    disposers.current.forEach((f) => f());
    disposers.current = [];
    deck.current?.destroy();
    deck.current = null;
    const m = map.current;
    map.current = null;
    m?.remove();
  }

  /** What the deck.gl layers are drawn from right now. */
  function scene(): Scene | null {
    const m = map.current;
    if (!m) return null;
    const { settings, dark, lang, selection } = live.current;
    const s = useMarket.getState();
    return {
      layers: settings.layers,
      dark,
      lang,
      selection,
      loads: s.loads,
      returns: s.returns,
      zoom: m.getZoom(),
      narrow: narrow.current,
      fallback: mode.current === "fallback",
      fontFamily: fontFamily.current,
      still: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  }

  function refresh() {
    const d = deck.current;
    const sc = d ? scene() : null;
    if (d && sc) d.update(sc);
  }

  // Trucks glide only while they are shown, on the road, the clock runs and the
  // screen is visible. A frame is drawn as often as they move half a pixel on
  // screen: a few times a second over the whole corridor, 30 times close up.
  function running() {
    return shown.current && !document.hidden && useMarket.getState().clock.speed > 0 && !!deck.current?.moving();
  }

  function interval() {
    const m = map.current;
    if (!m) return 1000;
    const pxPerSecond = (useMarket.getState().clock.speed * TRUCK_SPEED) / metersPerPixel(m.getZoom());
    return Math.min(1000, Math.max(33, 500 / Math.max(pxPerSecond, 0.5)));
  }

  function kick() {
    const L = loop.current;
    if (L.on || !running()) return;
    L.on = true;
    L.raf = requestAnimationFrame(frame);
  }

  function frame() {
    const L = loop.current;
    L.raf = 0;
    if (!running()) {
      L.on = false;
      return;
    }
    deck.current?.tick(simNow(useMarket.getState().clock));
    L.timer = setTimeout(() => {
      L.raf = requestAnimationFrame(frame);
    }, Math.max(0, interval() - 16));
  }

  function stopLoop() {
    const L = loop.current;
    if (L.timer) clearTimeout(L.timer);
    if (L.raf) cancelAnimationFrame(L.raf);
    L.on = false;
    L.raf = 0;
  }

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

  // What the market overlay shows.
  useEffect(() => {
    refresh();
    kick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selection, props.settings.layers, props.dark, props.lang]);

  // The live sun moves with the market clock.
  useEffect(() => {
    if (props.settings.time !== "live") return;
    const id = setInterval(applySettings, 10_000);
    return () => clearInterval(id);
  }, [props.settings.time]);

  // Camera requests count once: showing the screen again must not replay the last one.
  useEffect(() => {
    const m = map.current;
    if (!m || !props.flyTo || props.flyTo.n === flown.current) return;
    flown.current = props.flyTo.n;
    const v = VIEWS[props.flyTo.view];
    const w = m.getContainer().clientWidth;
    const cam: Camera =
      props.flyTo.view === "corridor" ? corridorCamera(m) : { center: [v[0], v[1]], zoom: v[2] - (w < 640 ? 0.8 : w >= 1024 ? 0.45 : 0), pitch: v[3], bearing: v[4] };
    m.flyTo({ ...cam, duration: 2400, essential: true });
  }, [props.flyTo]);

  useEffect(() => {
    const m = map.current;
    if (!m || !props.focus || props.focus.n === focused.current) return;
    focused.current = props.focus.n;
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

  // MapLibre's stylesheet makes its container position:relative (unlayered CSS beats
  // Tailwind's layers), so the container fills a positioned wrapper instead. The zoom
  // buttons sit above the credits' (i) button (important, for the same reason).
  return (
    <div className="absolute inset-0 [&_.maplibregl-ctrl-bottom-right]:bottom-9!">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
