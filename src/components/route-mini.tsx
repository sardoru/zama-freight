// A small static map of one route on our own coast outline: cheap enough to
// sit in every load detail without spinning up WebGL.
import { COAST, LAND, BIDASOA, projector } from "@/data/coast";
import { networkLines, route } from "@/data/network";
import { PLACES, type PlaceId } from "@/data/places";
import type { Locale } from "@/i18n/config";
import { bbox } from "@/lib/geo";
import { cn } from "@/lib/utils";

const roads = networkLines();

function boxFor(from: PlaceId, to: PlaceId): [number, number, number, number] {
  const [x0, y0, x1, y1] = bbox(route(from, to).path);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const k = Math.cos((cy * Math.PI) / 180);
  let w = Math.max((x1 - x0) * k, 0.02) * 1.35;
  let h = Math.max(y1 - y0, 0.01) * 1.35;
  const aspect = 2.1;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return [cx - w / k / 2, cy - h / 2, cx + w / k / 2, cy + h / 2];
}

export function RouteMini({ from, to, lang, className }: { from: PlaceId; to: PlaceId; lang: Locale; className?: string }) {
  const P = projector(boxFor(from, to), 640);
  const r = route(from, to);
  const a = P.p(PLACES[from].lnglat);
  const b = P.p(PLACES[to].lnglat);
  const labelAt = (pt: [number, number], other: [number, number]) => ({
    x: pt[0] + (pt[0] < other[0] ? -12 : 12),
    anchor: (pt[0] < other[0] ? "end" : "start") as "end" | "start",
  });
  const la = labelAt(a, b);
  const lb = labelAt(b, a);
  const clampX = (x: number, anchor: "end" | "start") => (anchor === "end" ? Math.max(x, 150) : Math.min(x, P.width - 150));
  return (
    <svg viewBox={`0 0 ${P.width} ${P.height}`} className={cn("block h-auto w-full rounded-xl border border-line bg-sea", className)} aria-hidden>
      <path d={P.path(LAND, true)} fill="var(--z-land)" />
      <path d={P.path(COAST)} fill="none" stroke="var(--z-line-strong)" strokeWidth="1.5" />
      <path d={P.path(BIDASOA)} fill="none" stroke="var(--z-warn)" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="3 6" />
      {roads.map((x, i) => (
        <path key={i} d={P.path(x.path)} fill="none" stroke="var(--z-line-strong)" strokeWidth={x.road === "motorway" ? 3 : 1.4} strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      ))}
      <path d={P.path(r.path)} fill="none" stroke="var(--z-accent)" strokeOpacity="0.3" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d={P.path(r.path)} fill="none" stroke="var(--z-accent)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={a[0]} cy={a[1]} r="8" fill="var(--z-signal)" stroke="var(--z-land)" strokeWidth="3" />
      <circle cx={b[0]} cy={b[1]} r="8" fill="var(--z-lime)" stroke="var(--z-land)" strokeWidth="3" />
      <text x={clampX(la.x, la.anchor)} y={a[1] + 6} textAnchor={la.anchor} className="art-label" style={{ fontSize: 20 }} fill="var(--z-ink)">
        {PLACES[from].names[lang]}
      </text>
      <text x={clampX(lb.x, lb.anchor)} y={b[1] + 6} textAnchor={lb.anchor} className="art-label" style={{ fontSize: 20 }} fill="var(--z-ink)">
        {PLACES[to].names[lang]}
      </text>
    </svg>
  );
}
