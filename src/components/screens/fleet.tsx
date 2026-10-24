"use client";

import { Repeat, Star, Truck } from "lucide-react";
import { useState } from "react";
import { Page, PageHeader } from "@/components/app/shell";
import { blockReason, DemoNote, FictionalTag, useDeadlines, useRuleCtx } from "@/components/load-bits";
import { Button, Card, Chip, EcoBadge, Empty, Field, inputClass, Progress, SectionTitle } from "@/components/ui";
import { CARRIER, DRIVER, ME, VEHICLE, VEHICLES } from "@/data/companies";
import { route } from "@/data/network";
import { PLACE_IDS, PLACES, type PlaceId } from "@/data/places";
import { driveMs, fitsReturn, HOUR } from "@/data/seed";
import type { Load, ReturnTrip, Vehicle } from "@/data/types";
import { useI18n } from "@/i18n/client";
import { LOCALE_NAMES } from "@/i18n/config";
import { runVerdict } from "@/lib/cabotage";
import { hasDgtLabel, licenceLocalName } from "@/lib/checks";
import { fromMadridInput, toMadridInput } from "@/lib/format";
import { VEHICLE_SPECS } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { simNow, useMarket } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";

const round5 = (v: number) => Math.round(v / 5) * 5;
const QUARTER = 15 * 60_000;

export function Fleet() {
  const { d, f, place } = useI18n();
  const loads = useMarket((s) => s.loads);
  const returns = useMarket((s) => s.returns);
  const now = useSimNow();
  const me = CARRIER.get(ME.carrierId)!;
  const fleet = VEHICLES.filter((v) => v.carrierId === me.id);
  const [prefill, setPrefill] = useState<{ vehicleId: string; from: PlaceId; to: PlaceId; at: number; n: number } | null>(null);

  const jobOf = (v: Vehicle) => loads.find((l) => l.vehicleId === v.id && (l.status === "assigned" || l.status === "inTransit"));
  const mine = returns.filter((r) => r.carrierId === me.id);
  const market = returns.filter((r) => r.carrierId !== me.id && r.status === "open");
  // The licence by the name its issuing country gives it.
  const licence = me.licence === "community" ? d.fleet.licenceCommunity.replace("{{name}}", licenceLocalName(me)) : { MDL: d.fleet.licenceMDL, MDP: d.fleet.licenceMDP, LTI: d.fleet.licenceLTI }[me.licence];

  return (
    <Page>
      <PageHeader title={d.fleet.title} lead={d.fleet.lead.replace("{{carrier}}", me.name).replace("{{n}}", String(fleet.length)).replace("{{base}}", place(me.base))} />
      <Card className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-signal-soft text-signal">
            <Truck className="size-5" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-ink">
              {me.name}
              <FictionalTag />
            </div>
            <div className="text-xs text-ink-3">
              {licence} · {d.fleet.since.replace("{{year}}", String(me.founded))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Star className="size-4 fill-warn text-warn" aria-hidden />
          {d.fleet.rating.replace("{{r}}", f.num(me.rating, 1)).replace("{{jobs}}", f.num(me.jobs))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          {d.common.speaks}:
          {me.languages.map((l) => (
            <Chip key={l}>{LOCALE_NAMES[l]}</Chip>
          ))}
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section>
          <SectionTitle>{d.fleet.vehicles}</SectionTitle>
          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {fleet.map((v) => {
              const job = jobOf(v);
              const drv = DRIVER.get(v.driverId);
              const progress = job?.status === "inTransit" && job.departedAt ? Math.min(1, (now - job.departedAt) / driveMs(job)) : null;
              const awayFromHome = job && job.to !== v.home && route(job.to, v.home).km > 8;
              return (
                <Card key={v.id} className="p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-ink">{v.plate}</span>
                    {hasDgtLabel(v) ? <EcoBadge label={v.eco} /> : null}
                    <span className="text-xs text-ink-3">{d.vehicles[v.type]}</span>
                  </div>
                  <div className="mt-1 text-sm text-ink-2">
                    {drv?.name} <span className="text-xs text-ink-3">· {drv?.languages.map((l) => l.toUpperCase()).join(" ")}</span>
                  </div>
                  <div className="mt-2 text-[0.8rem] font-semibold">
                    {job ? (
                      job.status === "inTransit" ? (
                        <span className="text-signal">{d.fleet.onJob.replace("{{load}}", job.id).replace("{{to}}", place(job.to))}</span>
                      ) : (
                        <span className="text-warn">{d.fleet.assignedTo.replace("{{load}}", job.id)}</span>
                      )
                    ) : (
                      <span className="text-green">{d.fleet.idleAt.replace("{{place}}", place(v.home))}</span>
                    )}
                  </div>
                  {progress !== null ? <Progress value={progress} className="mt-2" /> : null}
                  {awayFromHome && job ? (
                    <Button
                      size="sm"
                      variant="lime"
                      className="mt-3 w-full"
                      onClick={() => setPrefill((p) => ({ vehicleId: v.id, from: job.to, to: v.home, at: (job.departedAt ?? job.pickupAt) + driveMs(job) + 45 * 60_000, n: (p?.n ?? 0) + 1 }))}
                    >
                      <Repeat className="size-3.5" aria-hidden />
                      {d.fleet.postTitle}
                    </Button>
                  ) : null}
                </Card>
              );
            })}
          </div>

          <SectionTitle className="mt-6">{d.fleet.mine}</SectionTitle>
          <div className="mt-2 space-y-2.5">
            {mine.length ? mine.map((rt) => <ReturnCard key={rt.id} rt={rt} loads={loads} now={now} own />) : <Empty>{d.common.nothing}</Empty>}
          </div>

          <SectionTitle className="mt-6">{d.fleet.market}</SectionTitle>
          <div className="mt-2 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {market.map((rt) => (
              <ReturnCard key={rt.id} rt={rt} loads={loads} now={now} />
            ))}
          </div>
        </section>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <PostReturn key={prefill?.n ?? 0} prefill={prefill} fleet={fleet} />
        </aside>
      </div>
    </Page>
  );
}

function ReturnCard({ rt, loads, now, own }: { rt: ReturnTrip; loads: Load[]; now: number; own?: boolean }) {
  const { d, f, place, n } = useI18n();
  const role = useMarket((s) => s.role);
  const bookOnReturn = useMarket((s) => s.bookOnReturn);
  const rules = useRuleCtx();
  const { day } = useDeadlines();
  const v = VEHICLE.get(rt.vehicleId);
  const fits = v ? loads.filter((l) => fitsReturn(l, rt, v.type)) : [];
  const matched = rt.matchedLoadId ? loads.find((l) => l.id === rt.matchedLoadId) : undefined;
  return (
    <Card className={cn("p-3.5", own && "border-lime/50")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {!own ? (
            <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-3">
              <span className="truncate">{CARRIER.get(rt.carrierId)?.name}</span>
              <FictionalTag />
            </div>
          ) : null}
          <div className="leading-snug font-bold text-pretty text-ink">
            {place(rt.from)} → {place(rt.to)}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-3">
            <span>{d.map.departs.replace("{{t}}", `${f.time(rt.departAt)} (${f.rel(rt.departAt, now)})`)}</span>
            <span>{n(d.map.freePallets, rt.freePallets)}</span>
            {v ? (
              <span>
                {d.vehiclesShort[v.type]} · {v.plate}
              </span>
            ) : null}
          </div>
        </div>
        <Chip tone="lime">{d.map.discount.replace("{{pct}}", String(Math.round(rt.discount * 100)))}</Chip>
      </div>
      {rt.status === "matched" ? (
        <p className="mt-2 text-[0.8rem] font-semibold text-green">{d.fleet.matched.replace("{{load}}", matched?.id ?? rt.matchedLoadId ?? "")}</p>
      ) : fits.length ? (
        <ul className="mt-2.5 space-y-1.5">
          {fits.slice(0, 3).map((l) => {
            const amount = round5(l.target * (1 - rt.discount));
            // The return trip's own vehicle runs the load: licence, tachograph and cabotage apply to it.
            const reason = v ? blockReason(runVerdict(l, v, rules.loads, rules), d, day) : null;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-lime-soft/70 px-2.5 py-2 text-[0.78rem]">
                <span className="min-w-0 flex-1 text-ink-2">
                  <span className="font-mono font-semibold text-ink">{l.id}</span> · {place(l.from)} → {place(l.to)} · {d.common.palletsN.replace("{{n}}", String(l.pallets))}
                  <span className="block text-[0.7rem] text-lime">{d.fleet.saving.replace("{{amount}}", f.money(l.target - amount))}</span>
                  {reason ? <span className="block text-[0.7rem] font-semibold text-danger">{d.loads.blocked.replace("{{reason}}", reason)}</span> : null}
                </span>
                <span className="text-right">
                  {own && role !== "shipper" ? (
                    <Button size="sm" variant="lime" disabled={!!reason} onClick={() => bookOnReturn(l.id, rt.id)}>
                      {d.fleet.take.replace("{{load}}", l.id).replace("{{amount}}", f.money(amount))}
                    </Button>
                  ) : (
                    <span className="tnum font-bold text-ink">{f.money(amount)}</span>
                  )}
                  <DemoNote short className="mt-0.5" />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[0.8rem] text-ink-3">{own ? d.fleet.waiting : d.fleet.noFits}</p>
      )}
    </Card>
  );
}

function PostReturn({ prefill, fleet }: { prefill: { vehicleId: string; from: PlaceId; to: PlaceId; at: number } | null; fleet: Vehicle[] }) {
  const { d, place } = useI18n();
  const postReturn = useMarket((s) => s.postReturn);
  const [vehicleId, setVehicleId] = useState(prefill?.vehicleId ?? fleet[0]?.id ?? "");
  const [from, setFrom] = useState<PlaceId>(prefill?.from ?? "bayonne");
  const [to, setTo] = useState<PlaceId>(prefill?.to ?? "irun");
  const [at, setAt] = useState(() => toMadridInput(Math.ceil((prefill?.at ?? simNow(useMarket.getState().clock) + 3 * HOUR) / QUARTER) * QUARTER));
  const v = VEHICLE.get(vehicleId);
  const max = v ? VEHICLE_SPECS[v.type].pallets : 33;
  const [free, setFree] = useState(max);
  const [discount, setDiscount] = useState(30);

  const placeOptions = (["ES", "FR"] as const).map((c) => (
    <optgroup key={c} label={c === "ES" ? d.post.spain : d.post.france}>
      {PLACE_IDS.filter((p) => PLACES[p].country === c).map((p) => (
        <option key={p} value={p}>
          {place(p)}
        </option>
      ))}
    </optgroup>
  ));

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2 font-bold text-lime">
        <Repeat className="size-4" aria-hidden />
        {d.fleet.postTitle}
      </div>
      <p className="mt-1 text-xs text-ink-3">{d.fleet.postLead}</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!vehicleId || from === to) return;
          postReturn({ vehicleId, from, to, departAt: fromMadridInput(at), freePallets: Math.min(free, max), discount: discount / 100 });
        }}
      >
        <Field label={d.common.vehicle}>
          <select
            value={vehicleId}
            onChange={(e) => {
              setVehicleId(e.target.value);
              const nv = VEHICLE.get(e.target.value);
              if (nv) setFree(VEHICLE_SPECS[nv.type].pallets);
            }}
            className={inputClass}
          >
            {fleet.map((x) => (
              <option key={x.id} value={x.id}>
                {x.plate} · {d.vehiclesShort[x.type]} · {DRIVER.get(x.driverId)?.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={d.common.from}>
            <select value={from} onChange={(e) => setFrom(e.target.value as PlaceId)} className={inputClass}>
              {placeOptions}
            </select>
          </Field>
          <Field label={d.common.to}>
            <select value={to} onChange={(e) => setTo(e.target.value as PlaceId)} className={inputClass}>
              {placeOptions}
            </select>
          </Field>
        </div>
        {/* A row of its own: a date-time field needs ~230px before it cuts the time off. */}
        <Field label={d.fleet.depart}>
          <input type="datetime-local" value={at} onChange={(e) => e.target.value && setAt(e.target.value)} className={inputClass} />
        </Field>
        <Field label={d.fleet.free}>
          <input type="number" min={1} max={max} value={free} onChange={(e) => setFree(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} className={cn(inputClass, "tnum")} />
        </Field>
        <Field label={`${d.fleet.discount} · ${d.map.discount.replace("{{pct}}", String(discount))}`}>
          {/* 40px tall so the thumb is easy to grab on a phone. */}
          <input type="range" min={10} max={45} step={1} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="h-10 w-full accent-[var(--z-lime)]" />
        </Field>
        <Button type="submit" variant="lime" className="w-full" disabled={from === to}>
          {d.fleet.submit}
        </Button>
      </form>
    </Card>
  );
}
