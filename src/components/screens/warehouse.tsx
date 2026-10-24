"use client";

import { ArrowRight, Ban, Bot, Boxes, CalendarClock, ClipboardCheck, Eye, Hand, Layers, LockOpen, MoveRight, RotateCcw, Search, Snowflake, Thermometer, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Fragment, useMemo, useRef, useState } from "react";
import { screenIntro } from "@/components/app/intro";
import { Page, PageHeader } from "@/components/app/shell";
import { useIsDark } from "@/components/theme";
import { Button, Card, Chip, Empty, Field, inputClass, SectionTitle, Segmented, Sheet, Spinner, Stat } from "@/components/ui";
import { CARRIER, CARRIERS, SHIPPER } from "@/data/companies";
import { dockStatus, driveMs, MIN } from "@/data/seed";
import type { Bin, BinStatus, DockAppt, Load, TempZone, WarehouseId, WarehouseKind } from "@/data/types";
import { applyBinPatch, buildBins, countAge, countDue, occupancy, SKU, slottingAdvice, travelMeters, WAREHOUSE, WAREHOUSES } from "@/data/warehouses";
import { useI18n } from "@/i18n/client";
import { fromMadridInput, toMadridInput } from "@/lib/format";
import { useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import { simNow, useMarket } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";
import { GLBoundary } from "@/components/map/gl-boundary";
import { webgl2 } from "@/components/map/webgl";
import type { ColorMode } from "@/components/warehouse/twin";
import { TwinMount } from "@/components/warehouse/twin-mount";

const Twin = dynamic(() => import("@/components/warehouse/twin"), { ssr: false, loading: () => <TwinLoading /> });

const KIND: Record<WarehouseKind, "kindCrossdock" | "kindDc" | "kindPort" | "kindCold" | "kindUrban" | "kindDepot"> = {
  crossdock: "kindCrossdock",
  dc: "kindDc",
  port: "kindPort",
  cold: "kindCold",
  urban: "kindUrban",
  depot: "kindDepot",
};
const ZONE: Record<TempZone, "zoneAmbient" | "zoneChilled" | "zoneFrozen" | "zoneBonded"> = { ambient: "zoneAmbient", chilled: "zoneChilled", frozen: "zoneFrozen", bonded: "zoneBonded" };
const BIN_ST: Record<BinStatus, "stEmpty" | "stStored" | "stReserved" | "stPicking" | "stBlocked" | "stQuarantine"> = {
  empty: "stEmpty",
  stored: "stStored",
  reserved: "stReserved",
  picking: "stPicking",
  blocked: "stBlocked",
  quarantine: "stQuarantine",
};
const DK_ST = { scheduled: "dkScheduled", arrived: "dkArrived", loading: "dkLoading", done: "dkDone", late: "dkLate" } as const;
const DK_TONE = { scheduled: "neutral", arrived: "blue", loading: "signal", done: "green", late: "warn" } as const;
const QUARTER = 15 * MIN;
/** Unloading, sorting, staging and loading again at a cross-dock. */
const HANDLE = 45 * MIN;

// Seeded once. What you change (picks, moves, counts, blocks) is laid over it from the saved patches.
const SEEDED = new Map(WAREHOUSES.map((x) => [x.id, buildBins(x)]));
const withPatches = (id: WarehouseId, patches: Record<string, Partial<Bin>>) => (SEEDED.get(id) ?? []).map((b) => applyBinPatch(b, patches[`${id}|${b.loc}`]));

/** Lower case without accents, so "sofa" finds "Sofá" and "mais" finds "Maïs". */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const held = (b: Bin) => b.status === "blocked" || b.status === "quarantine";

type Tab = "inventory" | "docks" | "slotting" | "crossdock";

function TwinLoading() {
  const { d } = useI18n();
  return <Spinner label={d.wh.loading3d} className="h-full" />;
}

export function WarehouseScreen() {
  const { d, f, place } = useI18n();
  const dark = useIsDark();
  const now = useSimNow();
  const wide = useMedia("(min-width: 1024px)");
  const patches = useMarket((s) => s.binPatches);
  const docks = useMarket((s) => s.docks);
  const loads = useMarket((s) => s.loads);
  const patchBin = useMarket((s) => s.patchBin);
  const toast = useMarket((s) => s.toast);
  // useSearchParams, not window.location: after a client-side navigation (the map's
  // "Open the twin") the browser URL is only updated after this first render.
  const params = useSearchParams();

  const [wid, setWid] = useState<WarehouseId>(() => {
    const q = params.get("w") as WarehouseId | null;
    return q && WAREHOUSE.has(q) ? q : "w-oiartzun";
  });
  const w = WAREHOUSE.get(wid)!;
  // three.js needs WebGL 2: the same cached probe as the map's (webgl2 hands its context straight back).
  const [webgl] = useState(webgl2);
  // The rest of the screen works without the 3D: no WebGL, or a renderer that can't start, puts the
  // stock list in the twin's place and opens the tabs below on the dock timeline.
  const [twinFailed, setTwinFailed] = useState(false);
  const twin3d = webgl && !twinFailed;
  const [mode, setMode] = useState<ColorMode>("status");
  const [explode, setExplode] = useState(0);
  const [showEmpty, setShowEmpty] = useState(false);
  const [showRobots, setShowRobots] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Bin | null>(null);
  const [resetKey, setResetKey] = useState(0);
  // The position to centre on, with a counter: asking for the same one again re-centres the camera.
  const [focus, setFocus] = useState<{ loc: string; n: number } | null>(null);
  const [tabChoice, setTab] = useState<Tab | null>(null);
  const tab: Tab = tabChoice ?? (twin3d ? "inventory" : "docks");
  const [onlyDue, setOnlyDue] = useState(false);
  const tabs = useRef<HTMLDivElement>(null);

  const bins = useMemo(() => withPatches(w.id, patches), [w.id, patches]);
  // The picker's fill bars, with your picks and moves in them like the Occupancy KPI.
  const fill = useMemo(() => new Map(WAREHOUSES.map((x) => [x.id, occupancy(withPatches(x.id, patches))])), [patches]);
  const wDocks = useMemo(() => docks.filter((a) => a.warehouseId === w.id), [docks, w.id]);
  // What is physically at the doors: an inbound truck still on the road isn't, whatever its slot says
  // (the Docks timeline shows its live ETA instead).
  const atDocks = useMemo(() => {
    const onRoad = new Set(loads.filter((l) => l.status === "inTransit").map((l) => l.id));
    return wDocks.filter((a) => !(a.direction === "in" && a.loadId && onRoad.has(a.loadId)));
  }, [wDocks, loads]);
  const advice = useMemo(() => slottingAdvice(bins, 8), [bins]);
  // FEFO: the earliest-expiring lot of each product that can be picked now, per zone
  // (stock in a bonded row isn't free to leave like the ambient rows next to it).
  const fefo = useMemo(() => {
    const first = new Map<string, Bin>();
    for (const b of bins) {
      if (!b.sku || b.expiryDays === undefined || (b.status !== "stored" && b.status !== "picking")) continue;
      const key = `${b.zone}|${b.sku}`;
      const cur = first.get(key);
      if (!cur || b.expiryDays < (cur.expiryDays ?? Infinity)) first.set(key, b);
    }
    return first;
  }, [bins]);
  const sel = selected ? bins.find((b) => b.loc === selected) : undefined;
  // Only for free stock: a reserved pallet is already allocated to an order, a held one can't go anywhere.
  const earlier = sel?.sku && (sel.status === "stored" || sel.status === "picking") ? fefo.get(`${sel.zone}|${sel.sku}`) : undefined;

  const stored = bins.filter((b) => b.status !== "empty");
  const kpi = {
    occupancy: occupancy(bins),
    stored: stored.length,
    a: stored.filter((b) => b.abc === "A").length,
    due: countDue(bins).length,
    expiring: stored.filter((b) => (b.expiryDays ?? 999) <= 30).length,
    busyDoors: new Set(atDocks.filter((a) => now >= a.start - 10 * MIN && now < a.end).map((a) => a.door)).size,
  };

  const choose = (id: WarehouseId) => {
    setWid(id);
    setSelected(null);
    setFocus(null);
    const url = new URL(window.location.href);
    url.searchParams.set("w", id);
    window.history.replaceState(window.history.state, "", url);
  };
  const show = (loc: string) => {
    setSelected(loc);
    setFocus((p) => ({ loc, n: (p?.n ?? 0) + 1 }));
  };
  const count = (loc: string) => {
    patchBin(w.id, loc, { countedDaysAgo: 0 });
    toast("toast.counted", { loc });
  };
  // The "Count due" tile opens the count worklist: the due positions listed, and coloured in the twin.
  const openCounts = () => {
    setTab("inventory");
    setOnlyDue(true);
    setMode("count");
    tabs.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const modes: { value: ColorMode; label: string }[] = [
    { value: "status", label: d.wh.modeStatus },
    { value: "abc", label: d.wh.modeAbc },
    { value: "fill", label: d.wh.modeFill },
    { value: "temp", label: d.wh.modeTemp },
    { value: "expiry", label: d.wh.modeExpiry },
    { value: "count", label: d.wh.modeCount },
  ];

  const binPanel = sel ? (
    <BinPanel
      bin={sel}
      move={advice.find((m) => m.from.loc === sel.loc)?.to.loc}
      fefo={earlier && earlier.loc !== sel.loc && (earlier.expiryDays ?? 0) < (sel.expiryDays ?? Infinity) ? earlier : undefined}
      onShow={show}
      onClose={() => setSelected(null)}
      onPick={() => {
        // Blocked and customs-held pallets stay where they are (the button is disabled too).
        if (held(sel)) return;
        const qty = (sel.qty ?? 1) - 1;
        patchBin(
          w.id,
          sel.loc,
          qty > 0 ? { qty, status: "picking" } : { status: "empty", qty: undefined, sku: undefined, lot: undefined, expiryDays: undefined, abc: undefined, picksPerDay: undefined, heldFrom: undefined },
        );
        toast("toast.picked", { loc: sel.loc });
      }}
      onCount={() => count(sel.loc)}
      onBlock={() => {
        const blocked = sel.status === "blocked";
        // Lifting a block gives the pallet back what it was: a customs hold stays held, a reservation reserved.
        patchBin(w.id, sel.loc, blocked ? { status: sel.heldFrom ?? "stored", heldFrom: undefined } : { status: "blocked", heldFrom: sel.status });
        toast(blocked ? "toast.released" : "toast.blocked", { loc: sel.loc }, blocked ? "ok" : "warn");
      }}
      onMove={(to) => {
        useMarket.getState().moveBin(w.id, sel.loc, to);
        setSelected(to);
      }}
    />
  ) : null;


  return (
    <Page className="max-w-none">
      {/* The same header the shell shows while the market starts (intro.ts). */}
      <PageHeader {...screenIntro("warehouse", d, place)} />
      {/* p-1 leaves room for the cards' focus ring inside the scroller; -mx-1 keeps them in line with the page. */}
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto p-1 scrollbar-thin">
        {WAREHOUSES.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => choose(x.id)}
            aria-pressed={x.id === w.id}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition",
              x.id === w.id ? "border-violet bg-violet-soft" : "border-line bg-surface hover:border-line-strong",
            )}
          >
            <span className="relative h-8 w-1.5 overflow-hidden rounded-full bg-surface-3">
              <span className="absolute inset-x-0 bottom-0 rounded-full bg-violet" style={{ height: `${Math.round((fill.get(x.id) ?? 0) * 100)}%` }} />
            </span>
            <span>
              <span className="block text-[0.82rem] font-bold whitespace-nowrap text-ink">{x.name}</span>
              <span className="block text-[0.7rem] whitespace-nowrap text-ink-3">
                {place(x.place)} · {f.pct(fill.get(x.id) ?? 0)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <Chip tone="violet">{d.wh[KIND[w.kind]]}</Chip>
        <Chip>{d.wh.operator.replace("{{name}}", w.operator)}</Chip>
        <Chip>{d.wh.sqm.replace("{{n}}", f.num(w.sqm))}</Chip>
        <Chip>{d.wh.doorsN.replace("{{n}}", String(w.doors))}</Chip>
        <Chip>{d.wh.positions.replace("{{n}}", f.num(w.rows * w.bays * w.levels))}</Chip>
        <Chip>{d.wh.robots.replace("{{n}}", String(w.amr))}</Chip>
        <Chip>{d.wh.hours.replace("{{h}}", w.hours)}</Chip>
        {[...new Set(w.rowZones)].map((z) => (
          <Chip key={z} tone={z === "frozen" || z === "chilled" ? "blue" : z === "bonded" ? "warn" : "neutral"}>
            {z === "frozen" ? <Snowflake className="size-3" aria-hidden /> : z === "chilled" ? <Thermometer className="size-3" aria-hidden /> : null}
            {d.wh[ZONE[z]]}
          </Chip>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label={d.wh.kpiOccupancy} value={f.pct(kpi.occupancy)} tone="violet" />
        <Stat label={d.wh.kpiStored} value={f.num(kpi.stored)} />
        <Stat label={d.wh.kpiA} value={f.num(kpi.a)} tone="green" />
        <button type="button" onClick={openCounts} className="group min-w-0 rounded-xl text-left">
          <Stat label={d.wh.kpiCount} value={f.num(kpi.due)} tone={kpi.due ? "warn" : "green"} className="h-full transition group-hover:border-ink-3" />
        </button>
        <Stat label={d.wh.kpiExpiring} value={f.num(kpi.expiring)} tone={kpi.expiring ? "danger" : "green"} />
        <Stat label={d.wh.kpiDocks} value={`${kpi.busyDoors}/${w.doors}`} tone="signal" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {twin3d ? (
          <Card className="relative h-[58dvh] min-h-[22rem] overflow-hidden lg:h-[64dvh]">
            <TwinMount label={d.wh.twinLabel.replace("{{name}}", w.name).replace("{{fill}}", f.pct(kpi.occupancy))}>
              <GLBoundary fallback={null} onError={() => setTwinFailed(true)}>
                <Twin
                  warehouse={w}
                  bins={bins}
                  docks={atDocks}
                  mode={mode}
                  explode={explode}
                  showEmpty={showEmpty}
                  showRobots={showRobots}
                  dark={dark}
                  selected={selected}
                  onSelect={setSelected}
                  onHover={setHover}
                  resetKey={resetKey}
                  focusLoc={focus?.loc ?? null}
                  focusKey={focus?.n ?? 0}
                  now={now}
                  fallback={<p>{d.wh.noWebgl}</p>}
                />
              </GLBoundary>
            </TwinMount>
            <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-2">
              <Segmented value={mode} onChange={setMode} options={modes} size="sm" label={d.wh.colorBy} className="glass pointer-events-auto shadow-card" />
              <div className="glass pointer-events-auto flex items-center gap-2 rounded-xl border border-line px-2.5 py-1 shadow-card pointer-coarse:py-0.5">
                <span className="text-[0.72rem] font-semibold text-ink-2">{d.wh.explode}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={explode}
                  onChange={(e) => setExplode(Number(e.target.value))}
                  className="h-6 w-24 accent-[var(--z-violet)] pointer-coarse:h-10"
                  aria-label={d.wh.explode}
                />
              </div>
              <div className="glass pointer-events-auto ml-auto flex items-center gap-1 rounded-xl border border-line p-0.5 shadow-card">
                <IconToggle on={showEmpty} onClick={() => setShowEmpty((v) => !v)} label={d.wh.showEmpty} icon={<Eye className="size-4" aria-hidden />} />
                <IconToggle on={showRobots} onClick={() => setShowRobots((v) => !v)} label={d.wh.showRobots} icon={<Bot className="size-4" aria-hidden />} />
                <IconToggle on={false} onClick={() => setResetKey((k) => k + 1)} label={d.wh.resetView} icon={<RotateCcw className="size-4" aria-hidden />} />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-2">
              <Legend mode={mode} dark={dark} />
              <div className="glass max-w-full truncate rounded-lg border border-line px-2.5 py-1 text-[0.72rem] text-ink-2">
                {hover ? (
                  <>
                    <span className="font-mono font-semibold text-ink">{hover.loc}</span>
                    {hover.sku ? ` · ${SKU.get(hover.sku)?.name}` : ` · ${d.wh.binEmpty}`}
                  </>
                ) : wide ? (
                  d.wh.hint
                ) : (
                  d.wh.hintShort
                )}
              </div>
            </div>
          </Card>
        ) : (
          <div className="min-w-0 space-y-2">
            <p role="status" className="flex items-start gap-2 rounded-xl border border-line bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
              <Layers className="mt-0.5 size-4 shrink-0" aria-hidden />
              {twinFailed ? d.wh.crashed : d.wh.noWebgl}
            </p>
            <Inventory bins={bins} onlyDue={onlyDue} onOnlyDue={setOnlyDue} onPick={show} onCount={count} />
          </div>
        )}
        {wide ? <aside className="self-start">{binPanel ?? <Empty className="h-full">{d.wh.hint}</Empty>}</aside> : null}
      </div>
      {!wide ? (
        <Sheet open={!!sel} onClose={() => setSelected(null)} title={sel ? d.wh.binTitle.replace("{{loc}}", sel.loc) : ""}>
          <div className="p-3">{binPanel}</div>
        </Sheet>
      ) : null}

      <div ref={tabs} className="mt-5 scroll-mt-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "inventory", label: d.wh.tabInventory },
            { value: "docks", label: d.wh.tabDocks },
            { value: "slotting", label: `${d.wh.tabSlotting} · ${advice.length}` },
            { value: "crossdock", label: d.wh.tabCrossdock },
          ]}
        />
        <div className="mt-3">
          {tab === "inventory" ? (
            <Inventory bins={bins} onlyDue={onlyDue} onOnlyDue={setOnlyDue} onPick={show} onCount={count} />
          ) : tab === "docks" ? (
            // Keyed: a door number from a bigger warehouse must not carry over to a smaller one.
            <Docks key={w.id} warehouseId={w.id} doors={w.doors} appts={wDocks} now={now} />
          ) : tab === "slotting" ? (
            <Slotting
              advice={advice}
              onApply={(from, to) => {
                useMarket.getState().moveBin(w.id, from, to);
                setSelected(to);
              }}
              onShow={show}
            />
          ) : (
            <CrossDock place={w.place} now={now} />
          )}
        </div>
      </div>
    </Page>
  );
}

function IconToggle({ on, onClick, label, icon }: { on: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition hover:text-ink pointer-coarse:size-10",
        on && "bg-surface text-violet shadow-sm ring-1 ring-line",
      )}
    >
      {icon}
    </button>
  );
}

// The swatches repeat the twin's colours (twin.tsx), which isn't imported here so three.js stays out of this chunk.
function Legend({ mode, dark }: { mode: ColorMode; dark: boolean }) {
  const { d, f } = useI18n();
  const days = (v: number) => d.wh.days.replace("{{n}}", f.num(v));
  const items: { c: string; l: string }[] =
    mode === "status"
      ? [
          { c: "#b08a5c", l: d.wh.stStored },
          { c: "var(--z-violet)", l: d.wh.stReserved },
          { c: "var(--z-signal)", l: d.wh.stPicking },
          { c: "var(--z-danger)", l: d.wh.stBlocked },
          { c: "var(--z-warn)", l: d.wh.stQuarantine },
        ]
      : mode === "abc"
        ? [
            { c: "var(--z-green)", l: "A" },
            { c: "var(--z-blue)", l: "B" },
            { c: "#7c8a9c", l: "C" },
          ]
        : mode === "expiry"
          ? [
              { c: "#ef4444", l: `≤ ${days(30)}` },
              { c: "#f59e0b", l: `≤ ${days(90)}` },
              { c: "#22c55e", l: `> ${days(90)}` },
              { c: dark ? "#475569" : "#b6bfcb", l: d.wh.noExpiry },
            ]
          : mode === "count"
            ? [
                { c: "#ef4444", l: d.wh.countDue },
                { c: "#f59e0b", l: d.wh.countSoon },
                { c: dark ? "#334155" : "#cbd5e1", l: d.wh.countOk },
              ]
            : [];
  return (
    <div className="glass flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-2.5 py-1.5 text-[0.7rem] font-medium text-ink-2">
      {mode === "temp" || mode === "fill" ? (
        <span className="flex items-center gap-2">
          {mode === "temp" ? d.wh.cold : f.pct(0)}
          <span className={cn("h-2 w-24 rounded-full", mode === "temp" ? "bg-[linear-gradient(90deg,#3b82f6,#22d3ee,#a3e635,#fb923c,#ef4444)]" : "bg-[linear-gradient(90deg,var(--z-accent-soft),var(--z-accent))]")} />
          {mode === "temp" ? d.wh.warm : f.pct(1)}
        </span>
      ) : (
        items.map((i) => (
          <span key={i.l} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] ring-1 ring-ink/10" style={{ background: i.c }} />
            {i.l}
          </span>
        ))
      )}
    </div>
  );
}

function BinPanel({
  bin: b,
  move,
  fefo,
  onShow,
  onClose,
  onPick,
  onCount,
  onBlock,
  onMove,
}: {
  bin: Bin;
  move?: string;
  /** A position holding the same product with an earlier expiry, to pick first. */
  fefo?: Bin;
  onShow: (loc: string) => void;
  onClose: () => void;
  onPick: () => void;
  onCount: () => void;
  onBlock: () => void;
  onMove: (to: string) => void;
}) {
  const { d, f, n } = useI18n();
  const sku = b.sku ? SKU.get(b.sku) : undefined;
  const isHeld = held(b);
  // "19 cartons", in the reader's language (units are codes in the data).
  const unit = (q: number) => (sku ? n((d.units as Record<string, string>)[sku.unit] ?? `{{n}} ${sku.unit}`, q) : "");
  const rows: [string, string][] = sku
    ? [
        [d.wh.owner, SHIPPER.get(sku.ownerId)?.name ?? ""],
        [d.wh.qty, `${unit(b.qty ?? 0)} / ${f.num(sku.perPallet)}`],
        [d.wh.lot, b.lot ?? "–"],
        [d.wh.expiry, b.expiryDays !== undefined ? n(d.wh.expiryIn, b.expiryDays) : "–"],
        [d.wh.abc, `${b.abc ?? "–"} · ${n(d.wh.picks, b.picksPerDay ?? 0)}`],
        [d.wh.counted, b.countedDaysAgo ? n(d.wh.countedAgo, b.countedDaysAgo) : d.wh.countedToday],
      ]
    : [[d.wh.counted, b.countedDaysAgo ? n(d.wh.countedAgo, b.countedDaysAgo) : d.wh.countedToday]];
  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs font-semibold text-ink-3">{d.wh.binTitle.replace("{{loc}}", b.loc)}</div>
          <div className="mt-0.5 text-[0.95rem] leading-snug font-bold text-ink">{sku?.name ?? d.wh.binEmpty}</div>
        </div>
        <button type="button" onClick={onClose} aria-label={d.common.close} className="hidden rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink lg:block">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip tone={b.status === "blocked" ? "danger" : b.status === "quarantine" ? "warn" : b.status === "picking" ? "signal" : b.status === "reserved" ? "violet" : "neutral"}>{d.wh[BIN_ST[b.status]]}</Chip>
        <Chip tone={b.zone === "frozen" || b.zone === "chilled" ? "blue" : b.zone === "bonded" ? "warn" : "neutral"}>{d.wh[ZONE[b.zone]]}</Chip>
        {b.tempC !== undefined ? <Chip>{`${f.num(b.tempC, 1)} °C`}</Chip> : null}
        <Chip>{d.wh.walk.replace("{{m}}", f.num(travelMeters(b)))}</Chip>
      </div>
      <dl className="mt-3 space-y-1.5 text-[0.8rem]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-ink-3">{k}</dt>
            <dd className="truncate text-right font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {fefo ? (
        <button
          type="button"
          onClick={() => onShow(fefo.loc)}
          className="mt-3 w-full rounded-lg border border-warn/40 bg-warn-soft px-2.5 py-1.5 text-left text-xs font-semibold text-warn transition hover:border-warn pointer-coarse:py-2.5"
        >
          {d.wh.fefoFirst.replace("{{loc}}", fefo.loc)} · {n(d.wh.expiryIn, fefo.expiryDays ?? 0)}
        </button>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {sku ? (
          <Button size="sm" variant="secondary" onClick={onPick} disabled={isHeld} title={isHeld ? d.wh[BIN_ST[b.status]] : undefined}>
            <Hand className="size-3.5" aria-hidden />
            {d.wh.pick.replace("{{unit}}", unit(1))}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onCount}>
          <ClipboardCheck className="size-3.5" aria-hidden />
          {d.wh.count}
        </Button>
        {sku ? (
          <Button size="sm" variant={b.status === "blocked" ? "secondary" : "danger"} onClick={onBlock}>
            {b.status === "blocked" ? <LockOpen className="size-3.5" aria-hidden /> : <Ban className="size-3.5" aria-hidden />}
            {b.status === "blocked" ? d.wh.release : d.wh.block}
          </Button>
        ) : null}
        {move ? (
          <Button size="sm" variant="primary" onClick={() => onMove(move)} className="col-span-2">
            <MoveRight className="size-3.5" aria-hidden />
            {d.wh.moveTo.replace("{{loc}}", move)}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function Inventory({
  bins,
  onlyDue,
  onOnlyDue,
  onPick,
  onCount,
}: {
  bins: Bin[];
  /** The cycle-count worklist: only positions due for a count, most overdue first. */
  onlyDue: boolean;
  onOnlyDue: (v: boolean) => void;
  onPick: (loc: string) => void;
  onCount: (loc: string) => void;
}) {
  const { d, f, n } = useI18n();
  const [q, setQ] = useState("");
  const due = useMemo(() => countDue(bins).sort((a, b) => countAge(b) - countAge(a)), [bins]);
  // Position, lot, product and owner (the 3PL's client), folded once per change of the bins.
  const hay = useMemo(
    () =>
      new Map(
        bins.map((b) => {
          const sku = b.sku ? SKU.get(b.sku) : undefined;
          return [b.loc, fold([b.loc, b.lot ?? "", sku?.name ?? "", sku ? (SHIPPER.get(sku.ownerId)?.name ?? "") : ""].join("\n"))];
        }),
      ),
    [bins],
  );
  const all = onlyDue ? due : bins.filter((b) => b.status !== "empty");
  const needle = fold(q.trim());
  const rows = needle ? all.filter((b) => hay.get(b.loc)?.includes(needle)) : all;
  const shown = rows.slice(0, 80);
  const cols = onlyDue ? 9 : 7;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <label className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={d.wh.invSearch} className={cn(inputClass, "pl-9")} aria-label={d.common.search} />
        </label>
        <button
          type="button"
          aria-pressed={onlyDue}
          onClick={() => onOnlyDue(!onlyDue)}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[0.8rem] font-semibold transition",
            onlyDue ? "border-warn/50 bg-warn-soft text-warn" : "border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink",
          )}
        >
          <ClipboardCheck className="size-4" aria-hidden />
          {d.wh.onlyDue}
          <span className="tnum rounded-md bg-surface-2 px-1.5 text-[0.72rem] text-ink-2">{f.num(due.length)}</span>
        </button>
        <span className="text-xs text-ink-3">{d.wh.showing.replace("{{n}}", String(shown.length)).replace("{{total}}", String(rows.length))}</span>
      </div>
      <div className="max-h-[26rem] overflow-auto scrollbar-thin">
        <table className={cn("w-full text-left text-[0.8rem]", onlyDue ? "min-w-[50rem]" : "min-w-[40rem]")}>
          <thead className="sticky top-0 z-10 bg-surface-2 text-[0.7rem] font-bold tracking-wide text-ink-3 uppercase">
            <tr>
              <th className="px-3 py-2">{d.wh.colLoc}</th>
              <th className="px-3 py-2">{d.wh.colProduct}</th>
              <th className="px-3 py-2 text-right">{d.wh.colQty}</th>
              <th className="px-3 py-2">{d.wh.colLot}</th>
              <th className="px-3 py-2 text-right">{d.wh.colExpiry}</th>
              <th className="px-3 py-2">{d.wh.colAbc}</th>
              <th className="px-3 py-2">{d.wh.colStatus}</th>
              {onlyDue ? (
                <>
                  <th className="px-3 py-2">{d.wh.counted}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{d.wh.count}</span>
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((b) => {
              const sku = b.sku ? SKU.get(b.sku) : undefined;
              return (
                <tr key={b.loc} onClick={() => onPick(b.loc)} className="cursor-pointer transition hover:bg-surface-2">
                  <td className="px-3 py-2">
                    {/* A real button, so keyboard and screen-reader users can open the position too. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(b.loc);
                      }}
                      className="rounded font-mono font-semibold text-ink hover:underline"
                    >
                      {b.loc}
                    </button>
                  </td>
                  <td className="max-w-[18rem] truncate px-3 py-2 text-ink-2">{sku?.name}</td>
                  <td className="tnum px-3 py-2 text-right text-ink">{f.num(b.qty ?? 0)}</td>
                  <td className="px-3 py-2 font-mono text-ink-3">{b.lot}</td>
                  <td className={cn("tnum px-3 py-2 text-right whitespace-nowrap", (b.expiryDays ?? 999) <= 30 ? "font-bold text-danger" : "text-ink-3")}>
                    {b.expiryDays !== undefined ? d.wh.days.replace("{{n}}", f.num(b.expiryDays)) : "–"}
                  </td>
                  <td className="px-3 py-2 font-bold text-ink-2">{b.abc}</td>
                  <td className="px-3 py-2 text-ink-3">{d.wh[BIN_ST[b.status]]}</td>
                  {onlyDue ? (
                    <>
                      <td className="px-3 py-2 whitespace-nowrap text-warn">{n(d.wh.countedAgo, b.countedDaysAgo ?? 0)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`${d.wh.count} · ${b.loc}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCount(b.loc);
                          }}
                        >
                          <ClipboardCheck className="size-3.5" aria-hidden />
                          {d.wh.count}
                        </Button>
                      </td>
                    </>
                  ) : null}
                </tr>
              );
            })}
            {!shown.length ? (
              <tr>
                <td colSpan={cols} className="px-3 py-8 text-center text-ink-3">
                  {d.common.nothing}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** +12 / −5 / 0: minutes ahead of or behind the booked slot. */
const signed = (f: { num: (v: number) => string }, m: number) => (m > 0 ? `+${f.num(m)}` : m < 0 ? `−${f.num(-m)}` : f.num(0));

function Docks({ warehouseId, doors, appts, now }: { warehouseId: WarehouseId; doors: number; appts: DockAppt[]; now: number }) {
  const { d, f } = useI18n();
  const bookDock = useMarket((s) => s.bookDock);
  const loads = useMarket((s) => s.loads);
  const from = Math.floor((now - 2 * 60 * MIN) / (60 * MIN)) * 60 * MIN;
  const to = from + 14 * 60 * MIN;
  const span = to - from;
  const pct = (t: number) => `${((Math.min(to, Math.max(from, t)) - from) / span) * 100}%`;
  const hours = Array.from({ length: 15 }, (_, i) => from + i * 60 * MIN);
  const [open, setOpen] = useState<string | null>(null);

  const [door, setDoor] = useState(0);
  const [at, setAt] = useState(() => toMadridInput(Math.ceil((simNow(useMarket.getState().clock) + 60 * MIN) / QUARTER) * QUARTER));
  const [dur, setDur] = useState(45);
  const [dir, setDir] = useState<"in" | "out">("in");
  const [carrierId, setCarrierId] = useState("c-txingudi");
  const [pallets, setPallets] = useState(20);
  const start = fromMadridInput(at);
  const end = start + dur * MIN;
  // Is the door taken around [s, e)? Trucks get 10 minutes between them.
  const busyAt = (list: Pick<DockAppt, "door" | "start" | "end">[], s: number, e: number) => list.some((a) => a.door === door && a.start < e + 10 * MIN && s < a.end + 10 * MIN);
  const past = start < now;
  const clash = !past && busyAt(appts, start, end);

  // An appointment as the timeline shows it. An inbound truck that is on the road has a live
  // ETA from the market: until it arrives the slot can't be under way, and it's late if the truck will be.
  const view = (a: DockAppt) => {
    const l: Load | undefined = a.direction === "in" && a.loadId ? loads.find((x) => x.id === a.loadId) : undefined;
    const eta = l?.status === "inTransit" && l.departedAt ? l.departedAt + driveMs(l) : undefined;
    const slip = eta === undefined ? 0 : Math.round((eta - a.start) / MIN);
    const st = eta === undefined ? dockStatus(a, now) : slip > 15 ? "late" : "scheduled";
    const carrier = CARRIER.get(a.carrierId)?.name ?? "";
    const live = eta === undefined ? "" : d.wh.etaLive.replace("{{t}}", f.time(eta)).replace("{{slip}}", signed(f, slip));
    const when = `${f.time(a.start)}–${f.time(a.end)}`;
    const what = [d.wh.door.replace("{{n}}", String(a.door + 1)), a.direction === "in" ? d.wh.inbound : d.wh.outbound, when, d.common.palletsN.replace("{{n}}", String(a.pallets))].join(" · ");
    return { eta, slip, st, carrier, live, what, label: [carrier, what, d.wh[DK_ST[st]], live].filter(Boolean).join(" · ") };
  };
  const openAppt = open ? appts.find((a) => a.id === open) : undefined;
  const ov = openAppt ? view(openAppt) : undefined;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <CalendarClock className="size-4 text-violet" aria-hidden />
          <span className="text-sm font-bold text-ink">{d.wh.docksTitle}</span>
          <span className="ml-auto flex items-center gap-3 text-[0.7rem] text-ink-3">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-blue" />
              {d.wh.inbound}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-violet" />
              {d.wh.outbound}
            </span>
          </span>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <div className="min-w-[46rem] p-3">
            <div className="relative ml-16 h-5 text-[0.65rem] text-ink-3">
              {hours.map((h) => (
                <span key={h} className="tnum absolute -translate-x-1/2" style={{ left: pct(h) }}>
                  {f.time(h)}
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              {Array.from({ length: doors }, (_, i) => (
                <div key={i} className="flex items-center">
                  {/* Sticky: after a swipe along the day the rows keep their door numbers. */}
                  <span className="sticky left-0 z-20 flex w-16 shrink-0 items-center self-stretch bg-surface pr-2 text-[0.72rem] font-semibold text-ink-2">{d.wh.door.replace("{{n}}", String(i + 1))}</span>
                  <div className="relative h-8 flex-1 rounded-lg bg-surface-2 pointer-coarse:h-10">
                    <span className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-signal" style={{ left: pct(now) }} />
                    {appts
                      .filter((a) => a.door === i && a.end > from && a.start < to)
                      .map((a) => {
                        const v = view(a);
                        return (
                          <Fragment key={a.id}>
                            <button
                              type="button"
                              aria-label={v.label}
                              title={v.label}
                              aria-expanded={open === a.id}
                              onClick={() => setOpen((o) => (o === a.id ? null : a.id))}
                              className={cn(
                                // Dark text in the dark theme: the blue and violet tokens are pastel there.
                                "absolute inset-y-1 flex items-center overflow-hidden rounded-md px-1.5 text-left text-[0.62rem] font-semibold whitespace-nowrap text-white focus-visible:outline-ink dark:text-[#0b1118]",
                                a.direction === "in" ? "bg-blue" : "bg-violet",
                                v.st === "done" && "opacity-35",
                                v.st === "late" && "ring-2 ring-warn",
                                v.st === "loading" && "ring-2 ring-signal",
                                a.mine && "outline-2 outline-offset-1 outline-accent",
                                open === a.id && "ring-2 ring-ink",
                              )}
                              style={{ left: pct(a.start), width: `calc(${pct(a.end)} - ${pct(a.start)})` }}
                            >
                              {v.carrier.split(" ")[0]}
                            </button>
                            {/* Where the truck on the road will really arrive, when it's off its slot. */}
                            {v.eta !== undefined && Math.abs(v.slip) > 5 ? (
                              <span aria-hidden className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-warn" style={{ left: pct(v.eta) }} />
                            ) : null}
                          </Fragment>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
            <div className="relative mt-1 ml-16 h-3">
              <span className="absolute top-0 -translate-x-1/2 rounded bg-signal px-1 text-[0.6rem] font-bold whitespace-nowrap text-white dark:text-[#0b1118]" style={{ left: pct(now) }}>
                {d.wh.now} {f.time(now)}
              </span>
            </div>
          </div>
        </div>
        {/* Tapping a slot shows what the hover tooltip says, for touch, keyboard and screen readers. */}
        {openAppt && ov ? (
          <div className="flex items-start gap-3 border-t border-line px-3 py-2.5 text-[0.8rem]">
            <span className={cn("mt-1 size-2.5 shrink-0 rounded-sm", openAppt.direction === "in" ? "bg-blue" : "bg-violet")} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink">{ov.carrier}</div>
              <div className="text-ink-2">{ov.what}</div>
              {ov.live ? <div className={cn("font-semibold", ov.slip > 15 ? "text-warn" : "text-ink-2")}>{ov.live}</div> : null}
            </div>
            <Chip tone={DK_TONE[ov.st]}>{d.wh[DK_ST[ov.st]]}</Chip>
            <button type="button" onClick={() => setOpen(null)} aria-label={d.common.close} className="-my-1.5 -mr-1.5 rounded-lg p-2 text-ink-3 transition hover:bg-surface-2 hover:text-ink pointer-coarse:p-3">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </Card>
      <Card className="p-4">
        <div className="text-sm font-bold text-ink">{d.wh.bookTitle}</div>
        <p className="mt-1 text-xs text-ink-3">{d.wh.bookLead}</p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (past || clash) return;
            bookDock({ warehouseId, door, start, end, direction: dir, carrierId, pallets });
            // Ready for the next truck: the first free quarter at this door after the slot just booked
            // (which isn't in appts until the store's update comes back).
            const taken = [...appts, { door, start, end }];
            let next = end + QUARTER;
            for (let i = 0; i < 96 && busyAt(taken, next, next + dur * MIN); i++) next += QUARTER;
            setAt(toMadridInput(next));
          }}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={d.wh.doorField}>
              <select value={door} onChange={(e) => setDoor(Number(e.target.value))} className={inputClass}>
                {Array.from({ length: doors }, (_, i) => (
                  <option key={i} value={i}>
                    {d.wh.door.replace("{{n}}", String(i + 1))}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={d.wh.direction}>
              <select value={dir} onChange={(e) => setDir(e.target.value as "in" | "out")} className={inputClass}>
                <option value="in">{d.wh.inbound}</option>
                <option value="out">{d.wh.outbound}</option>
              </select>
            </Field>
            {/* A full row: a date and a time don't fit in half of this card. */}
            <Field label={d.wh.arrival} className="col-span-2">
              <input
                type="datetime-local"
                min={toMadridInput(Math.ceil(now / QUARTER) * QUARTER)}
                step={QUARTER / 1000}
                value={at}
                onChange={(e) => e.target.value && setAt(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label={d.wh.duration}>
              <select value={dur} onChange={(e) => setDur(Number(e.target.value))} className={inputClass}>
                {[30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {f.minutes(m)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={d.common.carrier}>
              <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className={inputClass}>
                {CARRIERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={d.common.pallets}>
              <input type="number" min={1} max={33} value={pallets} onChange={(e) => setPallets(Math.max(1, Math.min(33, Number(e.target.value) || 1)))} className={cn(inputClass, "tnum")} />
            </Field>
          </div>
          {past ? (
            <p className="text-xs font-semibold text-danger">{d.wh.inPast}</p>
          ) : clash ? (
            <p className="text-xs font-semibold text-danger">{d.wh.conflict.replace("{{n}}", String(door + 1))}</p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={clash || past}>
            {d.wh.bookSubmit}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Slotting({ advice, onApply, onShow }: { advice: ReturnType<typeof slottingAdvice>; onApply: (from: string, to: string) => void; onShow: (loc: string) => void }) {
  const { d, f, n } = useI18n();
  const total = advice.reduce((a, m) => a + m.savedMetersPerDay, 0);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <Boxes className="size-4 text-violet" aria-hidden />
            {d.wh.slotTitle}
          </div>
          <p className="mt-1 max-w-2xl text-xs text-ink-3">{d.wh.slotLead}</p>
        </div>
        {advice.length ? <Chip tone="green">{d.wh.slotTotal.replace("{{km}}", f.num(total / 1000, 1))}</Chip> : null}
      </div>
      {advice.length ? (
        <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {advice.map((m) => (
            <li key={m.from.loc} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <button type="button" onClick={() => onShow(m.from.loc)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[0.82rem] font-semibold text-ink">{m.from.sku ? SKU.get(m.from.sku)?.name : ""}</div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[0.75rem] text-ink-3">
                  {m.from.loc} <ArrowRight className="size-3" aria-hidden /> <span className="font-semibold text-green">{m.to.loc}</span>
                  <span className="font-sans">· {n(d.wh.picks, m.from.picksPerDay ?? 0)}</span>
                </div>
                <div className="mt-0.5 text-[0.72rem] font-semibold text-green">{d.wh.slotSaving.replace("{{m}}", f.num(m.savedMetersPerDay))}</div>
              </button>
              <Button size="sm" variant="primary" onClick={() => onApply(m.from.loc, m.to.loc)}>
                {d.wh.slotApply}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="mt-3">{d.wh.slotNone}</Empty>
      )}
    </Card>
  );
}

function CrossDock({ place: here, now }: { place: string; now: number }) {
  const { d, f, place } = useI18n();
  const loads = useMarket((s) => s.loads);
  // When the freight is (or will be) on the dock here.
  const eta = (l: Load) => l.deliveredAt ?? (l.departedAt ?? l.pickupAt) + driveMs(l);
  // Arriving, or delivered in the last 4 hours and still on the dock waiting for its outbound truck.
  const inbound = loads
    .filter((l) => l.to === here && (l.status === "booked" || l.status === "assigned" || l.status === "inTransit" || (l.status === "delivered" && now - (l.deliveredAt ?? 0) < 4 * 60 * MIN)))
    .sort((a, b) => eta(a) - eta(b));
  const outbound = loads.filter((l) => l.from === here && (l.status === "open" || l.status === "booked" || l.status === "assigned")).sort((a, b) => a.pickupAt - b.pickupAt);
  // Each outbound load goes to one inbound at most (the first to arrive), and only with time to handle the freight in between.
  const matched = new Map<string, Load>();
  const used = new Set<string>();
  for (const i of inbound) {
    const o = outbound.find((x) => !used.has(x.id) && x.goods === i.goods && x.pickupAt >= eta(i) + HANDLE && x.pickupAt - eta(i) < 8 * 60 * MIN);
    if (o) {
      used.add(o.id);
      matched.set(i.id, o);
    }
  }
  return (
    <Card className="p-4">
      <div className="text-sm font-bold text-ink">{d.wh.xdTitle}</div>
      <p className="mt-1 text-xs text-ink-3">{d.wh.xdLead}</p>
      {inbound.length || outbound.length ? (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <SectionTitle>{d.wh.xdIn}</SectionTitle>
            <ul className="mt-2 space-y-1.5">
              {inbound.map((l) => {
                const m = matched.get(l.id);
                return (
                  <li key={l.id} className={cn("rounded-xl border px-3 py-2 text-[0.8rem]", m ? "border-green/50 bg-green-soft/60" : "border-line")}>
                    <div className="flex justify-between gap-2">
                      <span className="font-mono font-semibold text-ink">{l.id}</span>
                      <span className="tnum text-ink-3">{f.time(eta(l))}</span>
                    </div>
                    <div className="text-ink-2">
                      {place(l.from)} · {d.goods[l.goods]} · {d.common.palletsN.replace("{{n}}", String(l.pallets))}
                    </div>
                    {m ? (
                      <div className="mt-1 flex items-center gap-1 text-[0.72rem] font-semibold text-green">
                        <ArrowRight className="size-3" aria-hidden /> {m.id} → {place(m.to)} · {f.time(m.pickupAt)}
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {!inbound.length ? <li className="text-xs text-ink-3">{d.common.nothing}</li> : null}
            </ul>
          </div>
          <div>
            <SectionTitle>{d.wh.xdOut}</SectionTitle>
            <ul className="mt-2 space-y-1.5">
              {outbound.map((l) => (
                <li key={l.id} className="rounded-xl border border-line px-3 py-2 text-[0.8rem]">
                  <div className="flex justify-between gap-2">
                    <span className="font-mono font-semibold text-ink">{l.id}</span>
                    <span className="tnum text-ink-3">{f.rel(l.pickupAt, now)}</span>
                  </div>
                  <div className="text-ink-2">
                    → {place(l.to)} · {d.goods[l.goods]} · {d.common.palletsN.replace("{{n}}", String(l.pallets))}
                  </div>
                </li>
              ))}
              {!outbound.length ? <li className="text-xs text-ink-3">{d.common.nothing}</li> : null}
            </ul>
          </div>
        </div>
      ) : (
        <Empty className="mt-3">{d.wh.xdNone}</Empty>
      )}
    </Card>
  );
}
