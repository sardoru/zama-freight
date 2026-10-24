// Numbers, money, distances and times in the reader's language. Times are
// always shown on the corridor's clock (Europe/Madrid = Europe/Paris).
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { madridOffsetMinutes } from "./sun";

export const TZ = "Europe/Madrid";

export interface Fmt {
  money: (v: number) => string;
  money2: (v: number) => string;
  num: (v: number, digits?: number) => string;
  pct: (v: number) => string;
  km: (v: number) => string;
  meters: (v: number) => string;
  kg: (v: number) => string;
  minutes: (m: number) => string;
  time: (ts: number) => string;
  dayTime: (ts: number) => string;
  /** "in 25 min", "2 h ago"… relative to `now`. */
  rel: (ts: number, now: number) => string;
}

const cache = new Map<Locale, Fmt>();

const hasIntl = (tag: string) => Intl.DateTimeFormat.supportedLocalesOf([tag]).length > 0 && Intl.NumberFormat.supportedLocalesOf([tag]).length > 0;

/** Basque relative times, for browsers without Basque locale data. */
function euRel(min: number): string {
  const a = Math.abs(min);
  if (a < 1) return "orain";
  const [v, u] = a < 60 ? [Math.round(a), "min"] : a < 48 * 60 ? [Math.round(a / 60), "h"] : [Math.round(a / 1440), "egun"];
  return min > 0 ? `${v} ${u} barru` : `duela ${v} ${u}`;
}

export function makeFmt(lang: Locale): Fmt {
  const hit = cache.get(lang);
  if (hit) return hit;
  // Chromium ships no Basque locale data and would silently format eu-ES as US English;
  // Spanish conventions (24 h, decimal comma, € after the number) are the right fallback.
  const want = INTL_LOCALE[lang];
  const tag = hasIntl(want) ? want : "es-ES";
  const euFallback = lang === "eu" && tag !== want;
  const money = new Intl.NumberFormat(tag, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const money2 = new Intl.NumberFormat(tag, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nums = [0, 1, 2].map((d) => new Intl.NumberFormat(tag, { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const pct = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 });
  const unit = (u: string, d = 0) => new Intl.NumberFormat(tag, { style: "unit", unit: u, unitDisplay: "short", maximumFractionDigits: d });
  const km1 = unit("kilometer", 1);
  const m0 = unit("meter");
  const kg0 = unit("kilogram");
  const min0 = unit("minute");
  const h0 = unit("hour");
  const time = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const dayTime = new Intl.DateTimeFormat(
    tag,
    // No Spanish weekday names in the Basque fallback.
    euFallback ? { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ } : { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ },
  );
  const rel = new Intl.RelativeTimeFormat(tag, { numeric: "auto", style: "short" });
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

  const fmt: Fmt = {
    money: (v) => money.format(v),
    money2: (v) => money2.format(v),
    num: (v, d = 0) => nums[Math.min(2, Math.max(0, d))].format(v),
    pct: (v) => (euFallback ? `% ${nums[0].format(v * 100)}` : pct.format(v)),
    km: (v) => km1.format(v),
    meters: (v) => (v >= 1000 ? km1.format(v / 1000) : m0.format(v)),
    kg: (v) => kg0.format(v),
    minutes: (m) => {
      const r = Math.round(m);
      if (r < 60) return min0.format(r);
      const h = Math.floor(r / 60);
      const rest = r % 60;
      return rest ? `${h0.format(h)} ${min0.format(rest)}` : h0.format(h);
    },
    time: (ts) => time.format(ts),
    dayTime: (ts) => (dayKey.format(ts) === dayKey.format(Date.now()) ? time.format(ts) : dayTime.format(ts)),
    rel: (ts, now) => {
      const diff = (ts - now) / 60_000;
      if (euFallback) return euRel(diff);
      const a = Math.abs(diff);
      if (a < 1) return rel.format(0, "minute");
      if (a < 60) return rel.format(Math.round(diff), "minute");
      if (a < 48 * 60) return rel.format(Math.round(diff / 60), "hour");
      return rel.format(Math.round(diff / 1440), "day");
    },
  };
  cache.set(lang, fmt);
  return fmt;
}

const inputParts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** A timestamp as a <input type="datetime-local"> value on the corridor's clock. */
export function toMadridInput(ts: number): string {
  const parts = inputParts.formatToParts(ts);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** Reads a datetime-local value as Madrid wall-clock time. */
export function fromMadridInput(v: string): number {
  const [date, time = "00:00"] = v.split("T");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return guess - madridOffsetMinutes(new Date(guess)) * 60_000;
}
