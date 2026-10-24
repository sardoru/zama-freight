"use client";

import { CircleAlert, ShieldAlert, Timer, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { screenIntro } from "@/components/app/intro";
import { Page, PageHeader } from "@/components/app/shell";
import { blockReason, labelText, useDeadlines, useRuleCtx, whereText } from "@/components/load-bits";
import { Button, Card, Chip, Empty, EcoBadge, inputClass, Progress, SectionTitle, Segmented, Sheet, Stat } from "@/components/ui";
import { CARRIER, VEHICLE, VEHICLES } from "@/data/companies";
import { CARRIES, dockStatus, driveMs, eligibleCarriers, HOUR } from "@/data/seed";
import type { Load, LoadStatus } from "@/data/types";
import { WAREHOUSE } from "@/data/warehouses";
import { useI18n } from "@/i18n/client";
import { ledgerAt, runVerdict } from "@/lib/cabotage";
import { hasDgtLabel, zbeNeedsAuth, zbeProblem } from "@/lib/checks";
import { useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import { useMarket } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";
import { LoadDetail } from "./loads";

const COLS: { status: LoadStatus; key: "colOpen" | "colBooked" | "colAssigned" | "colTransit" | "colDelivered"; tone: string }[] = [
  { status: "open", key: "colOpen", tone: "bg-accent" },
  { status: "booked", key: "colBooked", tone: "bg-blue" },
  { status: "assigned", key: "colAssigned", tone: "bg-warn" },
  { status: "inTransit", key: "colTransit", tone: "bg-signal" },
  { status: "delivered", key: "colDelivered", tone: "bg-green" },
];

export function Dispatch() {
  const { d, f, place } = useI18n();
  const loads = useMarket((s) => s.loads);
  const docks = useMarket((s) => s.docks);
  const now = useSimNow();
  const wide = useMedia("(min-width: 1280px)");
  const [open, setOpen] = useState<string | null>(null);
  const [col, setCol] = useState<LoadStatus>("booked");
  const rules = useRuleCtx();
  const { day } = useDeadlines();

  const busy = useMemo(() => new Set(loads.filter((l) => (l.status === "assigned" || l.status === "inTransit") && l.vehicleId).map((l) => l.vehicleId)), [loads]);
  const delivered = loads.filter((l) => l.status === "delivered");
  const moving = loads.filter((l) => l.status === "inTransit");
  const onTime = [...delivered.map((l) => (l.deliveredAt ?? 0) <= l.deliverBy), ...moving.map((l) => (l.departedAt ?? now) + driveMs(l) <= l.deliverBy)];
  const onTimePct = onTime.length ? onTime.filter(Boolean).length / onTime.length : 1;

  const alerts: { id: string; tone: "danger" | "warn"; icon: ReactNode; text: string; loadId?: string }[] = [];
  for (const l of loads) {
    const v = l.vehicleId ? VEHICLE.get(l.vehicleId) : undefined;
    const active = l.status === "assigned" || l.status === "booked";
    // The ZBE depends on the date (B is banned from phase 2), so it's checked at the load's own time.
    if (active && v && zbeProblem(l, v, l.departedAt ?? l.pickupAt))
      alerts.push({ id: `z-${l.id}`, tone: "danger", icon: <ShieldAlert className="size-4" aria-hidden />, text: d.dispatch.alertZbe.replace("{{load}}", l.id).replace("{{plate}}", v.plate).replace("{{label}}", labelText(v.eco, d)), loadId: l.id });
    else if (active && v && zbeNeedsAuth(l, v))
      alerts.push({ id: `zf-${l.id}`, tone: "warn", icon: <ShieldAlert className="size-4" aria-hidden />, text: d.dispatch.alertZbeForeign.replace("{{load}}", l.id).replace("{{plate}}", v.plate), loadId: l.id });
    // Licence, tachograph and cabotage for the vehicle on the job.
    const reason = active && v ? blockReason(runVerdict(l, v, loads, rules), d, day) : null;
    if (reason && v)
      alerts.push({ id: `r-${l.id}`, tone: "danger", icon: <CircleAlert className="size-4" aria-hidden />, text: d.dispatch.alertRule.replace("{{load}}", l.id).replace("{{plate}}", v.plate).replace("{{reason}}", reason), loadId: l.id });
    if (l.status === "booked" && !l.vehicleId && l.pickupAt - now < 2 * HOUR)
      alerts.push({ id: `v-${l.id}`, tone: "warn", icon: <Timer className="size-4" aria-hidden />, text: d.dispatch.alertNoVehicle.replace("{{load}}", l.id).replace("{{t}}", f.rel(l.pickupAt, now)), loadId: l.id });
  }
  // Each foreign vehicle's cabotage window or cooling-off, per country.
  const ledgers: { id: string; text: string; cooling: boolean }[] = [];
  for (const v of VEHICLES) {
    for (const country of ["ES", "FR"] as const) {
      const lg = ledgerAt(v.id, country, now, loads, rules);
      if (!lg) continue;
      const where = whereText(country, d);
      if (lg.coolingOffUntil && now <= lg.coolingOffUntil)
        ledgers.push({ id: `${v.id}-${country}`, cooling: true, text: d.dispatch.cabotageCooling.replace("{{plate}}", v.plate).replace("{{where}}", where).replace("{{date}}", day(lg.coolingOffUntil)) });
      else if (lg.windowEnds && now <= lg.windowEnds)
        ledgers.push({ id: `${v.id}-${country}`, cooling: lg.used >= 3, text: d.dispatch.cabotageOpen.replace("{{plate}}", v.plate).replace("{{where}}", where).replace("{{used}}", String(lg.used)).replace("{{date}}", day(lg.windowEnds)) });
    }
  }
  for (const a of docks) {
    if (dockStatus(a, now) === "late")
      alerts.push({ id: `d-${a.id}`, tone: "warn", icon: <WarehouseIcon className="size-4" aria-hidden />, text: d.dispatch.alertLateDock.replace("{{warehouse}}", WAREHOUSE.get(a.warehouseId)?.name ?? "").replace("{{door}}", String(a.door + 1)) });
  }

  const byCol = (s: LoadStatus) => {
    const xs = loads.filter((l) => l.status === s);
    return s === "delivered" ? xs.sort((a, b) => (b.deliveredAt ?? 0) - (a.deliveredAt ?? 0)).slice(0, 12) : xs.sort((a, b) => a.pickupAt - b.pickupAt);
  };

  return (
    <Page className="max-w-none">
      {/* The same header the shell shows while the market starts (intro.ts). */}
      <PageHeader {...screenIntro("dispatch", d, place)} />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={d.dispatch.kpiOnTime} value={f.pct(onTimePct)} tone={onTimePct >= 0.9 ? "green" : "warn"} />
        <Stat label={d.dispatch.kpiIdle} value={String(VEHICLES.length - busy.size)} sub={`/ ${VEHICLES.length}`} />
        <Stat label={d.dispatch.kpiUtil} value={f.pct(busy.size / VEHICLES.length)} tone="signal" />
        <Stat label={d.dispatch.kpiAlerts} value={String(alerts.length)} tone={alerts.length ? "danger" : "green"} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {!wide ? (
            <Segmented
              value={col}
              onChange={setCol}
              options={COLS.map((c) => ({ value: c.status, label: `${d.dispatch[c.key]} · ${loads.filter((l) => l.status === c.status).length}` }))}
              className="mb-3"
            />
          ) : null}
          <div className={cn("grid gap-3", wide ? "grid-cols-5" : "grid-cols-1")}>
            {COLS.filter((c) => wide || c.status === col).map((c) => {
              const xs = byCol(c.status);
              return (
                <section key={c.status} className="min-w-0 rounded-2xl border border-line bg-surface-2/60 p-2">
                  {wide ? (
                    <h2 className="flex items-center gap-2 px-1.5 pt-1 pb-2 text-[0.78rem] font-bold text-ink">
                      <span className={cn("size-2 rounded-full", c.tone)} />
                      <span className="truncate">{d.dispatch[c.key]}</span>
                      <span className="ml-auto text-ink-3">{xs.length}</span>
                    </h2>
                  ) : null}
                  <div className="space-y-2">
                    {xs.length ? xs.map((l) => <DispatchCard key={l.id} load={l} now={now} busy={busy} onOpen={() => setOpen(l.id)} />) : <Empty className="py-6">{d.dispatch.empty}</Empty>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <Card as="aside" className="self-start p-3">
          <SectionTitle aside={<Chip tone={alerts.length ? "danger" : "green"}>{alerts.length}</Chip>}>{d.dispatch.alerts}</SectionTitle>
          {alerts.length ? (
            <ul className="mt-2 space-y-1.5">
              {alerts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={!a.loadId}
                    onClick={() => a.loadId && setOpen(a.loadId)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-[0.8rem] leading-snug transition enabled:hover:brightness-95",
                      a.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn",
                    )}
                  >
                    <span className="mt-0.5 shrink-0">{a.icon}</span>
                    <span className="min-w-0 font-medium">{a.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-ink-3">{d.dispatch.noAlerts}</p>
          )}
          <div className="mt-3 border-t border-line pt-2.5">
            <h3 className="text-[0.72rem] font-bold text-ink-2">{d.dispatch.cabotageTitle}</h3>
            {ledgers.length ? (
              <ul className="mt-1 space-y-0.5 text-[0.7rem] text-ink-3">
                {ledgers.map((x) => (
                  <li key={x.id} className={cn("tnum", x.cooling && "text-warn")}>
                    {x.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[0.7rem] text-ink-3">{d.dispatch.cabotageQuiet}</p>
            )}
          </div>
        </Card>
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ?? ""}>
        {open ? <LoadDetail id={open} onClose={() => setOpen(null)} inSheet /> : null}
      </Sheet>
    </Page>
  );
}

function DispatchCard({ load: l, now, busy, onOpen }: { load: Load; now: number; busy: Set<string | undefined>; onOpen: () => void }) {
  const { d, f, place } = useI18n();
  const assignVehicle = useMarket((s) => s.assignVehicle);
  const advance = useMarket((s) => s.advance);
  const bookInstant = useMarket((s) => s.bookInstant);
  const rules = useRuleCtx();
  const { day } = useDeadlines();
  const fleet = l.carrierId ? VEHICLES.filter((v) => v.carrierId === l.carrierId && CARRIES[v.type].includes(l.vehicle)) : [];
  // Only a free truck that may legally run the job can be picked (licence, tachograph, cabotage); if the chosen one
  // gets another job or becomes blocked meanwhile, fall back to the first usable one.
  const blocked = new Map(l.status === "booked" ? fleet.map((v) => [v.id, blockReason(runVerdict(l, v, rules.loads, rules), d, day)]) : []);
  const usable = (id: string) => !busy.has(id) && !blocked.get(id);
  const [picked, setPicked] = useState<string | null>(null);
  const vehicleId = picked && usable(picked) ? picked : (fleet.find((x) => usable(x.id))?.id ?? "");
  // Nothing usable because of the rules: say why.
  const reason = l.status === "booked" && !vehicleId ? (fleet.map((x) => blocked.get(x.id)).find(Boolean) ?? null) : null;
  const bookable = l.status !== "open" || eligibleCarriers(l, { ...rules, at: l.pickupAt }).length > 0;
  const v = l.vehicleId ? VEHICLE.get(l.vehicleId) : undefined;
  const progress = l.status === "inTransit" && l.departedAt ? Math.min(1, (now - l.departedAt) / driveMs(l)) : null;
  const lane = `${place(l.from)} → ${place(l.to)}`;
  const sub = `${d.vehiclesShort[l.vehicle]} · ${d.common.palletsN.replace("{{n}}", String(l.pallets))} · ${l.status === "delivered" && l.deliveredAt ? f.time(l.deliveredAt) : d.dispatch.pickupIn.replace("{{t}}", f.rel(l.pickupAt, now))}`;
  return (
    <article className="rounded-xl border border-line bg-surface p-2.5 shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[0.7rem] font-semibold text-ink-3">{l.id}</span>
          <span className="tnum text-[0.8rem] font-bold text-ink">{f.money(l.price ?? l.target)}</span>
        </div>
        {/* Two lines before an ellipsis, so the destination stays readable in narrow columns. */}
        <div title={lane} className="mt-0.5 line-clamp-2 text-[0.85rem] leading-snug font-bold text-ink">
          {lane}
        </div>
        <div title={sub} className="mt-0.5 line-clamp-2 text-[0.7rem] text-ink-3">
          {sub}
        </div>
        {l.carrierId ? <div className="mt-1 truncate text-[0.72rem] font-medium text-ink-2">{CARRIER.get(l.carrierId)?.name}</div> : null}
        {v ? (
          <div className="mt-1 flex items-center gap-1.5 text-[0.7rem] text-ink-3">
            {hasDgtLabel(v) ? <EcoBadge label={v.eco} className="h-4 min-w-4 px-1 text-[0.55rem]" /> : null}
            <span className="font-mono">{v.plate}</span>
          </div>
        ) : null}
        {progress !== null ? (
          <div className="mt-2">
            <Progress value={progress} />
            <div className="tnum mt-0.5 text-[0.68rem] font-semibold text-signal">{d.loads.onRoad.replace("{{pct}}", String(Math.round(progress * 100))).replace("{{t}}", f.time((l.departedAt ?? now) + driveMs(l)))}</div>
          </div>
        ) : null}
      </button>
      {l.status === "open" ? (
        <Button size="sm" variant="secondary" disabled={!bookable} onClick={() => bookInstant(l.id)} className="mt-2 w-full">
          {d.loads.bookNow.replace("{{amount}}", f.money(l.target))}
        </Button>
      ) : null}
      {l.status === "booked" && fleet.length ? (
        <div className="mt-2 flex gap-1.5">
          <select
            value={vehicleId}
            onChange={(e) => setPicked(e.target.value)}
            className={cn(inputClass, "h-8 min-w-0 flex-1 px-2 text-xs pointer-coarse:h-10")}
            aria-label={d.dispatch.assignTo}
          >
            {/* Every truck is on a job (or blocked): show a dash rather than a blank box. */}
            {vehicleId ? null : (
              <option value="" disabled hidden>
                —
              </option>
            )}
            {fleet.map((x) => (
              <option key={x.id} value={x.id} disabled={busy.has(x.id) || !!blocked.get(x.id)}>
                {x.plate}
                {hasDgtLabel(x) ? ` · ${labelText(x.eco, d)}` : ""}
                {busy.has(x.id) ? ` (${d.loads.vehicleBusy})` : ""}
                {blocked.get(x.id) ? ` (${blocked.get(x.id)})` : ""}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" disabled={!vehicleId} onClick={() => assignVehicle(l.id, vehicleId)} aria-label={d.loads.assign} title={d.loads.assign}>
            <Truck className="size-3.5" aria-hidden />
          </Button>
        </div>
      ) : null}
      {reason ? <p className="mt-1 text-[0.68rem] leading-snug font-semibold text-danger">{d.loads.blocked.replace("{{reason}}", reason)}</p> : null}
      {l.status === "assigned" ? (
        <Button size="sm" variant="primary" onClick={() => advance(l.id)} className="mt-2 w-full">
          {d.dispatch.depart}
        </Button>
      ) : null}
      {l.status === "inTransit" ? (
        <Button size="sm" variant="secondary" onClick={() => advance(l.id)} className="mt-2 w-full">
          {d.dispatch.deliver}
        </Button>
      ) : null}
    </article>
  );
}
