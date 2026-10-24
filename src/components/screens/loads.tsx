"use client";

import { ArrowRight, Gavel, MapPin, Repeat, Search, Truck, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { screenIntro } from "@/components/app/intro";
import { Page, PageHeader } from "@/components/app/shell";
import { Feed } from "@/components/feed";
import { blockReason, ChecksList, DemoNote, EcmrTimeline, FictionalTag, labelText, LoadCard, RuleChip, useDeadlines, useRuleCtx } from "@/components/load-bits";
import { RouteMini } from "@/components/route-mini";
import { Button, Card, Chip, EcoBadge, Empty, Field, inputClass, SectionTitle, Segmented, Sheet, StatusChip } from "@/components/ui";
import { CARRIER, DRIVER, ME, SHIPPER, VEHICLE, VEHICLES } from "@/data/companies";
import { CARRIES, eligibleCarriers, fitsReturn } from "@/data/seed";
import type { Bid, Load, ReturnTrip, VehicleType } from "@/data/types";
import { useI18n } from "@/i18n/client";
import { runVerdict } from "@/lib/cabotage";
import { hasDgtLabel } from "@/lib/checks";
import { fromMadridInput, toMadridInput } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { useMedia } from "@/lib/use-media";
import { cn } from "@/lib/utils";
import { useMarket } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";

type Tab = "open" | "active" | "done" | "all" | "returns";
type Sort = "pickup" | "price" | "km";
const VEHICLE_TYPES: VehicleType[] = ["van", "rigid", "artic", "reefer", "flatbed"];
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const round5 = (v: number) => Math.round(v / 5) * 5;

/** The best open return trip a load fits on, per load. */
export function useReturnMatches(loads: Load[], returns: ReturnTrip[]) {
  return useMemo(() => {
    const m = new Map<string, ReturnTrip>();
    const open = returns.filter((r) => r.status === "open");
    for (const l of loads) {
      if (l.status !== "open") continue;
      for (const rt of open) {
        const v = VEHICLE.get(rt.vehicleId);
        if (v && fitsReturn(l, rt, v.type) && (!m.has(l.id) || m.get(l.id)!.discount < rt.discount)) m.set(l.id, rt);
      }
    }
    return m;
  }, [loads, returns]);
}

export function LoadBoard() {
  const { d, place, n } = useI18n();
  const role = useMarket((s) => s.role);
  const loads = useMarket((s) => s.loads);
  const bids = useMarket((s) => s.bids);
  const returns = useMarket((s) => s.returns);
  const now = useSimNow();
  const wide = useMedia("(min-width: 1024px)");
  // useSearchParams, not window.location: after a client-side navigation
  // (Post load, the map's "Open in load board") the browser URL is only updated after this first render.
  const params = useSearchParams();

  const [selected, setSelected] = useState<string | null>(() => params.get("id"));
  const [tab, setTab] = useState<Tab>(() => {
    const l = selected ? useMarket.getState().loads.find((x) => x.id === selected) : undefined;
    return !l || l.status === "open" ? "open" : "all";
  });
  const [vehicle, setVehicle] = useState<VehicleType | "any">("any");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("pickup");

  const bidsBy = useMemo(() => {
    const m = new Map<string, Bid[]>();
    for (const b of bids) m.set(b.loadId, [...(m.get(b.loadId) ?? []), b]);
    return m;
  }, [bids]);
  const matches = useReturnMatches(loads, returns);

  const isMine = (l: Load) =>
    role === "shipper"
      ? l.shipperId === ME.shipperId
      : role === "carrier"
        ? l.carrierId === ME.carrierId || (bidsBy.get(l.id) ?? []).some((b) => b.mine)
        : l.shipperId === ME.shipperId || l.carrierId === ME.carrierId;

  const counts = {
    open: loads.filter((l) => l.status === "open").length,
    active: loads.filter((l) => l.status === "booked" || l.status === "assigned" || l.status === "inTransit").length,
    done: loads.filter((l) => l.status === "delivered" || l.status === "cancelled").length,
    all: loads.length,
    returns: matches.size,
  };

  let list = loads.filter((l) =>
    tab === "open"
      ? l.status === "open"
      : tab === "active"
        ? l.status === "booked" || l.status === "assigned" || l.status === "inTransit"
        : tab === "done"
          ? l.status === "delivered" || l.status === "cancelled"
          : tab === "returns"
            ? matches.has(l.id)
            : true,
  );
  if (vehicle !== "any") list = list.filter((l) => l.vehicle === vehicle);
  if (mine) list = list.filter(isMine);
  if (q.trim()) {
    const needle = norm(q.trim());
    list = list.filter((l) =>
      [l.id, place(l.from), place(l.to), SHIPPER.get(l.shipperId)?.name ?? "", l.carrierId ? (CARRIER.get(l.carrierId)?.name ?? "") : "", d.goods[l.goods]].some((s) => norm(s).includes(needle)),
    );
  }
  list = [...list].sort((a, b) =>
    sort === "price" ? (b.price ?? b.target) - (a.price ?? a.target) : sort === "km" ? quote(b).route.km - quote(a).route.km : tab === "done" ? (b.deliveredAt ?? 0) - (a.deliveredAt ?? 0) : a.pickupAt - b.pickupAt,
  );

  const pick = (id: string | null) => {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("id", id);
    else url.searchParams.delete("id");
    window.history.replaceState(window.history.state, "", url);
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: "open", label: `${d.loads.tabOpen} · ${counts.open}` },
    { value: "returns", label: `${d.loads.tabReturns} · ${counts.returns}` },
    { value: "active", label: `${d.loads.tabActive} · ${counts.active}` },
    { value: "done", label: `${d.loads.tabDone} · ${counts.done}` },
    { value: "all", label: `${d.loads.tabAll} · ${counts.all}` },
  ];

  return (
    <Page>
      {/* The shell shows the title while the market starts (intro.ts); the lead counts the open loads. */}
      <PageHeader title={screenIntro("loads", d, place).title} lead={n(d.loads.lead, counts.open)} />
      <div className="mt-4 flex flex-col gap-2.5">
        <Segmented value={tab} onChange={setTab} options={tabs} label={d.loads.title} className="self-start" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={d.loads.searchPh} className={cn(inputClass, "pl-9")} aria-label={d.common.search} />
          </label>
          <select value={vehicle} onChange={(e) => setVehicle(e.target.value as VehicleType | "any")} className={cn(inputClass, "w-auto")} aria-label={d.common.vehicle}>
            <option value="any">{d.loads.anyVehicle}</option>
            {VEHICLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {d.vehicles[v]}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={cn(inputClass, "w-auto")} aria-label={d.loads.sort}>
            <option value="pickup">{d.loads.sortPickup}</option>
            <option value="price">{d.loads.sortPrice}</option>
            <option value="km">{d.loads.sortKm}</option>
          </select>
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => setMine((m) => !m)}
            className={cn(
              "h-10 rounded-xl border px-3 text-sm font-semibold transition",
              mine ? "border-accent bg-accent-soft text-accent-text" : "border-line-strong bg-surface text-ink-2 hover:text-ink",
            )}
          >
            {d.loads.mineOnly}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_27rem] xl:grid-cols-[minmax(0,1fr)_30rem]">
        <div className="space-y-2.5">
          {list.length ? (
            list.map((l) => <LoadCard key={l.id} load={l} bids={bidsBy.get(l.id) ?? []} match={matches.get(l.id)} now={now} selected={l.id === selected} onClick={() => pick(l.id)} />)
          ) : (
            <Empty icon={<Truck className="size-6" aria-hidden />}>{d.loads.empty}</Empty>
          )}
        </div>
        {wide ? (
          <aside className="sticky top-4 self-start">
            <Card className="max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-thin">
              {selected ? <LoadDetail id={selected} onClose={() => pick(null)} /> : <Empty className="m-4 border-none">{d.loads.selectPrompt}</Empty>}
            </Card>
          </aside>
        ) : null}
      </div>
      {!wide ? (
        <Sheet open={!!selected} onClose={() => pick(null)} title={selected ?? ""}>
          {selected ? <LoadDetail id={selected} onClose={() => pick(null)} inSheet /> : null}
        </Sheet>
      ) : null}
    </Page>
  );
}

export function LoadDetail({ id, onClose, inSheet }: { id: string; onClose: () => void; inSheet?: boolean }) {
  const { lang, d, f, place } = useI18n();
  const role = useMarket((s) => s.role);
  const l = useMarket((s) => s.loads.find((x) => x.id === id));
  const allBids = useMarket((s) => s.bids);
  const returns = useMarket((s) => s.returns);
  const acceptBid = useMarket((s) => s.acceptBid);
  const bookInstant = useMarket((s) => s.bookInstant);
  const bookOnReturn = useMarket((s) => s.bookOnReturn);
  const cancelLoad = useMarket((s) => s.cancelLoad);
  const now = useSimNow();
  const rules = useRuleCtx();
  const { day } = useDeadlines();

  if (!l) return <Empty className="m-4">{d.loads.empty}</Empty>;
  const qt = quote({ from: l.from, to: l.to, vehicle: l.vehicle, express: l.express, tailLift: l.tailLift, adr: l.adr }, !!(l.vehicleId && VEHICLE.get(l.vehicleId)?.electric));
  const r = qt.route;
  const bids = allBids.filter((b) => b.loadId === l.id).sort((a, b) => a.amount - b.amount);
  const open = l.status === "open";
  const shipperMine = l.shipperId === ME.shipperId;
  const canAccept = role === "shipper" && shipperMine && open;
  const v = l.vehicleId ? VEHICLE.get(l.vehicleId) : undefined;
  const offers = open
    ? returns.filter((rt) => {
        const rv = VEHICLE.get(rt.vehicleId);
        return rv && fitsReturn(l, rt, rv.type);
      })
    : [];
  const price = l.price ?? l.target;
  // Someone must be able to run it legally before the instant price can be booked.
  const bookable = !open || eligibleCarriers(l, { ...rules, at: l.pickupAt }).length > 0;

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-xs font-semibold text-ink-3">{l.id}</span>
            <StatusChip status={l.status} />
            {l.mode === "instant" && open ? <Chip tone="blue">{d.loads.instant}</Chip> : null}
            {l.express ? <Chip tone="signal">{d.loads.express}</Chip> : null}
            {l.tailLift ? <Chip>{d.loads.tailLift}</Chip> : null}
            {l.adr ? <Chip tone="warn">{d.loads.adr}</Chip> : null}
          </div>
          <h2 className="mt-1.5 text-lg leading-tight font-extrabold text-ink">
            {place(l.from)} → {place(l.to)}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
            {SHIPPER.get(l.shipperId)?.name}
            <FictionalTag />
          </p>
        </div>
        {!inSheet ? (
          <button type="button" onClick={onClose} aria-label={d.common.close} className="rounded-lg p-1.5 text-ink-3 transition hover:bg-surface-2 hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div>
        <RouteMini from={l.from} to={l.to} lang={lang} />
        <dl className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          <Fact label={d.common.distance} value={f.km(r.km)} />
          <Fact label={d.common.drive} value={f.minutes(r.minutes)} />
          <Fact label={d.common.co2} value={f.kg(qt.co2Kg)} />
        </dl>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
          <MapPin className="size-3.5" aria-hidden />
          {d.loads.via.replace("{{roads}}", r.roads.join(" → "))}
          {r.tollKm ? <span>· {d.common.tollKm.replace("{{km}}", f.num(r.tollKm, 1))}</span> : null}
          {r.crossesBorder ? <span className="font-semibold text-warn">· {d.common.border}</span> : null}
        </p>
      </div>

      <div>
        <SectionTitle>{d.loads.load}</SectionTitle>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label={d.common.goods} value={d.goods[l.goods]} />
          <Row label={d.common.vehicle} value={d.vehicles[l.vehicle]} />
          <Row label={d.common.pallets} value={String(l.pallets)} />
          <Row label={d.common.weight} value={f.kg(l.kg)} />
          <Row label={d.loads.pickupWindow} value={`${f.dayTime(l.pickupAt)} · ${f.rel(l.pickupAt, now)}`} />
          <Row label={d.common.deliverBy} value={f.dayTime(l.deliverBy)} />
        </dl>
      </div>

      <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[0.75rem] font-semibold text-ink-3">{l.price ? d.loads.agreed : d.common.instantPrice}</div>
            <div className="tnum text-2xl font-extrabold tracking-tight text-ink">{f.money(price)}</div>
            <div className="text-[0.7rem] text-ink-3">{d.common.exVat}</div>
          </div>
          <div className="text-right text-xs text-ink-3">
            <div className="tnum">{d.common.perKm.replace("{{v}}", f.money2(price / Math.max(1, r.km)))}</div>
            <div className="tnum mt-0.5 whitespace-nowrap">{d.loads.fairRange.replace("{{low}}", f.money(qt.low)).replace("{{high}}", f.money(qt.high))}</div>
          </div>
        </div>
        <DemoNote className="mt-1 text-[0.7rem]" />
        {open && (role === "shipper" || role === "dispatcher") && (shipperMine || role === "dispatcher") ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={l.mode === "instant" ? "primary" : "secondary"} disabled={!bookable} onClick={() => bookInstant(l.id)} className="flex-1">
              {d.loads.bookNow.replace("{{amount}}", f.money(l.target))}
            </Button>
            {shipperMine ? (
              <Button variant="danger" onClick={() => cancelLoad(l.id)}>
                {d.loads.cancelLoad}
              </Button>
            ) : null}
          </div>
        ) : null}
        {open && role === "shipper" && !shipperMine ? <p className="mt-2 text-xs text-ink-3">{d.loads.notYours}</p> : null}
        {!bookable && (role === "shipper" || role === "dispatcher") ? <p className="mt-2 text-xs font-semibold text-danger">{d.loads.noLegalCarrier}</p> : null}
      </div>

      {offers.length && role !== "carrier" ? (
        <div className="rounded-2xl border border-lime/40 bg-lime-soft p-3.5">
          <div className="flex items-center gap-2 text-sm font-bold text-lime">
            <Repeat className="size-4" aria-hidden />
            {d.loads.returnTitle}
          </div>
          <ul className="mt-2 space-y-2">
            {offers.map((rt) => {
              const amount = round5(l.target * (1 - rt.discount));
              const rv = VEHICLE.get(rt.vehicleId);
              const verdict = rv ? runVerdict(l, rv, rules.loads, rules) : null;
              const reason = verdict ? blockReason(verdict, d, day) : null;
              return (
                <li key={rt.id} className="flex flex-wrap items-center gap-2 text-[0.8rem]">
                  <span className="min-w-0 flex-1 text-ink-2">
                    {d.loads.returnBody
                      .replace("{{carrier}}", CARRIER.get(rt.carrierId)?.name ?? "")
                      .replace("{{from}}", place(rt.from))
                      .replace("{{to}}", place(rt.to))
                      .replace("{{t}}", f.rel(rt.departAt, now))}{" "}
                    <FictionalTag className="text-ink-2" />
                    {reason ? <span className="mt-0.5 block font-semibold text-danger">{d.loads.blocked.replace("{{reason}}", reason)}</span> : null}
                  </span>
                  <span className="text-right">
                    {(role === "shipper" && shipperMine) || role === "dispatcher" ? (
                      <Button size="sm" variant="lime" disabled={!!reason} onClick={() => bookOnReturn(l.id, rt.id)}>
                        {d.loads.bookReturn.replace("{{amount}}", f.money(amount))}
                      </Button>
                    ) : (
                      <Chip tone="lime">{f.money(amount)}</Chip>
                    )}
                    {/* ink-2: ink-3 is below 4.5:1 on the lime panel in dark mode. */}
                    <DemoNote short className="mt-0.5 text-ink-2" />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {role === "carrier" && open ? <BidForm key={l.id} load={l} /> : null}
      {(role === "dispatcher" || (role === "carrier" && l.carrierId === ME.carrierId)) && !open ? <DispatchActions load={l} /> : null}

      <div>
        <SectionTitle aside={<span className="text-xs text-ink-3">{bids.length}</span>}>{d.loads.bidsTitle}</SectionTitle>
        {bids.length ? <p className="mt-1 text-[0.72rem] text-ink-3">{d.loads.bidsDemo}</p> : null}
        {bids.length ? (
          <ul className="mt-2 space-y-2">
            {bids.map((b) => (
              <BidRow key={b.id} bid={b} load={l} canAccept={canAccept && b.status === "pending"} onAccept={() => acceptBid(b.id)} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-3">{d.loads.noBids}</p>
        )}
        {open && role !== "carrier" && role !== "shipper" ? <p className="mt-2 text-xs text-ink-3">{d.loads.carrierHint}</p> : null}
        {open && role !== "shipper" && bids.some((b) => b.status === "pending") ? <p className="mt-1 text-xs text-ink-3">{d.loads.shipperOnly}</p> : null}
      </div>

      <div>
        <SectionTitle>{d.checks.title}</SectionTitle>
        <div className="mt-2">
          <ChecksList load={l} carrierId={l.carrierId} vehicleId={l.vehicleId} />
        </div>
      </div>

      {v ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-sm">
          <Truck className="size-4 text-signal" aria-hidden />
          <span className="font-mono font-semibold text-ink">{v.plate}</span>
          {hasDgtLabel(v) ? <EcoBadge label={v.eco} /> : null}
          <span className="min-w-0 truncate text-ink-3">
            {DRIVER.get(v.driverId)?.name} · {CARRIER.get(v.carrierId)?.name}
          </span>
          <FictionalTag />
        </div>
      ) : null}

      {l.status !== "open" && l.status !== "cancelled" ? (
        <div>
          <SectionTitle>{d.ecmr.title}</SectionTitle>
          <div className="mt-2">
            <EcmrTimeline load={l} />
          </div>
        </div>
      ) : null}

      <div>
        <SectionTitle>{d.loads.activity}</SectionTitle>
        <div className="mt-1 -mx-4">
          <Feed filter={(e) => e.loadId === l.id} limit={8} />
        </div>
      </div>
      <Link href={`/${lang}/app?focus=${l.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline">
        {d.nav.map}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-1.5">
      <dt className="text-[0.68rem] font-semibold text-ink-3">{label}</dt>
      <dd className="tnum text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.72rem] text-ink-3">{label}</dt>
      <dd className="truncate font-semibold text-ink">{value}</dd>
    </div>
  );
}

function BidRow({ bid, load, canAccept, onAccept }: { bid: Bid; load: Load; canAccept: boolean; onAccept: () => void }) {
  const { d, f } = useI18n();
  const rules = useRuleCtx();
  const { day } = useDeadlines();
  const c = CARRIER.get(bid.carrierId);
  const v = VEHICLE.get(bid.vehicleId);
  // The rules apply to the vehicle in the bid, at the pickup it offers.
  const verdict = v && bid.status === "pending" ? runVerdict({ ...load, pickupAt: bid.pickupEta }, v, rules.loads, rules) : null;
  const reason = verdict ? blockReason(verdict, d, day) : null;
  return (
    <li
      className={cn(
        "rounded-xl border px-3 py-2.5",
        bid.mine ? "border-accent/50 bg-accent-soft/50" : "border-line",
        bid.status === "rejected" && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-bold text-ink">{c?.name}</span>
            <span className="text-[0.7rem] font-semibold text-ink-3">
              {c?.country} · {c ? f.num(c.rating, 1) : ""} ★
            </span>
            <FictionalTag />
            {bid.mine ? <Chip tone="accent">{d.loads.yourBid}</Chip> : null}
            {verdict ? <RuleChip verdict={verdict} /> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.72rem] text-ink-3">
            {v ? (
              <>
                {hasDgtLabel(v) ? <EcoBadge label={v.eco} className="h-4 min-w-4 px-1 text-[0.55rem]" /> : null}
                <span>{d.vehiclesShort[v.type]}</span>
                <span className="font-mono">{v.plate}</span>
              </>
            ) : null}
            <span>· {d.loads.pickupEta} {f.time(bid.pickupEta)}</span>
          </div>
          {bid.note ? <p className="mt-1 text-[0.75rem] text-ink-2 italic">“{bid.note}”</p> : null}
          {reason ? <p className="mt-1 text-[0.72rem] font-semibold text-danger">{d.loads.blocked.replace("{{reason}}", reason)}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum text-base font-extrabold text-ink">{f.money(bid.amount)}</div>
          <DemoNote short />
          {bid.status === "accepted" ? (
            <Chip tone="green">{d.loads.accepted}</Chip>
          ) : bid.status === "rejected" ? (
            <Chip>{d.loads.declined}</Chip>
          ) : canAccept ? (
            <Button size="sm" variant="primary" disabled={!!reason} onClick={onAccept} className="mt-1">
              {d.loads.accept}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function BidForm({ load }: { load: Load }) {
  const { d, f } = useI18n();
  const bids = useMarket((s) => s.bids);
  const loads = useMarket((s) => s.loads);
  const placeBid = useMarket((s) => s.placeBid);
  const bookInstant = useMarket((s) => s.bookInstant);
  const rules = useRuleCtx();
  const { day } = useDeadlines();
  const busy = new Set(loads.filter((l) => (l.status === "assigned" || l.status === "inTransit") && l.vehicleId).map((l) => l.vehicleId));
  const fleet = VEHICLES.filter((v) => v.carrierId === ME.carrierId && CARRIES[v.type].includes(load.vehicle));
  // Licence, tachograph and cabotage, vehicle by vehicle: a blocked vehicle can't be bid.
  const blocked = new Map(fleet.map((v) => [v.id, blockReason(runVerdict(load, v, rules.loads, rules), d, day)]));
  const allowed = (id: string) => !blocked.get(id);
  const existing = bids.find((b) => b.loadId === load.id && b.mine && b.status === "pending");
  const qt = quote({ from: load.from, to: load.to, vehicle: load.vehicle, express: load.express, tailLift: load.tailLift, adr: load.adr });
  const [amount, setAmount] = useState(existing?.amount ?? round5(load.target * 0.95));
  const [vehicleId, setVehicleId] = useState(existing?.vehicleId ?? (fleet.find((v) => !busy.has(v.id) && allowed(v.id)) ?? fleet.find((v) => allowed(v.id)) ?? fleet[0])?.id ?? "");
  const [eta, setEta] = useState(toMadridInput(existing?.pickupEta ?? load.pickupAt));
  const [note, setNote] = useState(existing?.note ?? "");
  const reason = vehicleId ? blocked.get(vehicleId) : null;
  const anyAllowed = fleet.some((v) => allowed(v.id));

  if (!fleet.length)
    return (
      <Card className="p-3.5 text-sm text-ink-3 shadow-none">
        <Gavel className="mb-1 size-4" aria-hidden />
        {d.loads.noVehicle}
      </Card>
    );

  return (
    <form
      className="space-y-3 rounded-2xl border border-accent/40 bg-accent-soft/40 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount > 0 && vehicleId && !reason) placeBid(load.id, amount, vehicleId, fromMadridInput(eta), note.trim() || undefined);
      }}
    >
      <div className="flex items-center gap-2 text-sm font-bold text-accent-text">
        <Gavel className="size-4" aria-hidden />
        {existing ? d.loads.yourBid : d.loads.placeBid}
      </div>
      <Field
        label={d.loads.amount}
        hint={amount < qt.low ? <span className="text-green">{d.loads.lowBid}</span> : amount > qt.high ? <span className="text-warn">{d.loads.highBid}</span> : d.loads.fairRange.replace("{{low}}", f.money(qt.low)).replace("{{high}}", f.money(qt.high))}
      >
        <input type="number" inputMode="numeric" min={1} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={cn(inputClass, "tnum font-bold")} />
      </Field>
      {/* A row of its own: a date-time field needs ~230px before it cuts the time off. */}
      <Field label={d.loads.pickupEta}>
        <input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} className={inputClass} />
      </Field>
      <Field label={d.loads.yourVehicle}>
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
          {fleet.map((v) => (
            <option key={v.id} value={v.id} disabled={!allowed(v.id)}>
              {v.plate} · {d.vehiclesShort[v.type]}
              {hasDgtLabel(v) ? ` · ${labelText(v.eco, d)}` : ""} · {DRIVER.get(v.driverId)?.name}
              {busy.has(v.id) ? ` (${d.loads.vehicleBusy})` : ""}
              {blocked.get(v.id) ? ` (${blocked.get(v.id)})` : ""}
            </option>
          ))}
        </select>
      </Field>
      {reason ? <p className="-mt-1 text-[0.75rem] font-semibold text-danger">{d.loads.blocked.replace("{{reason}}", reason)}</p> : null}
      <Field label={d.loads.note}>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={d.loads.notePh} className={inputClass} maxLength={140} />
      </Field>
      <ChecksList load={load} carrierId={ME.carrierId} vehicleId={vehicleId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={!!reason} className="flex-1">
          {existing ? d.loads.updateBid : d.loads.sendBid}
        </Button>
        {load.mode === "instant" ? (
          <Button variant="secondary" disabled={!anyAllowed} onClick={() => bookInstant(load.id)}>
            {d.loads.takeNow.replace("{{amount}}", f.money(load.target))}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function DispatchActions({ load }: { load: Load }) {
  const { d } = useI18n();
  const rules = useRuleCtx();
  const { day } = useDeadlines();
  const loads = useMarket((s) => s.loads);
  const assignVehicle = useMarket((s) => s.assignVehicle);
  const advance = useMarket((s) => s.advance);
  const busy = new Set(loads.filter((l) => l.id !== load.id && (l.status === "assigned" || l.status === "inTransit") && l.vehicleId).map((l) => l.vehicleId));
  const fleet = VEHICLES.filter((v) => v.carrierId === load.carrierId && CARRIES[v.type].includes(load.vehicle));
  // Only a free truck that may legally run the job can be picked (licence, tachograph, cabotage); if the chosen
  // one gets another job or becomes blocked meanwhile, fall back to the first usable one.
  const blocked = new Map(fleet.map((v) => [v.id, blockReason(runVerdict(load, v, rules.loads, rules), d, day)]));
  const usable = (id: string) => !busy.has(id) && !blocked.get(id);
  const [picked, setPicked] = useState<string | null>(null);
  // Booked: the truck you pick, else the one the market planned on it (while it is free and allowed), else the first
  // usable one. Once assigned, its own truck.
  const planned = load.vehicleId && usable(load.vehicleId) ? load.vehicleId : undefined;
  const vehicleId = load.status !== "booked" ? (load.vehicleId ?? "") : ((picked && usable(picked) ? picked : undefined) ?? planned ?? fleet.find((v) => usable(v.id))?.id ?? "");
  // Nothing usable because of the rules: say why.
  const reason = load.status === "booked" && !vehicleId ? (fleet.map((v) => blocked.get(v.id)).find(Boolean) ?? null) : null;
  if (load.status === "delivered" || load.status === "cancelled") return null;
  return (
    <div className="space-y-2.5 rounded-2xl border border-warn/40 bg-warn-soft/50 p-3.5">
      <div className="flex items-center gap-2 text-sm font-bold text-warn">
        <Truck className="size-4" aria-hidden />
        {d.loads.dispatchTitle}
      </div>
      {load.status === "booked" ? (
        <div className="flex flex-wrap gap-2">
          <select value={vehicleId} onChange={(e) => setPicked(e.target.value)} className={cn(inputClass, "min-w-0 flex-1")} aria-label={d.common.vehicle}>
            {/* Every truck is on a job: show a dash rather than a blank box until one comes back. */}
            {vehicleId ? null : (
              <option value="" disabled hidden>
                —
              </option>
            )}
            {fleet.map((v) => (
              <option key={v.id} value={v.id} disabled={busy.has(v.id) || !!blocked.get(v.id)}>
                {v.plate} · {d.vehiclesShort[v.type]}
                {hasDgtLabel(v) ? ` · ${labelText(v.eco, d)}` : ""}
                {busy.has(v.id) ? ` (${d.loads.vehicleBusy})` : ""}
                {blocked.get(v.id) ? ` (${blocked.get(v.id)})` : ""}
              </option>
            ))}
          </select>
          <Button variant="primary" disabled={!vehicleId} onClick={() => assignVehicle(load.id, vehicleId)}>
            {d.loads.assign}
          </Button>
        </div>
      ) : null}
      {reason ? <p className="text-[0.75rem] font-semibold text-danger">{d.loads.blocked.replace("{{reason}}", reason)}</p> : null}
      {load.status === "assigned" ? (
        <Button variant="primary" onClick={() => advance(load.id)} className="w-full">
          {d.loads.depart}
        </Button>
      ) : null}
      {load.status === "inTransit" ? (
        <Button variant="primary" onClick={() => advance(load.id)} className="w-full">
          {d.loads.deliver}
        </Button>
      ) : null}
      {vehicleId ? <ChecksList load={load} carrierId={load.carrierId} vehicleId={vehicleId} /> : null}
    </div>
  );
}
