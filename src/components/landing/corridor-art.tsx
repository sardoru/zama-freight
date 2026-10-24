// The landing illustration: the corridor drawn from our own coast outline and
// road graph, with live-looking lanes, an empty return trip and trucks moving
// along the motorways. Pure SVG + CSS, so it costs nothing to load.
import { ADOUR, BIDASOA, COAST, LAND, URUMEA, arcPath, projector } from "@/data/coast";
import { networkLines, route } from "@/data/network";
import { PLACES, type PlaceId } from "@/data/places";
import { WAREHOUSES } from "@/data/warehouses";
import type { Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/types";
import { makeFmt } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { fill } from "@/lib/utils";

const BOX: [number, number, number, number] = [-2.06, 43.255, -1.43, 43.545];
const P = projector(BOX, 1000);
const pt = (id: PlaceId) => P.p(PLACES[id].lnglat);

const LANES: [PlaceId, PlaceId][] = [
  ["pasaia", "bayonnePort"],
  ["zaisa", "bayonne"],
  ["lezo", "biarritz"],
  ["anglet", "donostia"],
  ["hernani", "zaisa"],
];
const TRUCKS: { from: PlaceId; to: PlaceId; dur: number; begin: number }[] = [
  { from: "pasaia", to: "bayonnePort", dur: 17, begin: -4 },
  { from: "bayonne", to: "zaisa", dur: 15, begin: -9 },
  { from: "belartza", to: "irun", dur: 12, begin: -2 },
  { from: "irun", to: "biarritz", dur: 14, begin: -11 },
  { from: "biarritz", to: "donostia", dur: 19, begin: -6 },
];
const LABELS: { id: PlaceId; dx: number; dy: number; anchor?: "start" | "end" | "middle"; minor?: boolean }[] = [
  { id: "donostia", dx: -6, dy: 34, anchor: "start" },
  { id: "pasaia", dx: 6, dy: -16, anchor: "middle", minor: true },
  { id: "irun", dx: -14, dy: 30, anchor: "end" },
  { id: "hendaye", dx: 14, dy: -6, anchor: "start", minor: true },
  { id: "sjdl", dx: 16, dy: 8, anchor: "start", minor: true },
  { id: "biarritz", dx: 16, dy: 22, anchor: "start" },
  { id: "bayonne", dx: 8, dy: -16, anchor: "end" },
];

const pos = (x: number, y: number) => ({ left: `${(x / P.width) * 100}%`, top: `${(y / P.height) * 100}%` });

export function CorridorArt({ lang, d }: { lang: Locale; d: Dict }) {
  const f = makeFmt(lang);
  const lane = quote({ from: "irun", to: "bayonne", vehicle: "artic" });
  const best = Math.round((lane.fair * 0.93) / 5) * 5;
  const roads = networkLines();
  const [ix, iy] = pt("irun");
  const [bx, by] = pt("bidart");
  const [ox, oy] = pt("oiartzun");

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-sea shadow-card">
        <svg viewBox={`0 0 ${P.width} ${P.height}`} className="block h-auto w-full" role="img" aria-label={d.meta.ogAlt}>
          <defs>
            <pattern id="art-dots" width="14" height="14" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.1" fill="var(--z-land-dot)" />
            </pattern>
            <linearGradient id="art-sea" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--z-sea-2)" />
              <stop offset="1" stopColor="var(--z-sea)" />
            </linearGradient>
            <filter id="art-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>

          <rect width={P.width} height={P.height} fill="url(#art-sea)" />
          {/* shallow-water bands along the shore */}
          {[90, 54, 26].map((w, i) => (
            <path key={w} d={P.path(COAST)} fill="none" stroke="var(--z-land)" strokeOpacity={0.05 + i * 0.05} strokeWidth={w} strokeLinejoin="round" />
          ))}
          <path d={P.path(LAND, true)} fill="var(--z-land)" />
          <path d={P.path(LAND, true)} fill="url(#art-dots)" />
          <path d={P.path(COAST)} fill="none" stroke="var(--z-line-strong)" strokeWidth="1.6" strokeLinejoin="round" />
          {[ADOUR, URUMEA, BIDASOA].map((r, i) => (
            <path key={i} d={P.path(r)} fill="none" stroke="var(--z-sea-2)" strokeWidth={i === 0 ? 6 : 3.5} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <path d={P.path(BIDASOA)} fill="none" stroke="var(--z-warn)" strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="2 7" strokeLinecap="round" />

          {/* the road graph */}
          {roads.map((r, i) => (
            <path
              key={i}
              d={P.path(r.path)}
              fill="none"
              stroke={r.road === "motorway" ? "var(--z-line-strong)" : "var(--z-line)"}
              strokeWidth={r.road === "motorway" ? 3.2 : 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* open loads: glowing arcs with a flowing dash */}
          {LANES.map(([a, b]) => {
            const dPath = arcPath(pt(a), pt(b), 0.2);
            return (
              <g key={`${a}-${b}`}>
                <path d={dPath} fill="none" stroke="var(--z-accent)" strokeOpacity="0.35" strokeWidth="7" filter="url(#art-glow)" />
                <path d={dPath} fill="none" stroke="var(--z-accent)" strokeOpacity="0.45" strokeWidth="2" />
                <path d={dPath} fill="none" stroke="var(--z-accent)" strokeWidth="2.6" strokeLinecap="round" className="z-flow" />
              </g>
            );
          })}
          {/* the empty return trip Bayonne → Irun */}
          <path d={arcPath(pt("bayonne"), pt("irun"), -0.18)} fill="none" stroke="var(--z-lime)" strokeWidth="3" strokeLinecap="round" className="z-flow-slow" />

          {/* warehouses */}
          {WAREHOUSES.map((w) => {
            const [x, y] = pt(w.place);
            return <rect key={w.id} x={x - 7} y={y - 7} width="14" height="14" rx="3.5" fill="var(--z-violet)" stroke="var(--z-land)" strokeWidth="2.5" />;
          })}

          {/* trucks on the motorways */}
          {TRUCKS.map((t, i) => (
            <g key={i}>
              <circle r="11" fill="var(--z-signal)" opacity="0.25">
                <animateMotion dur={`${t.dur}s`} begin={`${t.begin}s`} repeatCount="indefinite" path={P.path(route(t.from, t.to).path)} />
              </circle>
              <circle r="5.5" fill="var(--z-signal)" stroke="var(--z-land)" strokeWidth="2">
                <animateMotion dur={`${t.dur}s`} begin={`${t.begin}s`} repeatCount="indefinite" path={P.path(route(t.from, t.to).path)} />
              </circle>
            </g>
          ))}

          {/* hubs and names */}
          {LABELS.map((l) => {
            const [x, y] = pt(l.id);
            return (
              <g key={l.id} className={l.minor ? "art-minor" : undefined}>
                <circle cx={x} cy={y} r="9" fill="var(--z-ink)" opacity="0.18" className="z-ping" />
                <circle cx={x} cy={y} r="5" fill="var(--z-ink)" stroke="var(--z-land)" strokeWidth="2" />
                <text x={x + l.dx} y={y + l.dy} textAnchor={l.anchor ?? "start"} className="art-label" fill="var(--z-ink)">
                  {PLACES[l.id].names[lang]}
                </text>
              </g>
            );
          })}
          <text x={P.p([-1.758, 43.318])[0]} y={P.p([-1.758, 43.318])[1]} className="art-label art-minor" fill="var(--z-warn)" fontSize="14" textAnchor="middle">
            ES · FR
          </text>

          {/* scale bar: 10 km */}
          <g className="art-minor" transform={`translate(${P.width - 230} ${P.height - 34})`}>
            <rect width={P.p([BOX[0] + 0.1236, 0])[0]} height="5" rx="2.5" fill="var(--z-ink-3)" />
            <text y="-8" className="art-label" fontSize="14" fill="var(--z-ink-3)">
              10 km
            </text>
          </g>
        </svg>

        {/* floating cards (tablet and up) */}
        <div className="pointer-events-none absolute inset-0 hidden sm:block">
          <div className="absolute z-rise" style={{ ...pos(ix - 30, iy + 46), animationDelay: "0.2s" }}>
            <ArtCard tone="accent" kicker="ZM-4128" title={`${PLACES.irun.names[lang]} → ${PLACES.bayonne.names[lang]}`} body={fill(d.landing.heroBids, { n: 3, amount: f.money(best) })} />
          </div>
          <div className="absolute z-rise" style={{ ...pos(bx - 200, by - 60), animationDelay: "0.45s" }}>
            <ArtCard tone="lime" kicker="Txingudi Garraioak" title={`${PLACES.bayonne.names[lang]} → ${PLACES.irun.names[lang]}`} body={fill(d.landing.heroReturn, { pct: 32 })} />
          </div>
          <div className="absolute z-rise" style={{ ...pos(ox - 250, oy - 8), animationDelay: "0.7s" }}>
            <ArtCard tone="violet" kicker="Ugaldetxo DC" title="Oiartzun" body={fill(d.landing.heroFill, { pct: 81 })} />
          </div>
        </div>
      </div>
      {/* the same cards under the art on phones */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
        <ArtCard tone="accent" kicker="ZM-4128" title={`${PLACES.irun.names[lang]} → ${PLACES.bayonne.names[lang]}`} body={fill(d.landing.heroBids, { n: 3, amount: f.money(best) })} />
        <ArtCard tone="lime" kicker="Txingudi Garraioak" title={`${PLACES.bayonne.names[lang]} → ${PLACES.irun.names[lang]}`} body={fill(d.landing.heroReturn, { pct: 32 })} />
      </div>
    </div>
  );
}

const TONE = {
  accent: "bg-accent",
  lime: "bg-lime",
  violet: "bg-violet",
} as const;

function ArtCard({ tone, kicker, title, body }: { tone: keyof typeof TONE; kicker: string; title: string; body: string }) {
  return (
    <div className="glass w-max max-w-full min-w-0 rounded-xl border border-line px-3 py-2 shadow-card sm:max-w-60">
      <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-wide text-ink-3 uppercase">
        <span className={`size-1.5 shrink-0 rounded-full ${TONE[tone]}`} />
        <span className="truncate">{kicker}</span>
      </div>
      <div className="mt-0.5 truncate text-[0.8rem] font-bold text-ink">{title}</div>
      <div className="truncate text-[0.75rem] text-ink-2">{body}</div>
    </div>
  );
}
