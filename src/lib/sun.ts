// Where the sun is over the corridor, so the 3D buildings are lit the way they
// are outside right now (or at a chosen time of day). Low-precision solar
// position (Astronomical Almanac), good to well under a degree — plenty for
// shading. Same idea as the Memphis explorer's "real sun" (NOAA equations).

const rad = Math.PI / 180;

export interface SunPosition {
  /** Degrees clockwise from true north. */
  azimuth: number;
  /** Degrees above the horizon (negative below). */
  altitude: number;
}

export function solarPosition(date: Date, lat: number, lng: number): SunPosition {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = jd - 2_451_545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
  const ha = (gmst * 15 + lng) * rad - ra;
  const phi = lat * rad;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const azimuth = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { azimuth: (azimuth / rad + 360) % 360, altitude: altitude / rad };
}

/** Minutes east of UTC for Europe/Madrid at an instant (CET +60 / CEST +120). */
export function madridOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" }).formatToParts(at);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = tz.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
  if (!m) return 60;
  const h = Number(m[1]);
  return h * 60 + Math.sign(h) * Number(m[2] ?? 0);
}

/** The instant at a Madrid wall-clock time on the same Madrid day as `day`. */
export function atMadridTime(day: Date, hours: number, minutes = 0): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, mo, d] = fmt.format(day).split("-").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hours, minutes));
  return new Date(guess.getTime() - madridOffsetMinutes(guess) * 60_000);
}

export type TimePreset = "live" | "dawn" | "morning" | "noon" | "golden" | "dusk" | "night";

/**
 * Each preset is a sun altitude (°) on the rising or the setting side of the day, so "dawn"
 * is dawn in June and in December alike (fixed clock times drift by hours over the year).
 */
const PRESET_SUN: Record<Exclude<TimePreset, "live">, { alt: number; rising: boolean } | "transit"> = {
  dawn: { alt: 2, rising: true },
  morning: { alt: 22, rising: true },
  noon: "transit",
  golden: { alt: 7, rising: false },
  dusk: { alt: -2, rising: false },
  night: { alt: -14, rising: false },
};

/** The instant on `day`'s Madrid date when the sun over (lat, lng) is where `preset` puts it. */
export function presetInstant(day: Date, preset: Exclude<TimePreset, "live">, lat: number, lng: number): Date {
  const alt = (t: number) => solarPosition(new Date(t), lat, lng).altitude;
  const start = atMadridTime(day, 0).getTime();
  let noon = start;
  for (let t = start; t < start + 86_400_000; t += 300_000) if (alt(t) > alt(noon)) noon = t;
  const spec = PRESET_SUN[preset];
  if (spec === "transit") return new Date(noon);
  const target = Math.min(spec.alt, alt(noon) - 1); // a winter noon can be lower than "morning"
  // Bisect between solar midnight and noon (rising) or noon and the next solar midnight (setting).
  let lo = spec.rising ? noon - 43_200_000 : noon;
  let hi = spec.rising ? noon : noon + 43_200_000;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (spec.rising === alt(mid) > target) hi = mid;
    else lo = mid;
  }
  return new Date((lo + hi) / 2);
}

export interface Lighting {
  sun: SunPosition;
  /** MapLibre light position: [radial, azimuthal°, polar°]. */
  position: [number, number, number];
  color: string;
  intensity: number;
  sky: { sky: string; horizon: string; fog: string };
  /** 0 = full daylight … 1 = deep night. */
  night: number;
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hex = (c: number[]) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

/** Light colour, intensity and sky for a sun position, tuned per theme. */
export function lightingFor(sun: SunPosition, dark: boolean): Lighting {
  const alt = sun.altitude;
  const night = alt >= 6 ? 0 : alt <= -8 ? 1 : (6 - alt) / 14;
  const warm = alt > 30 ? 0 : alt < 2 ? 1 : (30 - alt) / 28; // golden-hour warmth
  const dayColor = mix([255, 252, 244], [255, 176, 112], warm);
  const color = hex(mix(dayColor, [150, 170, 220], night));
  const intensity = (dark ? 0.32 : 0.42) * (1 - night * 0.65) + 0.08;
  const polar = Math.min(88, Math.max(12, 90 - Math.max(alt, 4)));
  const daySky = dark ? [22, 46, 74] : [126, 180, 230];
  const goldSky = dark ? [64, 44, 70] : [244, 170, 120];
  const nightSky = dark ? [6, 10, 20] : [40, 52, 86];
  const skyC = mix(mix(daySky, goldSky, warm * 0.8), nightSky, night);
  const horizon = mix(skyC, dark ? [120, 90, 80] : [255, 228, 196], 0.45 * (1 - night));
  const fog = dark ? mix([12, 18, 26], [6, 9, 14], night) : mix([236, 238, 232], [70, 80, 104], night);
  return {
    sun,
    position: [1.5, sun.azimuth, polar],
    color,
    intensity,
    sky: { sky: hex(skyC), horizon: hex(horizon), fog: hex(fog) },
    night,
  };
}
