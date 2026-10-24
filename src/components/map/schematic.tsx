"use client";

// The corridor without WebGL: our own coast outline and road graph drawn as SVG,
// with the live market on top (trucks where they are now, open loads, return
// trips, warehouses). Shown when the browser can't do WebGL2 or the 3D map has
// crashed, so the screen still says what is moving where. Drawn in screen pixels,
// fitted to the part of the screen the floating panels leave free, like the map.
import { useEffect, useMemo, useRef, useState } from "react";
import { ADOUR, BIDASOA, COAST, LAND, URUMEA, projector } from "@/data/coast";
import { VEHICLE } from "@/data/companies";
import { networkLines, route } from "@/data/network";
import { PLACE_IDS, PLACES } from "@/data/places";
import { driveMs } from "@/data/seed";
import { WAREHOUSES } from "@/data/warehouses";
import { useI18n } from "@/i18n/client";
import { along, type LngLat } from "@/lib/geo";
import { useMarket } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";

// Every place we serve, Lasarte to the port of Bayonne.
const P = projector([-2.06, 43.26, -1.43, 43.535], 1000);
const ROADS = networkLines();
const HUBS = PLACE_IDS.filter((id) => PLACES[id].hub);
// Hub names sit where they don't collide (San Sebastián and Pasaia, Biarritz and Bayonne are close).
const LABEL: Partial<Record<(typeof HUBS)[number], { dx: number; dy: number; anchor: "start" | "middle" | "end" }>> = {
  donostia: { dx: -10, dy: 16, anchor: "end" },
  pasaia: { dx: 8, dy: -10, anchor: "start" },
  irun: { dx: 0, dy: 22, anchor: "middle" },
  biarritz: { dx: -10, dy: 4, anchor: "end" },
  bayonne: { dx: 10, dy: 4, anchor: "start" },
};

/** Free space around the corridor: the KPIs on top, the settings panel on wide screens, the legend and credits below. */
function padding(w: number) {
  if (w >= 1024) return { l: 280, r: 40, t: 90, b: 80 };
  if (w >= 640) return { l: 24, r: 24, t: 90, b: 56 };
  return { l: 16, r: 16, t: 120, b: 64 };
}

/** A quadratic arc between two points, bowed to the left of travel. */
function arc(a: [number, number], b: [number, number], bow: number) {
  const cx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * bow;
  const cy = (a[1] + b[1]) / 2 - (b[0] - a[0]) * bow;
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}

export function Schematic() {
  const { d, lang } = useI18n();
  const now = useSimNow();
  const loads = useMarket((s) => s.loads);
  const returns = useMarket((s) => s.returns);
  const L = useMarket((s) => s.settings.layers);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // lng/lat → screen pixels, and an SVG path through points.
  const view = useMemo(() => {
    if (!size?.w || !size.h) return null;
    const pad = padding(size.w);
    const s = Math.min((size.w - pad.l - pad.r) / P.width, (size.h - pad.t - pad.b) / P.height);
    const tx = pad.l + (size.w - pad.l - pad.r - P.width * s) / 2;
    const ty = pad.t + (size.h - pad.t - pad.b - P.height * s) / 2;
    const xy = (pt: LngLat): [number, number] => {
      const [x, y] = P.p(pt);
      return [tx + x * s, ty + y * s];
    };
    const path = (pts: LngLat[], close = false) => pts.map((pt, i) => `${i ? "L" : "M"}${xy(pt)[0].toFixed(1)} ${xy(pt)[1].toFixed(1)}`).join("") + (close ? "Z" : "");
    return {
      xy,
      land: path(LAND, true),
      coast: path(COAST),
      rivers: [ADOUR, URUMEA].map((r) => path(r)),
      border: path(BIDASOA),
      roads: ROADS.map((r) => ({ d: path(r.path), motorway: r.road === "motorway" })),
    };
  }, [size]);

  const trucks = useMemo(
    () =>
      loads
        .filter((l) => l.status === "inTransit" && l.departedAt)
        .map((l) => {
          const r = route(l.from, l.to);
          return { id: l.id, at: along(r.path, r.cum, (now - l.departedAt!) / driveMs(l)).point, electric: !!(l.vehicleId && VEHICLE.get(l.vehicleId)?.electric) };
        }),
    [loads, now],
  );

  return (
    <div ref={box} className="absolute inset-0">
      {view && size ? (
        <svg viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label={d.map.schematic} className="h-full w-full">
          <path d={view.land} fill="var(--z-land)" />
          <path d={view.coast} fill="none" stroke="var(--z-line-strong)" strokeWidth="1.5" />
          {view.rivers.map((r) => (
            <path key={r} d={r} fill="none" stroke="var(--z-sea-2)" strokeWidth="3" strokeLinecap="round" />
          ))}
          <path d={view.border} fill="none" stroke="var(--z-warn)" strokeOpacity="0.7" strokeWidth="1.6" strokeDasharray="4 4" />
          {view.roads.map((r, i) => (
            <path key={i} d={r.d} fill="none" stroke="var(--z-line-strong)" strokeWidth={r.motorway ? 3 : 1.4} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {L.returns
            ? returns
                .filter((r) => r.status === "open")
                .map((r) => <path key={r.id} d={arc(view.xy(PLACES[r.from].lnglat), view.xy(PLACES[r.to].lnglat), -0.1)} fill="none" stroke="var(--z-lime)" strokeWidth="2" strokeDasharray="6 4" opacity="0.8" />)
            : null}
          {L.lanes
            ? loads
                .filter((l) => l.status === "open")
                .map((l) => (
                  <path key={l.id} d={arc(view.xy(PLACES[l.from].lnglat), view.xy(PLACES[l.to].lnglat), 0.12)} fill="none" stroke={l.mode === "instant" ? "var(--z-blue)" : "var(--z-accent)"} strokeWidth="1.6" opacity="0.6" />
                ))
            : null}
          {L.warehouses
            ? WAREHOUSES.map((w) => {
                const [x, y] = view.xy(PLACES[w.place].lnglat);
                return <rect key={w.id} x={x - 6} y={y - 6} width="12" height="12" rx="3" fill="var(--z-violet)" stroke="var(--z-land)" strokeWidth="2" />;
              })
            : null}
          {L.trucks
            ? trucks.map((t) => {
                const [x, y] = view.xy(t.at);
                return <circle key={t.id} cx={x} cy={y} r="6" fill={t.electric ? "var(--z-green)" : "var(--z-signal)"} stroke="var(--z-land)" strokeWidth="2" />;
              })
            : null}
          {HUBS.map((id) => {
            const [x, y] = view.xy(PLACES[id].lnglat);
            const l = LABEL[id] ?? { dx: 0, dy: -12, anchor: "middle" };
            return (
              <text key={id} x={x + l.dx} y={y + l.dy} textAnchor={l.anchor} fill="var(--z-ink)" stroke="var(--z-land)" strokeWidth="3" paintOrder="stroke" style={{ fontSize: 13, fontWeight: 700 }}>
                {PLACES[id].names[lang]}
              </text>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
