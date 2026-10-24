"use client";

import { ArrowDownUp, CircleAlert, FileCheck, Gavel, Leaf, Repeat, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Page, PageHeader } from "@/components/app/shell";
import { RouteMini } from "@/components/route-mini";
import { Button, Card, Chip, Field, inputClass, SectionTitle, Segmented, Switch } from "@/components/ui";
import { CARRIER, ME, SHIPPER, VEHICLE } from "@/data/companies";
import { PLACE_IDS, PLACES, type PlaceId } from "@/data/places";
import { fitsReturn, HOUR } from "@/data/seed";
import type { GoodsType, Load, VehicleType } from "@/data/types";
import { useI18n } from "@/i18n/client";
import { needsEcmr, touchesZbe, touchesZfe } from "@/lib/checks";
import { fromMadridInput, toMadridInput } from "@/lib/format";
import { quote, suggestVehicle, VEHICLE_SPECS } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { simNow, useMarket } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";

const GOODS: GoodsType[] = ["food", "chilled", "frozen", "beverages", "pallets", "furniture", "paper", "parts", "steel", "agri", "pharma", "surf"];
const VEHICLE_TYPES: VehicleType[] = ["van", "rigid", "artic", "reefer", "flatbed"];
const round5 = (v: number) => Math.round(v / 5) * 5;
const QUARTER = 15 * 60_000;

function suggest(goods: GoodsType, pallets: number, kg: number): VehicleType {
  if (goods === "steel") return "flatbed";
  if (goods === "chilled" || goods === "frozen" || goods === "pharma") return suggestVehicle(pallets, kg, goods === "frozen" ? "frozen" : "chilled");
  return suggestVehicle(pallets, kg);
}

function PlaceSelect({ value, onChange, label }: { value: PlaceId; onChange: (p: PlaceId) => void; label: string }) {
  const { d, place } = useI18n();
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as PlaceId)} className={inputClass}>
        {(["ES", "FR"] as const).map((c) => (
          <optgroup key={c} label={c === "ES" ? d.post.spain : d.post.france}>
            {PLACE_IDS.filter((p) => PLACES[p].country === c).map((p) => (
              <option key={p} value={p}>
                {place(p)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

export function PostLoad() {
  const { lang, d, f, place, n } = useI18n();
  const router = useRouter();
  const role = useMarket((s) => s.role);
  const returns = useMarket((s) => s.returns);
  const postLoad = useMarket((s) => s.postLoad);
  const bookOnReturn = useMarket((s) => s.bookOnReturn);
  const now = useSimNow();

  const [from, setFrom] = useState<PlaceId>(SHIPPER.get(ME.shipperId)?.place ?? "lezo");
  const [to, setTo] = useState<PlaceId>("biarritz");
  const [goods, setGoods] = useState<GoodsType>("food");
  const [pallets, setPallets] = useState(12);
  const [kg, setKg] = useState(6000);
  const [picked, setPicked] = useState<VehicleType | null>(null);
  const [pickup, setPickup] = useState(() => toMadridInput(Math.ceil((simNow(useMarket.getState().clock) + 3 * HOUR) / QUARTER) * QUARTER));
  const [express, setExpress] = useState(false);
  const [tailLift, setTailLift] = useState(false);
  const [adr, setAdr] = useState(false);
  const [mode, setMode] = useState<"bids" | "instant">("bids");

  const suggested = suggest(goods, pallets, kg);
  const vehicle = picked ?? suggested;
  const spec = VEHICLE_SPECS[vehicle];
  const pickupAt = fromMadridInput(pickup);
  const same = from === to;
  const q = useMemo(() => (same ? null : quote({ from, to, vehicle, express, tailLift, adr })), [same, from, to, vehicle, express, tailLift, adr]);
  const ev = q && vehicle === "van" ? quote({ from, to, vehicle, express, tailLift, adr }, true).co2Kg : null;
  const errors = [
    same ? d.post.same : null,
    kg > spec.kg ? d.post.tooHeavy.replace("{{v}}", d.vehiclesShort[vehicle]).replace("{{max}}", f.num(spec.kg)) : null,
    pallets > spec.pallets ? d.post.tooMany.replace("{{v}}", d.vehiclesShort[vehicle]).replace("{{max}}", String(spec.pallets)) : null,
  ].filter(Boolean) as string[];

  const draft: Load = {
    id: "draft",
    shipperId: ME.shipperId,
    from,
    to,
    goods,
    pallets,
    kg,
    vehicle,
    pickupAt,
    deliverBy: pickupAt + 6 * HOUR,
    mode,
    target: q?.fair ?? 0,
    status: "open",
    ecmr: "none",
    createdAt: now,
  };
  const offers = q
    ? returns.filter((rt) => {
        const v = VEHICLE.get(rt.vehicleId);
        return v && fitsReturn(draft, rt, v.type);
      })
    : [];

  const submit = (returnId?: string) => {
    if (errors.length || !q) return;
    const l = postLoad({ from, to, goods, pallets, kg, vehicle, pickupAt, mode, express, tailLift, adr });
    if (returnId) bookOnReturn(l.id, returnId);
    router.push(`/${lang}/app/loads?id=${l.id}`);
  };

  const quick = [2, 4, 8].map((h) => ({ label: `+${f.minutes(h * 60)}`, at: Math.ceil((now + h * HOUR) / QUARTER) * QUARTER }));

  return (
    <Page>
      <PageHeader title={d.post.title} lead={d.post.lead} actions={role !== "shipper" ? <Chip tone="accent">{SHIPPER.get(ME.shipperId)?.name}</Chip> : null} />
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_25rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Card className="p-4 sm:p-5">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <PlaceSelect value={from} onChange={setFrom} label={d.common.from} />
              <Button
                variant="ghost"
                size="md"
                aria-label={d.post.swap}
                title={d.post.swap}
                className="justify-self-center"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
              >
                <ArrowDownUp className="size-4 sm:rotate-90" aria-hidden />
              </Button>
              <PlaceSelect value={to} onChange={setTo} label={d.common.to} />
            </div>
            {!same ? <RouteMini from={from} to={to} lang={lang} className="mt-4" /> : null}
          </Card>

          <Card className="space-y-4 p-4 sm:p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={d.post.goods} className="sm:col-span-2">
                <select
                  value={goods}
                  onChange={(e) => {
                    setGoods(e.target.value as GoodsType);
                    setPicked(null);
                  }}
                  className={inputClass}
                >
                  {GOODS.map((g) => (
                    <option key={g} value={g}>
                      {d.goods[g]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={d.post.pallets}>
                <input type="number" inputMode="numeric" min={1} max={33} value={pallets} onChange={(e) => setPallets(Math.max(1, Number(e.target.value) || 1))} className={cn(inputClass, "tnum")} />
              </Field>
              <Field label={d.post.kg}>
                <input type="number" inputMode="numeric" min={1} step={1} value={kg} onChange={(e) => setKg(Math.max(1, Number(e.target.value) || 1))} className={cn(inputClass, "tnum")} />
              </Field>
              {/* A row of its own: a date-time field needs ~230px before it cuts the time off. */}
              <Field label={d.post.pickup} className="sm:col-span-2">
                <input type="datetime-local" value={pickup} onChange={(e) => e.target.value && setPickup(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {quick.map((x) => (
                <button
                  key={x.label}
                  type="button"
                  onClick={() => setPickup(toMadridInput(x.at))}
                  className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink pointer-coarse:py-3"
                >
                  {x.label} · {f.time(x.at)}
                </button>
              ))}
            </div>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.8rem] font-semibold text-ink-2">{d.post.vehicle}</span>
                <Chip tone={vehicle === suggested ? "accent" : "neutral"}>{d.post.suggested.replace("{{v}}", d.vehiclesShort[suggested])}</Chip>
              </div>
              <Segmented value={vehicle} onChange={(v) => setPicked(v)} options={VEHICLE_TYPES.map((v) => ({ value: v, label: d.vehiclesShort[v], title: d.vehicles[v] }))} label={d.post.vehicle} />
              <p className="tnum mt-1.5 text-xs text-ink-3">
                {d.vehicles[vehicle]} · ≤ {n(d.common.palletsN, spec.pallets)} · ≤ {f.kg(spec.kg)}
              </p>
            </div>
            <div>
              <div className="mb-1 text-[0.8rem] font-semibold text-ink-2">{d.post.options}</div>
              {/* One switch per row until there's room for the whole label, surcharge included. */}
              <div className="grid grid-cols-1 gap-0.5 2xl:grid-cols-3">
                <Switch checked={express} onChange={setExpress} label={d.post.express} icon={<Zap className="size-4 text-signal" aria-hidden />} />
                <Switch checked={tailLift} onChange={setTailLift} label={d.post.tailLift} />
                <Switch checked={adr} onChange={setAdr} label={d.post.adr} icon={<CircleAlert className="size-4 text-warn" aria-hidden />} />
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="mb-2 text-[0.8rem] font-semibold text-ink-2">{d.post.mode}</div>
            <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  { v: "bids", icon: Gavel, title: d.post.modeBids, body: d.post.modeBidsDesc },
                  { v: "instant", icon: Zap, title: d.post.modeInstant, body: d.post.modeInstantDesc },
                ] as const
              ).map((m) => (
                <button
                  key={m.v}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.v}
                  onClick={() => setMode(m.v)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition",
                    mode === m.v ? "border-accent bg-accent-soft/60 ring-2 ring-accent/20" : "border-line hover:border-line-strong",
                  )}
                >
                  <m.icon className={cn("mt-0.5 size-5 shrink-0", mode === m.v ? "text-accent-text" : "text-ink-3")} aria-hidden />
                  <span>
                    <span className="block text-sm font-bold text-ink">{m.title}</span>
                    <span className="block text-xs text-ink-3">{m.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
          <Button type="submit" variant="primary" size="lg" disabled={!!errors.length} className="w-full lg:hidden">
            {d.post.submit} {q ? `· ${f.money(q.fair)}` : ""}
          </Button>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="p-4 sm:p-5">
            <SectionTitle>{d.post.quote}</SectionTitle>
            {q ? (
              <>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <div className="tnum text-4xl font-extrabold tracking-tight text-ink">{f.money(q.fair)}</div>
                    <div className="text-xs text-ink-3">{d.common.exVat}</div>
                  </div>
                  <div className="text-right text-xs text-ink-3">
                    <div className="tnum">{d.common.perKm.replace("{{v}}", f.money2(q.fair / Math.max(1, q.route.km)))}</div>
                    <div className="tnum mt-0.5">{d.post.range.replace("{{low}}", f.money(q.low)).replace("{{high}}", f.money(q.high))}</div>
                  </div>
                </div>
                <p className="tnum mt-2 text-sm text-ink-2">
                  {d.post.routeLine.replace("{{km}}", f.km(q.route.km)).replace("{{min}}", f.minutes(q.route.minutes))} · {q.route.roads.join(" → ")}
                </p>
                <div className="mt-4 text-[0.72rem] font-bold tracking-wide text-ink-3 uppercase">{d.post.breakdown}</div>
                <dl className="tnum mt-1.5 space-y-1 text-sm">
                  {(
                    [
                      [d.post.handling, q.breakdown.handling],
                      [d.post.distanceCost, q.breakdown.distance],
                      [d.post.tolls, q.breakdown.tolls],
                      [d.post.border, q.breakdown.border],
                      [d.post.extras, q.breakdown.extras],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className={cn("flex justify-between gap-3", !v && "text-ink-3")}>
                      <dt>{label}</dt>
                      <dd className="font-semibold">{f.money(v)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 space-y-2 border-t border-line pt-3 text-[0.8rem]">
                  <p className="flex items-start gap-2 text-ink-2">
                    <Leaf className="mt-0.5 size-4 shrink-0 text-green" aria-hidden />
                    <span>
                      {d.post.co2Body.replace("{{kg}}", f.num(q.co2Kg, 1))}
                      {ev !== null ? ` · ${d.post.co2Ev.replace("{{kg}}", f.num(ev, 1))}` : ""}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 text-ink-2">
                    <FileCheck className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden />
                    <span>
                      {d.post.doc}: {d.ecmr[needsEcmr({ from, to })]}
                    </span>
                  </p>
                  {touchesZbe({ from, to }) ? (
                    <p className="flex items-start gap-2 text-ink-2">
                      <Leaf className="mt-0.5 size-4 shrink-0 text-green" aria-hidden />
                      <span>{d.post.zbeNote}</span>
                    </p>
                  ) : null}
                  {touchesZfe({ from, to }) ? (
                    <p className="flex items-start gap-2 text-ink-2">
                      <Leaf className="mt-0.5 size-4 shrink-0 text-green" aria-hidden />
                      <span>{d.checks.zfe}</span>
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
            {errors.length ? (
              <ul className="mt-3 space-y-1">
                {errors.map((e) => (
                  <li key={e} className="flex items-start gap-2 text-sm font-semibold text-danger">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {e}
                  </li>
                ))}
              </ul>
            ) : null}
            <Button variant="primary" size="lg" disabled={!!errors.length} onClick={() => submit()} className="mt-4 hidden w-full lg:inline-flex">
              {d.post.submit}
            </Button>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-lime">
              <Repeat className="size-4" aria-hidden />
              {d.post.returnsTitle}
            </div>
            <p className="mt-1 text-xs text-ink-3">{d.post.returnsLead}</p>
            {offers.length && q ? (
              <ul className="mt-3 space-y-2">
                {offers.map((rt) => {
                  const amount = round5(q.fair * (1 - rt.discount));
                  return (
                    <li key={rt.id} className="rounded-xl border border-lime/40 bg-lime-soft/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-ink">{CARRIER.get(rt.carrierId)?.name}</span>
                        <Chip tone="lime">{d.map.discount.replace("{{pct}}", String(Math.round(rt.discount * 100)))}</Chip>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-2">
                        {place(rt.from)} → {place(rt.to)} · {f.time(rt.departAt)} · {n(d.map.freePallets, rt.freePallets)}
                      </p>
                      <Button variant="lime" size="sm" disabled={!!errors.length} onClick={() => submit(rt.id)} className="mt-2 w-full">
                        {d.post.bookReturn.replace("{{amount}}", f.money(amount))}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-line-strong px-3 py-3 text-center text-xs text-ink-3">{d.post.noReturns}</p>
            )}
          </Card>
        </aside>
      </div>
    </Page>
  );
}
