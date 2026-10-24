"use client";

import { ArrowRight, Ban, Bot, Boxes, CalendarClock, ClipboardCheck, Eye, Hand, LockOpen, MoveRight, RotateCcw, Search, Snowflake, Thermometer, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Page, PageHeader } from "@/components/app/shell";
import { useIsDark } from "@/components/theme";
import { Button, Card, Chip, Empty, Field, inputClass, SectionTitle, Segmented, Sheet, Stat } from "@/components/ui";
import { CARRIER, CARRIERS, SHIPPER } from "@/data/companies";
import { dockStatus, driveMs, MIN } from "@/data/seed";
import type { Bin, BinStatus, DockAppt, TempZone, WarehouseId, WarehouseKind } from "@/data/types";
import { buildBins, countDue, occupancy, SKU, slottingAdvice, travelMeters, WAREHOUSE, WAREHOUSES } from "@/data/warehouses";
import { useI18n } from "@/i18n/client";
import { fromMadridInput, toMadridInput } from "@/lib/format";
import { useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import { simNow, useMarket } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";
import type { ColorMode } from "@/components/warehouse/twin";

const Twin = dynamic(() => import("@/components/warehouse/twin"), { ssr: false });

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
const FILL = new Map(WAREHOUSES.map((w) => [w.id, occupancy(buildBins(w))]));
const QUARTER = 15 * MIN;

type Tab = "inventory" | "docks" | "slotting" | "crossdock";

export function WarehouseScreen() {
  const { d, f, place } = useI18n();
  const dark = useIsDark();
  const now = useSimNow();
  const wide = useMedia("(min-width: 1024px)");
  const patches = useMarket((s) => s.binPatches);
  const docks = useMarket((s) => s.docks);
  const patchBin = useMarket((s) => s.patchBin);
  const toast = useMarket((s) => s.toast);

  const [wid, setWid] = useState<WarehouseId>(() => {
    const q = new URLSearchParams(window.location.search).get("w") as WarehouseId | null;
    return q && WAREHOUSE.has(q) ? q : "w-oiartzun";
  });
  const w = WAREHOUSE.get(wid)!;
  const [mode, setMode] = useState<ColorMode>("status");
  const [explode, setExplode] = useState(0);
  const [showEmpty, setShowEmpty] = useState(false);
  const [showRobots, setShowRobots] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Bin | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [focusLoc, setFocusLoc] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("inventory");

  const bins = useMemo(
    () =>
      buildBins(w).map((b) => {
        const p = patches[`${w.id}|${b.loc}`];
        return p ? { ...b, ...p } : b;
      }),
    [w, patches],
  );
  const wDocks = useMemo(() => docks.filter((a) => a.warehouseId === w.id), [docks, w.id]);
  const advice = useMemo(() => slottingAdvice(bins, 8), [bins]);
  const sel = selected ? bins.find((b) => b.loc === selected) : undefined;

  const stored = bins.filter((b) => b.status !== "empty");
  const kpi = {
    occupancy: occupancy(bins),
    stored: stored.length,
    a: stored.filter((b) => b.abc === "A").length,
    due: countDue(bins).length,
    expiring: stored.filter((b) => (b.expiryDays ?? 999) <= 30).length,
    busyDoors: new Set(wDocks.filter((a) => now >= a.start - 10 * MIN && now < a.end).map((a) => a.door)).size,
  };

  const choose = (id: WarehouseId) => {
    setWid(id);
    setSelected(null);
    setFocusLoc(null);
    const url = new URL(window.location.href);
    url.searchParams.set("w", id);
    window.history.replaceState(window.history.state, "", url);
  };

  const modes: { value: ColorMode; label: string }[] = [
    { value: "status", label: d.wh.modeStatus },
    { value: "abc", label: d.wh.modeAbc },
    { value: "fill", label: d.wh.modeFill },
    { value: "temp", label: d.wh.modeTemp },
    { value: "expiry", label: d.wh.modeExpiry },
  ];

  const binPanel = sel ? (
    <BinPanel
      bin={sel}
      move={advice.find((m) => m.from.loc === sel.loc)?.to.loc}
      onClose={() => setSelected(null)}
      onPick={() => {
        const qty = (sel.qty ?? 1) - 1;
        patchBin(w.id, sel.loc, qty > 0 ? { qty, status: "picking" } : { status: "empty", qty: undefined, sku: undefined, lot: undefined, expiryDays: undefined, abc: undefined, picksPerDay: undefined });
        toast("toast.picked", { loc: sel.loc });
      }}
      onCount={() => {
        patchBin(w.id, sel.loc, { countedDaysAgo: 0 });
        toast("toast.counted", { loc: sel.loc });
      }}
      onBlock={() => {
        const blocked = sel.status === "blocked";
        patchBin(w.id, sel.loc, { status: blocked ? "stored" : "blocked" });
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
      <PageHeader title={d.wh.title} lead={d.wh.lead} />
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
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
              <span className="absolute inset-x-0 bottom-0 rounded-full bg-violet" style={{ height: `${Math.round((FILL.get(x.id) ?? 0) * 100)}%` }} />
            </span>
            <span>
              <span className="block text-[0.82rem] font-bold whitespace-nowrap text-ink">{x.name}</span>
              <span className="block text-[0.7rem] whitespace-nowrap text-ink-3">
                {place(x.place)} · {f.pct(FILL.get(x.id) ?? 0)}
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
        <Stat label={d.wh.kpiCount} value={f.num(kpi.due)} tone={kpi.due ? "warn" : "green"} />
        <Stat label={d.wh.kpiExpiring} value={f.num(kpi.expiring)} tone={kpi.expiring ? "danger" : "green"} />
        <Stat label={d.wh.kpiDocks} value={`${kpi.busyDoors}/${w.doors}`} tone="signal" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="relative h-[58dvh] min-h-[22rem] overflow-hidden lg:h-[64dvh]">
          <Twin
            warehouse={w}
            bins={bins}
            docks={wDocks}
            mode={mode}
            explode={explode}
            showEmpty={showEmpty}
            showRobots={showRobots}
            dark={dark}
            selected={selected}
            onSelect={setSelected}
            onHover={setHover}
            resetKey={resetKey}
            focusLoc={focusLoc}
            now={now}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start gap-2 p-2">
            <Segmented value={mode} onChange={setMode} options={modes} size="sm" label={d.wh.colorBy} className="glass pointer-events-auto shadow-card" />
            <div className="glass pointer-events-auto flex items-center gap-2 rounded-xl border border-line px-2.5 py-1 shadow-card">
              <span className="text-[0.72rem] font-semibold text-ink-2">{d.wh.explode}</span>
              <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="w-24 accent-[var(--z-violet)]" aria-label={d.wh.explode} />
            </div>
            <div className="glass pointer-events-auto ml-auto flex items-center gap-1 rounded-xl border border-line p-0.5 shadow-card">
              <IconToggle on={showEmpty} onClick={() => setShowEmpty((v) => !v)} label={d.wh.showEmpty} icon={<Eye className="size-4" aria-hidden />} />
              <IconToggle on={showRobots} onClick={() => setShowRobots((v) => !v)} label={d.wh.showRobots} icon={<Bot className="size-4" aria-hidden />} />
              <IconToggle on={false} onClick={() => setResetKey((k) => k + 1)} label={d.wh.resetView} icon={<RotateCcw className="size-4" aria-hidden />} />
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-2">
            <Legend mode={mode} />
            <div className="glass max-w-full truncate rounded-lg border border-line px-2.5 py-1 text-[0.72rem] text-ink-2">
              {hover ? (
                <>
                  <span className="font-mono font-semibold text-ink">{hover.loc}</span>
                  {hover.sku ? ` · ${SKU.get(hover.sku)?.name}` : ` · ${d.wh.binEmpty}`}
                </>
              ) : (
                d.wh.hint
              )}
            </div>
          </div>
        </Card>
        {wide ? <aside className="self-start">{binPanel ?? <Empty className="h-full">{d.wh.hint}</Empty>}</aside> : null}
      </div>
      {!wide ? (
        <Sheet open={!!sel} onClose={() => setSelected(null)} title={sel ? d.wh.binTitle.replace("{{loc}}", sel.loc) : ""}>
          <div className="p-3">{binPanel}</div>
        </Sheet>
      ) : null}

      <Segmented
        value={tab}
        onChange={setTab}
        className="mt-5"
        options={[
          { value: "inventory", label: d.wh.tabInventory },
          { value: "docks", label: d.wh.tabDocks },
          { value: "slotting", label: `${d.wh.tabSlotting} · ${advice.length}` },
          { value: "crossdock", label: d.wh.tabCrossdock },
        ]}
      />
      <div className="mt-3">
        {tab === "inventory" ? (
          <Inventory
            bins={bins}
            onPick={(loc) => {
              setSelected(loc);
              setFocusLoc(loc);
            }}
          />
        ) : tab === "docks" ? (
          <Docks warehouseId={w.id} doors={w.doors} appts={wDocks} now={now} />
        ) : tab === "slotting" ? (
          <Slotting
            advice={advice}
            onApply={(from, to) => {
              useMarket.getState().moveBin(w.id, from, to);
              setSelected(to);
            }}
            onShow={(loc) => {
              setSelected(loc);
              setFocusLoc(loc);
            }}
          />
        ) : (
          <CrossDock place={w.place} now={now} />
        )}
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
      className={cn("inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition hover:text-ink", on && "bg-surface text-violet shadow-sm ring-1 ring-line")}
    >
      {icon}
    </button>
  );
}

function Legend({ mode }: { mode: ColorMode }) {
  const { d } = useI18n();
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
              { c: "#ef4444", l: "≤ 30 d" },
              { c: "#f59e0b", l: "≤ 90 d" },
              { c: "#22c55e", l: "> 90 d" },
            ]
          : [];
  return (
    <div className="glass flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-2.5 py-1.5 text-[0.7rem] font-medium text-ink-2">
      {mode === "temp" || mode === "fill" ? (
        <span className="flex items-center gap-2">
          {mode === "temp" ? d.wh.cold : "0 %"}
          <span className={cn("h-2 w-24 rounded-full", mode === "temp" ? "bg-[linear-gradient(90deg,#3b82f6,#22d3ee,#a3e635,#fb923c,#ef4444)]" : "bg-[linear-gradient(90deg,var(--z-accent-soft),var(--z-accent))]")} />
          {mode === "temp" ? d.wh.warm : "100 %"}
        </span>
      ) : (
        items.map((i) => (
          <span key={i.l} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: i.c }} />
            {i.l}
          </span>
        ))
      )}
    </div>
  );
}

function BinPanel({ bin: b, move, onClose, onPick, onCount, onBlock, onMove }: { bin: Bin; move?: string; onClose: () => void; onPick: () => void; onCount: () => void; onBlock: () => void; onMove: (to: string) => void }) {
  const { d, f, n } = useI18n();
  const sku = b.sku ? SKU.get(b.sku) : undefined;
  const rows: [string, string][] = sku
    ? [
        [d.wh.owner, SHIPPER.get(sku.ownerId)?.name ?? ""],
        [d.wh.qty, `${f.num(b.qty ?? 0)} ${sku.unit} / ${sku.perPallet}`],
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
      <div className="mt-3 grid grid-cols-2 gap-2">
        {sku ? (
          <Button size="sm" variant="secondary" onClick={onPick}>
            <Hand className="size-3.5" aria-hidden />
            {d.wh.pick.replace("{{unit}}", sku.unit)}
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

function Inventory({ bins, onPick }: { bins: Bin[]; onPick: (loc: string) => void }) {
  const { d, f } = useI18n();
  const [q, setQ] = useState("");
  const all = bins.filter((b) => b.status !== "empty");
  const n = q.trim().toLowerCase();
  const rows = n ? all.filter((b) => [b.loc, b.lot ?? "", b.sku ? (SKU.get(b.sku)?.name ?? "") : ""].some((s) => s.toLowerCase().includes(n))) : all;
  const shown = rows.slice(0, 80);
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <label className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={d.wh.invSearch} className={cn(inputClass, "pl-9")} aria-label={d.common.search} />
        </label>
        <span className="text-xs text-ink-3">{d.wh.showing.replace("{{n}}", String(shown.length)).replace("{{total}}", String(rows.length))}</span>
      </div>
      <div className="max-h-[26rem] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[40rem] text-left text-[0.8rem]">
          <thead className="sticky top-0 bg-surface-2 text-[0.7rem] font-bold tracking-wide text-ink-3 uppercase">
            <tr>
              <th className="px-3 py-2">{d.wh.colLoc}</th>
              <th className="px-3 py-2">{d.wh.colProduct}</th>
              <th className="px-3 py-2 text-right">{d.wh.colQty}</th>
              <th className="px-3 py-2">{d.wh.colLot}</th>
              <th className="px-3 py-2 text-right">{d.wh.colExpiry}</th>
              <th className="px-3 py-2">{d.wh.colAbc}</th>
              <th className="px-3 py-2">{d.wh.colStatus}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((b) => {
              const sku = b.sku ? SKU.get(b.sku) : undefined;
              return (
                <tr key={b.loc} onClick={() => onPick(b.loc)} className="cursor-pointer transition hover:bg-surface-2">
                  <td className="px-3 py-2 font-mono font-semibold text-ink">{b.loc}</td>
                  <td className="max-w-[18rem] truncate px-3 py-2 text-ink-2">{sku?.name}</td>
                  <td className="tnum px-3 py-2 text-right text-ink">{f.num(b.qty ?? 0)}</td>
                  <td className="px-3 py-2 font-mono text-ink-3">{b.lot}</td>
                  <td className={cn("tnum px-3 py-2 text-right", (b.expiryDays ?? 999) <= 30 ? "font-bold text-danger" : "text-ink-3")}>{b.expiryDays !== undefined ? `${b.expiryDays} d` : "–"}</td>
                  <td className="px-3 py-2 font-bold text-ink-2">{b.abc}</td>
                  <td className="px-3 py-2 text-ink-3">{d.wh[BIN_ST[b.status]]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Docks({ warehouseId, doors, appts, now }: { warehouseId: WarehouseId; doors: number; appts: DockAppt[]; now: number }) {
  const { d, f } = useI18n();
  const bookDock = useMarket((s) => s.bookDock);
  const from = Math.floor((now - 2 * 60 * MIN) / (60 * MIN)) * 60 * MIN;
  const to = from + 14 * 60 * MIN;
  const span = to - from;
  const pct = (t: number) => `${((Math.min(to, Math.max(from, t)) - from) / span) * 100}%`;
  const hours = Array.from({ length: 15 }, (_, i) => from + i * 60 * MIN);

  const [door, setDoor] = useState(0);
  const [at, setAt] = useState(() => toMadridInput(Math.ceil((simNow(useMarket.getState().clock) + 60 * MIN) / QUARTER) * QUARTER));
  const [dur, setDur] = useState(45);
  const [dir, setDir] = useState<"in" | "out">("in");
  const [carrierId, setCarrierId] = useState("c-txingudi");
  const [pallets, setPallets] = useState(20);
  const start = fromMadridInput(at);
  const end = start + dur * MIN;
  const clash = appts.some((a) => a.door === door && a.start < end + 10 * MIN && start < a.end + 10 * MIN);

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
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 shrink-0 text-[0.72rem] font-semibold text-ink-2">{d.wh.door.replace("{{n}}", String(i + 1))}</span>
                  <div className="relative h-8 flex-1 rounded-lg bg-surface-2">
                    <span className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-signal" style={{ left: pct(now) }} />
                    {appts
                      .filter((a) => a.door === i && a.end > from && a.start < to)
                      .map((a) => {
                        const st = dockStatus(a, now);
                        return (
                          <div
                            key={a.id}
                            title={`${CARRIER.get(a.carrierId)?.name} · ${f.time(a.start)}–${f.time(a.end)} · ${a.pallets} pal. · ${d.wh[DK_ST[st]]}`}
                            className={cn(
                              "absolute inset-y-1 flex items-center overflow-hidden rounded-md px-1.5 text-[0.62rem] font-semibold whitespace-nowrap text-white",
                              a.direction === "in" ? "bg-blue" : "bg-violet",
                              st === "done" && "opacity-35",
                              st === "late" && "ring-2 ring-warn",
                              st === "loading" && "ring-2 ring-signal",
                              a.mine && "outline-2 outline-offset-1 outline-accent",
                            )}
                            style={{ left: pct(a.start), width: `calc(${pct(a.end)} - ${pct(a.start)})` }}
                          >
                            {CARRIER.get(a.carrierId)?.name.split(" ")[0]}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
            <div className="relative mt-1 ml-16 h-3">
              <span className="absolute top-0 -translate-x-1/2 rounded bg-signal px-1 text-[0.6rem] font-bold text-white" style={{ left: pct(now) }}>
                {d.wh.now} {f.time(now)}
              </span>
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <div className="text-sm font-bold text-ink">{d.wh.bookTitle}</div>
        <p className="mt-1 text-xs text-ink-3">{d.wh.bookLead}</p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!clash) bookDock({ warehouseId, door, start, end, direction: dir, carrierId, pallets });
          }}
        >
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={d.wh.door.replace("{{n}}", "")}>
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
            <Field label={d.wh.arrival}>
              <input type="datetime-local" value={at} onChange={(e) => e.target.value && setAt(e.target.value)} className={inputClass} />
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
          {clash ? <p className="text-xs font-semibold text-danger">{d.wh.conflict.replace("{{n}}", String(door + 1))}</p> : null}
          <Button type="submit" variant="primary" className="w-full" disabled={clash}>
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
  const inbound = loads.filter((l) => l.to === here && (l.status === "booked" || l.status === "assigned" || l.status === "inTransit"));
  const outbound = loads.filter((l) => l.from === here && (l.status === "open" || l.status === "booked" || l.status === "assigned"));
  const eta = (l: (typeof loads)[number]) => (l.departedAt ?? l.pickupAt) + driveMs(l);
  const match = (i: (typeof loads)[number]) => outbound.find((o) => o.goods === i.goods && o.pickupAt > eta(i) && o.pickupAt - eta(i) < 8 * 60 * MIN);
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
                const m = match(l);
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
