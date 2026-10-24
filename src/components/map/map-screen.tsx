"use client";

import {
  Activity,
  ArrowRight,
  Building2,
  ChevronLeft,
  CloudSun,
  Crosshair,
  Layers,
  MoonStar,
  Mountain,
  Radio,
  Repeat,
  Route as RouteIcon,
  Sun,
  Sunrise,
  Sunset,
  Truck,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useIsDark } from "@/components/theme";
import { Button, Chip, EcoBadge, Progress, Sheet, Spinner, StatusChip, Switch } from "@/components/ui";
import { CARRIER, DRIVER, VEHICLE } from "@/data/companies";
import { route } from "@/data/network";
import type { ViewId } from "@/data/places";
import { driveMs, fitsReturn } from "@/data/seed";
import type { WarehouseId } from "@/data/types";
import { buildBins, occupancy, WAREHOUSE, WAREHOUSES } from "@/data/warehouses";
import { useI18n } from "@/i18n/client";
import type { SunPosition, TimePreset } from "@/lib/sun";
import { cn } from "@/lib/utils";
import { useMarket, type MapLayers } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";
import { Feed } from "@/components/feed";
import type { MapStatus, Selection } from "./corridor-map";

const CorridorMap = dynamic(() => import("./corridor-map"), { ssr: false });

const FILL = new Map(WAREHOUSES.map((w) => [w.id, occupancy(buildBins(w))]));
const TIMES: { id: TimePreset; icon: typeof Sun }[] = [
  { id: "live", icon: Radio },
  { id: "dawn", icon: Sunrise },
  { id: "morning", icon: CloudSun },
  { id: "noon", icon: Sun },
  { id: "golden", icon: Sunset },
  { id: "dusk", icon: Sunset },
  { id: "night", icon: MoonStar },
];
const VIEW_IDS: ViewId[] = ["corridor", "donostia", "pasaia", "border", "biarritz"];
const VIEW_KEY = { corridor: "viewCorridor", donostia: "viewDonostia", pasaia: "viewPasaia", border: "viewBorder", biarritz: "viewBiarritz" } as const;

export function MapScreen() {
  const { lang, d, f, place } = useI18n();
  const dark = useIsDark();
  const settings = useMarket((s) => s.settings);
  const loads = useMarket((s) => s.loads);
  const returns = useMarket((s) => s.returns);
  const [selection, setSelection] = useState<Selection>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [sun, setSun] = useState<SunPosition | null>(null);
  const [flyTo, setFlyTo] = useState<{ view: ViewId; n: number } | null>(null);
  const [focus, setFocus] = useState<{ loadId: string; n: number } | null>(null);
  const [sheet, setSheet] = useState<"none" | "settings" | "feed">("none");
  const [panel, setPanel] = useState(() => window.matchMedia("(min-width: 1280px)").matches);

  const kpi = useMemo(() => {
    // What the market has booked: every agreed price on a load that wasn't cancelled.
    const booked = loads.reduce((a, l) => a + (l.price && l.status !== "cancelled" ? l.price : 0), 0);
    const avgFill = [...FILL.values()].reduce((a, b) => a + b, 0) / FILL.size;
    return {
      onRoad: loads.filter((l) => l.status === "inTransit").length,
      open: loads.filter((l) => l.status === "open").length,
      returns: returns.filter((r) => r.status === "open").length,
      booked,
      fill: avgFill,
    };
  }, [loads, returns]);

  const tooltip = (sel: Selection): string | null => {
    if (!sel) return null;
    const s = useMarket.getState();
    if (sel.kind === "load") {
      const l = s.loads.find((x) => x.id === sel.id);
      if (!l) return null;
      const plate = l.vehicleId ? VEHICLE.get(l.vehicleId)?.plate : undefined;
      return `${l.id} · ${place(l.from)} → ${place(l.to)}${plate ? ` · ${plate}` : ` · ${f.money(l.price ?? l.target)}`}`;
    }
    if (sel.kind === "return") {
      const r = s.returns.find((x) => x.id === sel.id);
      return r ? `${CARRIER.get(r.carrierId)?.name} · ${place(r.from)} → ${place(r.to)} · −${Math.round(r.discount * 100)} %` : null;
    }
    const w = WAREHOUSE.get(sel.id as WarehouseId);
    return w ? `${w.name} · ${Math.round((FILL.get(w.id) ?? 0) * 100)} %` : null;
  };

  const select = (s: Selection) => setSelection(s);
  const focusLoad = (loadId: string) => {
    setSelection({ kind: "load", id: loadId });
    setFocus((p) => ({ loadId, n: (p?.n ?? 0) + 1 }));
    setSheet("none");
  };
  const fly = (view: ViewId) => {
    setFlyTo((p) => ({ view, n: (p?.n ?? 0) + 1 }));
    setSheet("none");
  };

  const kpis = [
    { icon: Truck, label: d.map.kpiOnRoad, value: String(kpi.onRoad), tone: "text-signal" },
    { icon: RouteIcon, label: d.map.kpiOpen, value: String(kpi.open), tone: "text-accent-text" },
    { icon: Repeat, label: d.map.kpiReturns, value: String(kpi.returns), tone: "text-lime" },
    { icon: Activity, label: d.map.kpiBooked, value: f.money(kpi.booked), tone: "text-ink" },
    { icon: WarehouseIcon, label: d.map.kpiFill, value: f.pct(kpi.fill), tone: "text-violet" },
  ];

  return (
    <div className="absolute inset-x-0 top-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] overflow-hidden bg-sea md:bottom-0">
      {status === "nowebgl" ? (
        <div className="grid h-full place-items-center p-6 text-center text-sm text-ink-2">{d.map.noWebgl}</div>
      ) : (
        <CorridorMap
          dark={dark}
          lang={lang}
          settings={settings}
          flyTo={flyTo}
          focus={focus}
          selection={selection}
          onSelect={select}
          onStatus={setStatus}
          onSun={setSun}
          tooltip={tooltip}
        />
      )}

      {status === "loading" ? <Spinner label={d.map.loadingMap} className="pointer-events-none absolute inset-0" /> : null}

      {/* KPIs */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-2 md:p-3 md:pr-[22rem] lg:pr-[24rem]">
        <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] md:flex-wrap md:overflow-visible">
          {kpis.map((k) => (
            <div key={k.label} className="glass flex shrink-0 items-center gap-2 rounded-xl border border-line px-2.5 py-1.5 shadow-card">
              <k.icon className={cn("size-4 shrink-0", k.tone)} aria-hidden />
              <div className="leading-tight">
                <div className={cn("tnum text-[0.95rem] font-extrabold", k.tone)}>{k.value}</div>
                <div className="text-[0.65rem] font-semibold whitespace-nowrap text-ink-3">{k.label}</div>
              </div>
            </div>
          ))}
        </div>
        {status === "fallback" ? (
          <div className="pointer-events-auto mt-1.5 inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn">
            <Layers className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{d.map.fallback}</span>
          </div>
        ) : null}
      </div>

      {/* Settings (desktop): open on wide screens, a button otherwise */}
      {panel ? (
        <aside className="glass absolute top-[5.4rem] left-3 hidden max-h-[calc(100%-11rem)] w-64 overflow-y-auto rounded-2xl border border-line p-2 shadow-card scrollbar-thin md:block">
          <button
            type="button"
            onClick={() => setPanel(false)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-[0.72rem] font-bold tracking-wide text-ink-3 uppercase transition hover:text-ink"
          >
            <Layers className="size-3.5" aria-hidden />
            <span className="flex-1 text-left">{d.map.panel}</span>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <MapSettings sun={sun} onFly={fly} />
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setPanel(true)}
          className="glass absolute top-[5.4rem] left-3 hidden h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink shadow-card md:inline-flex"
        >
          <Layers className="size-4" aria-hidden />
          {d.map.panel}
        </button>
      )}

      {/* Live feed (desktop) */}
      <aside className="glass absolute top-3 right-3 hidden max-h-[42%] w-[20rem] flex-col overflow-hidden rounded-2xl border border-line shadow-card md:flex lg:w-[22rem]">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-signal" />
          </span>
          <span className="text-[0.8rem] font-bold text-ink">{d.map.feed}</span>
        </div>
        <Feed onPick={focusLoad} />
      </aside>

      {/* Legend (desktop) */}
      <div className="glass absolute bottom-3 left-3 hidden rounded-xl border border-line px-3 py-2 shadow-card lg:block">
        <Legend />
      </div>

      {/* Phone buttons */}
      <div className="absolute top-[4.6rem] right-2 flex flex-col gap-2 md:hidden">
        <button type="button" onClick={() => setSheet("settings")} aria-label={d.map.panel} className="glass inline-flex size-11 items-center justify-center rounded-xl border border-line text-ink shadow-card">
          <Layers className="size-5" aria-hidden />
        </button>
        <button type="button" onClick={() => setSheet("feed")} aria-label={d.map.feed} className="glass relative inline-flex size-11 items-center justify-center rounded-xl border border-line text-ink shadow-card">
          <Radio className="size-5" aria-hidden />
          <span className="absolute top-2 right-2 size-2 rounded-full bg-signal" />
        </button>
      </div>

      {selection ? (
        <div className="absolute inset-x-2 bottom-2 z-10 md:inset-x-auto md:right-14 md:bottom-3 md:w-[23rem]">
          <SelectionCard sel={selection} onClose={() => setSelection(null)} onFocus={focusLoad} />
        </div>
      ) : (
        <p className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-[0.7rem] text-white backdrop-blur md:block lg:hidden xl:block">
          {d.map.hint}
        </p>
      )}

      <Sheet open={sheet === "settings"} onClose={() => setSheet("none")} title={d.map.panel}>
        <div className="p-3">
          <MapSettings sun={sun} onFly={fly} />
          <div className="mt-3 border-t border-line px-2 pt-3">
            <Legend />
          </div>
        </div>
      </Sheet>
      <Sheet open={sheet === "feed"} onClose={() => setSheet("none")} title={d.map.feed}>
        <Feed onPick={focusLoad} />
      </Sheet>
    </div>
  );
}

function MapSettings({ sun, onFly }: { sun: SunPosition | null; onFly: (v: ViewId) => void }) {
  const { d } = useI18n();
  const settings = useMarket((s) => s.settings);
  const setLayer = useMarket((s) => s.setLayer);
  const setTerrain = useMarket((s) => s.setTerrain);
  const setTime = useMarket((s) => s.setTime);
  const rows: { k: keyof MapLayers; label: string; icon: ReactNode }[] = [
    { k: "trucks", label: d.map.trucks, icon: <span className="size-2.5 rounded-full bg-signal" /> },
    { k: "lanes", label: d.map.lanes, icon: <span className="size-2.5 rounded-full bg-accent" /> },
    { k: "returns", label: d.map.returns, icon: <span className="size-2.5 rounded-full bg-lime" /> },
    { k: "warehouses", label: d.map.warehouses, icon: <span className="size-2.5 rounded-[3px] bg-violet" /> },
    { k: "network", label: d.map.network, icon: <span className="h-0.5 w-2.5 rounded bg-ink-3" /> },
    { k: "buildings", label: d.map.buildings, icon: <Building2 className="size-3.5 text-ink-3" aria-hidden /> },
  ];
  return (
    <div className="space-y-3">
      <div>
        <div className="px-2 pt-1 pb-1 text-[0.68rem] font-bold tracking-wide text-ink-3 uppercase">{d.map.layers}</div>
        {rows.map((r) => (
          <Switch key={r.k} checked={settings.layers[r.k]} onChange={(v) => setLayer(r.k, v)} label={r.label} icon={<span className="flex w-3.5 justify-center">{r.icon}</span>} />
        ))}
        <Switch checked={settings.terrain} onChange={setTerrain} label={d.map.terrain} icon={<Mountain className="size-3.5 text-ink-3" aria-hidden />} />
      </div>
      <div>
        <div className="px-2 pb-1.5 text-[0.68rem] font-bold tracking-wide text-ink-3 uppercase">{d.map.light}</div>
        <div className="grid grid-cols-4 gap-1 px-1">
          {TIMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTime(t.id)}
              aria-pressed={settings.time === t.id}
              title={d.time[t.id]}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border border-transparent px-1 py-1.5 text-[0.62rem] font-semibold text-ink-3 transition hover:bg-surface-2 hover:text-ink",
                settings.time === t.id && "border-line bg-surface text-ink shadow-sm",
              )}
            >
              <t.icon className={cn("size-4", t.id === "live" && settings.time === "live" && "text-signal")} aria-hidden />
              <span className="max-w-full truncate">{d.time[t.id]}</span>
            </button>
          ))}
        </div>
        {sun ? (
          <p className="tnum px-2 pt-1.5 text-[0.7rem] text-ink-3">
            {sun.altitude > 0 ? d.map.sun.replace("{{az}}", String(Math.round(sun.azimuth))).replace("{{alt}}", String(Math.round(sun.altitude))) : d.map.sunDown}
          </p>
        ) : null}
      </div>
      <div>
        <div className="px-2 pb-1.5 text-[0.68rem] font-bold tracking-wide text-ink-3 uppercase">{d.map.flyTo}</div>
        <div className="flex flex-wrap gap-1 px-1">
          {VIEW_IDS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onFly(v)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-[0.72rem] font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              {d.map[VIEW_KEY[v]]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const { d } = useI18n();
  const items = [
    { c: "bg-signal", l: d.map.legendTruck },
    { c: "bg-green", l: d.map.legendElectric },
    { c: "bg-accent", l: d.map.legendLoad },
    { c: "bg-blue", l: d.map.legendInstant },
    { c: "bg-lime", l: d.map.legendReturn },
    { c: "bg-violet rounded-[3px]", l: d.map.legendWarehouse },
  ];
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.7rem] font-medium text-ink-2 lg:grid-cols-3">
      {items.map((i) => (
        <li key={i.l} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={cn("size-2.5 shrink-0 rounded-full", i.c)} />
          {i.l}
        </li>
      ))}
    </ul>
  );
}

function SelectionCard({ sel, onClose, onFocus }: { sel: NonNullable<Selection>; onClose: () => void; onFocus: (id: string) => void }) {
  const { lang, d, f, place, n } = useI18n();
  const now = useSimNow();
  const loads = useMarket((s) => s.loads);
  const bids = useMarket((s) => s.bids);
  const returns = useMarket((s) => s.returns);

  let body: ReactNode = null;
  if (sel.kind === "load") {
    const l = loads.find((x) => x.id === sel.id);
    if (!l) return null;
    const r = route(l.from, l.to);
    const v = l.vehicleId ? VEHICLE.get(l.vehicleId) : undefined;
    const drv = v ? DRIVER.get(v.driverId) : undefined;
    const progress = l.status === "inTransit" && l.departedAt ? Math.min(1, (now - l.departedAt) / driveMs(l)) : null;
    const pending = bids.filter((b) => b.loadId === l.id && b.status === "pending").sort((a, b) => a.amount - b.amount);
    body = (
      <>
        <Header kicker={l.id} title={`${place(l.from)} → ${place(l.to)}`} chip={<StatusChip status={l.status} />} onClose={onClose} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>{f.km(r.km)}</span>
          <span>{f.minutes(r.minutes)}</span>
          <span>{d.goods[l.goods]}</span>
          <span>{d.common.palletsN.replace("{{n}}", String(l.pallets))}</span>
        </div>
        {progress !== null ? (
          <div className="mt-3">
            <Progress value={progress} />
            <div className="tnum mt-1 text-xs font-semibold text-signal">{d.map.progress.replace("{{pct}}", String(Math.round(progress * 100))).replace("{{eta}}", f.time((l.departedAt ?? now) + driveMs(l)))}</div>
          </div>
        ) : null}
        {v ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2 text-xs">
            <EcoBadge label={v.eco} />
            <span className="font-mono font-semibold text-ink">{v.plate}</span>
            <span className="truncate text-ink-3">
              {drv?.name} · {CARRIER.get(v.carrierId)?.name}
            </span>
          </div>
        ) : null}
        {l.status === "open" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Chip tone={l.mode === "instant" ? "blue" : "accent"}>{l.mode === "instant" ? d.loads.instant : n(d.map.bids, pending.length)}</Chip>
            <span className="text-ink-2">
              {d.common.instantPrice}: <b className="text-ink">{f.money(l.target)}</b>
            </span>
            {pending[0] ? <span className="text-ink-3">{d.map.best.replace("{{amount}}", f.money(pending[0].amount))}</span> : null}
            <span className="text-ink-3">· {d.loads.pickupAt.replace("{{t}}", f.rel(l.pickupAt, now))}</span>
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <Link href={`/${lang}/app/loads?id=${l.id}`} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover">
            {d.map.openBoard}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Button size="md" variant="secondary" onClick={() => onFocus(l.id)} aria-label="Focus" className="h-9">
            <Crosshair className="size-4" aria-hidden />
          </Button>
        </div>
      </>
    );
  } else if (sel.kind === "return") {
    const rt = returns.find((x) => x.id === sel.id);
    if (!rt) return null;
    const v = VEHICLE.get(rt.vehicleId);
    const fits = v ? loads.filter((l) => fitsReturn(l, rt, v.type)).length : 0;
    body = (
      <>
        <Header kicker={CARRIER.get(rt.carrierId)?.name ?? ""} title={`${place(rt.from)} → ${place(rt.to)}`} chip={<Chip tone="lime">{d.map.discount.replace("{{pct}}", String(Math.round(rt.discount * 100)))}</Chip>} onClose={onClose} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>{d.map.departs.replace("{{t}}", f.time(rt.departAt))}</span>
          <span>{n(d.map.freePallets, rt.freePallets)}</span>
          {v ? <span>{d.vehiclesShort[v.type]} · {v.plate}</span> : null}
        </div>
        <p className="mt-2 text-xs font-semibold text-lime">{fits ? n(d.fleet.fits, fits) : d.fleet.noFits}</p>
        <Link href={`/${lang}/app/fleet`} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-lime px-3 text-sm font-semibold text-[#0f1a02] transition hover:brightness-110">
          {d.nav.fleet}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </>
    );
  } else {
    const w = WAREHOUSE.get(sel.id as WarehouseId);
    if (!w) return null;
    const fill = FILL.get(w.id) ?? 0;
    body = (
      <>
        <Header kicker={place(w.place)} title={w.name} chip={<Chip tone="violet">{d.map.fill.replace("{{pct}}", String(Math.round(fill * 100)))}</Chip>} onClose={onClose} />
        <Progress value={fill} tone="violet" className="mt-3" />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
          <span>{d.wh.sqm.replace("{{n}}", f.num(w.sqm))}</span>
          <span>{d.map.doors.replace("{{n}}", String(w.doors))}</span>
          <span>{d.wh.robots.replace("{{n}}", String(w.amr))}</span>
          <span>{w.hours}</span>
        </div>
        <Link href={`/${lang}/app/warehouse?w=${w.id}`} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-violet px-3 text-sm font-semibold text-white transition hover:brightness-110">
          {d.map.openTwin}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </>
    );
  }
  return <div className="z-rise rounded-2xl border border-line bg-surface p-3.5 shadow-2xl">{body}</div>;
}

function Header({ kicker, title, chip, onClose }: { kicker: string; title: string; chip?: ReactNode; onClose: () => void }) {
  const { d } = useI18n();
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[0.7rem] font-semibold text-ink-3">{kicker}</div>
        <div className="truncate text-[0.95rem] font-bold text-ink">{title}</div>
      </div>
      {chip}
      <button type="button" onClick={onClose} aria-label={d.common.close} className="-mt-1 -mr-1 rounded-lg p-1.5 text-ink-3 transition hover:bg-surface-2 hover:text-ink">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
