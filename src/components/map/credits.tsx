"use client";

// The map's credits, built from the dictionaries and rendered by the app layout
// (outside the screen that waits for the market), so they are in the server HTML
// and paint with the first frame. MapLibre's own control used to appear late on
// phones, grow as each source reported its credit and push the zoom buttons up:
// it was the screen's LCP element and all of its layout shift.
//
// OSMF's attribution guidelines want the credit visible without any interaction
// and allow folding it on map interaction or after five seconds. So it starts open
// and folds into the (i) button on the first pan or zoom, or after five seconds on
// phones, where it covers part of the map. Folding only hides the text
// (visibility), so nothing else moves.
//
// Terrain: the Terrarium tiles over our bounds are built from ETOPO1, GMTED2010,
// SRTM and EU-DEM at every zoom we allow (7.5 and up; see the README), and Tilezen
// asks for one credit line per source (github.com/tilezen/joerd, docs/attribution.md).
import { Info } from "lucide-react";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import type { Dict } from "@/i18n/types";
import { cn } from "@/lib/utils";
import type { Basemap } from "./types";

const LINKS: Record<string, { text: string; href: string }> = {
  osm: { text: "OpenStreetMap", href: "https://www.openstreetmap.org/copyright" },
  ofm: { text: "OpenFreeMap", href: "https://openfreemap.org" },
  omt: { text: "OpenMapTiles", href: "https://www.openmaptiles.org/" },
  tiles: { text: "Mapzen Terrain Tiles", href: "https://registry.opendata.aws/terrain-tiles/" },
};

/** The credit lines for what is on screen, as dictionary templates. */
export function creditLines(d: Dict, basemap: Basemap): string[] {
  const c = d.map.credits;
  // The schematic outline and road graph are drawn by hand; OSM is credited as a precaution (see the README).
  if (basemap === "svg") return [c.osm];
  const terrain = [c.terrain, c.eudem, c.usgs, c.noaa];
  return basemap === "vector" ? [c.osm, c.tiles, ...terrain] : [c.osm, ...terrain];
}

function withLinks(template: string): ReactNode[] {
  return template.split(/(\{\{\w+\}\})/).map((part, i) => {
    const l = part.startsWith("{{") ? LINKS[part.slice(2, -2)] : undefined;
    if (!l) return part;
    return (
      <a key={i} href={l.href} target="_blank" rel="noreferrer" className="font-semibold text-ink-2 underline-offset-2 hover:underline">
        {l.text}
      </a>
    );
  });
}

// Shared by the map screen (which knows the basemap and sees the first pan or zoom) and the credits.
interface CreditsState {
  basemap: Basemap;
  interacted: boolean;
  timedOut: boolean;
  /** The reader's own open/closed choice, which wins once made. */
  choice: boolean | null;
}
const INITIAL: CreditsState = { basemap: "vector", interacted: false, timedOut: false, choice: null };
let state = INITIAL;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function setCredits(patch: Partial<CreditsState>) {
  if (Object.entries(patch).every(([k, v]) => state[k as keyof CreditsState] === v)) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function useCredits(): CreditsState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
}

const isOpen = (s: CreditsState) => s.choice ?? !(s.interacted || s.timedOut);

/** Whether the credits are unfolded (the map screen hides its hint meanwhile). */
export function useCreditsOpen(): boolean {
  return isOpen(useCredits());
}

/** The credits, over the bottom-right corner of the live map, on the map screen only. */
export function MapCredits() {
  const { d, lang } = useI18n();
  const pathname = usePathname();
  const s = useCredits();
  const onMap = pathname === `/${lang}/app` || pathname === `/${lang}/app/`;
  // Phones: fold after five seconds, the text covers part of a small map.
  useEffect(() => {
    if (!onMap || !window.matchMedia("(max-width: 767px)").matches) return;
    const t = setTimeout(() => setCredits({ timedOut: true }), 5000);
    return () => clearTimeout(t);
  }, [onMap]);
  if (!onMap) return null;
  const open = isOpen(s);
  return (
    <div className="pointer-events-none fixed right-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-2 z-[5] flex items-end justify-end gap-1.5 md:bottom-2">
      <p
        id="map-credits"
        className={cn(
          "glass pointer-events-auto max-w-[min(34rem,calc(100vw-4.5rem))] rounded-xl border border-line px-2.5 py-1.5 text-[0.62rem] leading-snug text-ink-3 shadow-card",
          !open && "invisible",
        )}
      >
        <span className="sr-only">{d.map.credits.title}. </span>
        {creditLines(d, s.basemap).map((l, i) => (
          <Fragment key={l}>
            {i ? " · " : null}
            {withLinks(l)}
          </Fragment>
        ))}
      </p>
      <button
        type="button"
        onClick={() => setCredits({ choice: !open })}
        aria-expanded={open}
        aria-controls="map-credits"
        aria-label={d.map.credits.toggle}
        title={d.map.credits.toggle}
        className="glass pointer-events-auto inline-flex size-[29px] shrink-0 items-center justify-center rounded-full border border-line text-ink-2 shadow-card transition hover:text-ink"
      >
        <Info className="size-4" aria-hidden />
      </button>
    </div>
  );
}
