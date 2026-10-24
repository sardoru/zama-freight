"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { CARRIER, SHIPPER } from "@/data/companies";
import { PLACES, type PlaceId } from "@/data/places";
import { WAREHOUSE } from "@/data/warehouses";
import type { WarehouseId } from "@/data/types";
import { makeFmt, type Fmt } from "@/lib/format";
import { fill, plural } from "@/lib/utils";
import { INTL_LOCALE, type Locale } from "./config";
import type { Dict } from "./types";

interface I18n {
  lang: Locale;
  d: Dict;
  f: Fmt;
  /** A dictionary string by dotted path ("toast.posted"), filled with vars. */
  t: (path: string, vars?: Record<string, string | number>) => string;
  /** Turns ids in event vars into names (places, carriers, shippers, warehouses, money). */
  names: (vars: Record<string, string | number>) => Record<string, string | number>;
  place: (id: PlaceId) => string;
  /** A count string ("{{n}} bid|{{n}} bids") for n, in the reader's language. */
  n: (template: string, count: number) => string;
}

const Ctx = createContext<I18n | null>(null);

function lookup(d: Dict, path: string): string | undefined {
  let cur: unknown = d;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in cur) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

export function I18nProvider({ lang, dict, children }: { lang: Locale; dict: Dict; children: ReactNode }) {
  const value = useMemo<I18n>(() => {
    const f = makeFmt(lang);
    const place = (id: PlaceId) => PLACES[id]?.names[lang] ?? id;
    const names = (vars: Record<string, string | number>) => {
      const out: Record<string, string | number> = { ...vars };
      for (const k of ["from", "to"] as const) {
        const v = vars[k];
        if (typeof v === "string" && v in PLACES) out[k] = place(v as PlaceId);
      }
      if (typeof vars.carrier === "string") out.carrier = CARRIER.get(vars.carrier)?.name ?? vars.carrier;
      if (typeof vars.shipper === "string") out.shipper = SHIPPER.get(vars.shipper)?.name ?? vars.shipper;
      if (typeof vars.warehouse === "string") out.warehouse = WAREHOUSE.get(vars.warehouse as WarehouseId)?.name ?? vars.warehouse;
      if (typeof vars.amount === "number") out.amount = f.money(vars.amount);
      return out;
    };
    const t = (path: string, vars?: Record<string, string | number>) => {
      const s = lookup(dict, path) ?? path;
      return vars ? fill(s, names(vars)) : s;
    };
    const n = (template: string, count: number) => plural(template, count, INTL_LOCALE[lang], f.num(count));
    return { lang, d: dict, f, t, names, place, n };
  }, [lang, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside <I18nProvider>");
  return v;
}
