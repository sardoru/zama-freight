// The share card, one per language: the corridor from San Sebastián to Bayonne
// drawn from our coast outline and road graph (derived from OpenStreetMap data),
// glowing load lanes, an empty return trip, trucks on the motorway, and the
// headline in the reader's language. A "prototype · simulated data" badge and
// the map-data credit are part of the art, so a shared link never looks like a
// live market (issue #3). Rendered by satori + resvg via next/og on the first
// request for a language; generateImageMetadata gives each language its own alt
// text (meta.ogAlt, which says "prototype" too).
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BIDASOA, COAST, LAND, ADOUR, arcPath, projector } from "@/data/coast";
import { networkLines, route } from "@/data/network";
import { PLACES, type PlaceId } from "@/data/places";
import { WAREHOUSES } from "@/data/warehouses";
import { isLocale, LOCALES, type Locale } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";
import { along } from "@/lib/geo";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const W = 760;
// Framed so San Sebastián sits just right of the text column and Bayonne inside the edge.
const P = projector([-2.132, 43.182, -1.408, 43.618], W);
const pt = (id: PlaceId) => P.p(PLACES[id].lnglat);
const LANES: [PlaceId, PlaceId][] = [
  ["pasaia", "bayonnePort"],
  ["zaisa", "bayonne"],
  ["lezo", "biarritz"],
  ["anglet", "donostia"],
  ["hernani", "zaisa"],
];
const TRUCKS: [PlaceId, PlaceId, number][] = [
  ["pasaia", "bayonnePort", 0.58],
  ["bayonne", "zaisa", 0.3],
  ["belartza", "irun", 0.45],
  ["irun", "biarritz", 0.78],
];
const LABELS: { id: PlaceId; dx: number; dy: number }[] = [
  { id: "donostia", dx: -40, dy: 14 },
  { id: "pasaia", dx: -20, dy: -40 },
  { id: "irun", dx: -64, dy: 10 },
  { id: "hendaye", dx: 14, dy: -32 },
  { id: "biarritz", dx: -96, dy: -6 },
  { id: "bayonne", dx: -30, dy: 16 },
];

/**
 * One card per language, with og:image:alt / twitter:image:alt in that language
 * (served at /{lang}/opengraph-image/card). Next passes plain params here, a
 * promise to the image function below; at build time `lang` can be missing.
 */
export function generateImageMetadata({ params }: { params?: { lang?: string } }) {
  const raw = params?.lang;
  const lang: Locale = isLocale(raw) ? raw : "es";
  return [{ id: "card", alt: getDict(lang).meta.ogAlt, size, contentType }];
}

export default async function Image({ params }: { params: Promise<{ lang: string }>; id: Promise<string | number> }) {
  const { lang: raw } = await params;
  const lang: Locale = isLocale(raw) ? raw : "es";
  const d = getDict(lang);
  // Literal paths, so file tracing picks up exactly these files (see also next.config.ts).
  const [l800, l600, x800, x600, c800, c600, mono] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/manrope-latin-800-normal.woff")),
    readFile(join(process.cwd(), "assets/fonts/manrope-latin-600-normal.woff")),
    readFile(join(process.cwd(), "assets/fonts/manrope-latin-ext-800-normal.woff")),
    readFile(join(process.cwd(), "assets/fonts/manrope-latin-ext-600-normal.woff")),
    readFile(join(process.cwd(), "assets/fonts/manrope-cyrillic-800-normal.woff")),
    readFile(join(process.cwd(), "assets/fonts/manrope-cyrillic-600-normal.woff")),
    readFile(join(process.cwd(), "assets/fonts/jetbrains-mono-latin-600-normal.woff")),
  ]);

  const title = d.meta.ogTitle;
  // Cyrillic runs wider than Latin at the same size.
  const span = title.length * (/[\u0400-\u04ff]/.test(title) ? 1.18 : 1);
  const titleSize = span > 58 ? 46 : span > 48 ? 52 : 58;
  const hubs = (["donostia", "pasaia", "irun", "biarritz", "bayonne"] as PlaceId[]).map((h) => PLACES[h].names[lang].replace(/^(Puerto de|Port of|Port de|Порт) /, "")).join(" · ");
  const chips = [d.nav.loads, d.fleet.returnsTitle, d.nav.map, d.nav.warehouse];
  const roads = networkLines().filter((r) => r.road !== "urban");

  const svg = (
    <svg width={W} height={P.height} viewBox={`0 0 ${W} ${P.height}`}>
      <defs>
        <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b2233" />
          <stop offset="1" stopColor="#071420" />
        </linearGradient>
        <linearGradient id="land" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#1b2733" />
          <stop offset="1" stopColor="#15202b" />
        </linearGradient>
      </defs>
      <rect width={W} height={P.height} fill="url(#sea)" />
      {[70, 40, 18].map((w, i) => (
        <path key={w} d={P.path(COAST)} fill="none" stroke="#2dd4bf" strokeOpacity={0.03 + i * 0.025} strokeWidth={w} strokeLinejoin="round" />
      ))}
      <path d={P.path(LAND, true)} fill="url(#land)" />
      <path d={P.path(COAST)} fill="none" stroke="#3d6680" strokeWidth={2.2} strokeLinejoin="round" />
      <path d={P.path(ADOUR)} fill="none" stroke="#0b2233" strokeWidth={6} strokeLinecap="round" />
      <path d={P.path(BIDASOA)} fill="none" stroke="#fbbf24" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="3 8" strokeLinecap="round" />
      {roads.map((r, i) => (
        <path key={i} d={P.path(r.path)} fill="none" stroke={r.road === "motorway" ? "#2e3a4a" : "#212b38"} strokeWidth={r.road === "motorway" ? 4 : 2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {LANES.map(([a, b]) => {
        const dp = arcPath(pt(a), pt(b), 0.2);
        return (
          <g key={a + b}>
            <path d={dp} fill="none" stroke="#2dd4bf" strokeOpacity={0.16} strokeWidth={12} strokeLinecap="round" />
            <path d={dp} fill="none" stroke="#2dd4bf" strokeOpacity={0.9} strokeWidth={3} strokeLinecap="round" strokeDasharray="12 9" />
          </g>
        );
      })}
      <path d={arcPath(pt("bayonne"), pt("irun"), -0.17)} fill="none" stroke="#a3e635" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="5 9" />
      {WAREHOUSES.map((w) => {
        const [x, y] = pt(w.place);
        return <rect key={w.id} x={x - 8} y={y - 8} width={16} height={16} rx={4} fill="#a78bfa" stroke="#0b1520" strokeWidth={3} />;
      })}
      {TRUCKS.map(([a, b, t]) => {
        const r = route(a, b);
        const [x, y] = P.p(along(r.path, r.cum, t).point);
        return (
          <g key={a + b}>
            <circle cx={x} cy={y} r={15} fill="#ff8a3d" fillOpacity={0.22} />
            <circle cx={x} cy={y} r={7} fill="#ff8a3d" stroke="#0b1520" strokeWidth={2.5} />
          </g>
        );
      })}
      {LABELS.map((l) => {
        const [x, y] = pt(l.id);
        return <circle key={l.id} cx={x} cy={y} r={6} fill="#e7edf4" stroke="#0b1520" strokeWidth={2.5} />;
      })}
    </svg>
  );

  const mapLeft = 1200 - W;
  const mapTop = Math.round((630 - P.height) / 2);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#071019",
          backgroundImage: "radial-gradient(circle at 12% 0%, rgba(45,212,191,0.20), transparent 46%), radial-gradient(circle at 100% 100%, rgba(167,139,250,0.16), transparent 42%)",
          fontFamily: "Manrope",
          color: "#e7edf4",
        }}
      >
        {/* the map, bleeding off the right edge */}
        <div style={{ position: "absolute", left: mapLeft, top: mapTop, display: "flex", width: W, height: P.height }}>
          {svg}
          {LABELS.map((l) => {
            const [x, y] = pt(l.id);
            return (
              <div key={l.id} style={{ position: "absolute", left: x + l.dx, top: y + l.dy, display: "flex", fontSize: 19, fontWeight: 600, color: "#e7edf4", textShadow: "0 1px 6px #071019" }}>
                {PLACES[l.id].names[lang]}
              </div>
            );
          })}
        </div>
        {/* fade the map into the text side */}
        <div style={{ position: "absolute", left: mapLeft - 2, top: 0, width: 170, height: 630, display: "flex", backgroundImage: "linear-gradient(90deg, #071019, rgba(7,16,25,0))" }} />

        {/* map-data credit, over the sea in the bottom-right corner */}
        <div style={{ position: "absolute", right: 22, bottom: 16, display: "flex", fontSize: 15, fontWeight: 600, color: "#8a97a8" }}>{d.landing.mapCredit}</div>

        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600, height: "100%", padding: "48px 0 44px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="58" height="58" viewBox="0 0 32 32">
              <rect width="32" height="32" rx="9" fill="#2dd4bf" />
              <path d="M9.5 10.5h13L9.5 21.5h13" fill="none" stroke="#032420" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="9.5" cy="10.5" r="2.6" fill="#ff8a3d" stroke="#032420" strokeWidth="1.2" />
              <circle cx="22.5" cy="21.5" r="2.6" fill="#a3e635" stroke="#032420" strokeWidth="1.2" />
            </svg>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>Zama</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "#7d8a9b", marginTop: 6 }}>{d.brand.tagline}</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                alignSelf: "flex-start",
                gap: 10,
                marginBottom: 22,
                padding: "7px 16px 7px 13px",
                borderRadius: 999,
                background: "rgba(255,138,61,0.14)",
                border: "1.5px solid rgba(255,138,61,0.55)",
                color: "#ffb07a",
                fontSize: 19,
                fontWeight: 800,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 10, background: "#ff8a3d" }} />
              {d.meta.badge}
            </div>
            <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.04, letterSpacing: -1.6, display: "flex", maxWidth: 510 }}>{title}</div>
            {/* narrower than the column, so it never runs under the San Sebastián label */}
            <div style={{ fontSize: hubs.length > 50 ? 19 : 21, fontWeight: 600, lineHeight: 1.3, color: "#a9b5c4", marginTop: 18, display: "flex", maxWidth: 470 }}>{hubs}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* kept clear of the map labels on the right (they overlapped in es and fr) */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxWidth: 440 }}>
              {chips.map((c, i) => (
                <div
                  key={c}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 18,
                    fontWeight: 600,
                    padding: "8px 14px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <div style={{ width: 9, height: 9, borderRadius: 9, background: ["#2dd4bf", "#a3e635", "#ff8a3d", "#a78bfa"][i] }} />
                  {c}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, fontFamily: "JetBrains Mono", fontSize: 16, color: "#7d8a9b", letterSpacing: 1 }}>
              {LOCALES.map((l) => (
                <span key={l} style={{ color: l === lang ? "#5eead4" : "#7d8a9b" }}>
                  {l.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Manrope", data: l800, weight: 800, style: "normal" },
        { name: "Manrope", data: l600, weight: 600, style: "normal" },
        { name: "Manrope", data: x800, weight: 800, style: "normal" },
        { name: "Manrope", data: x600, weight: 600, style: "normal" },
        { name: "Manrope", data: c800, weight: 800, style: "normal" },
        { name: "Manrope", data: c600, weight: 600, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 600, style: "normal" },
      ],
    },
  );
}
