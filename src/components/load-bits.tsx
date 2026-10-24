"use client";

// Pieces of a load shared by the load board, dispatch and the post form.
import { Check, CircleAlert, CircleCheck, FileCheck, Leaf, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { CARRIER, SHIPPER, VEHICLE } from "@/data/companies";
import { route } from "@/data/network";
import { PLACES } from "@/data/places";
import { driveMs } from "@/data/seed";
import type { Bid, EcmrState, Load, ReturnTrip } from "@/data/types";
import { useI18n } from "@/i18n/client";
import { CABOTAGE_LIMIT, CABOTAGE_USED, isCabotage, needsEcmr, touchesZbe, ZBE_OK } from "@/lib/checks";
import { cn } from "@/lib/utils";
import { Chip, Progress, StatusChip } from "./ui";

export function LoadCard({
  load: l,
  bids,
  match,
  now,
  selected,
  onClick,
}: {
  load: Load;
  bids: Bid[];
  match?: ReturnTrip;
  now: number;
  selected?: boolean;
  onClick: () => void;
}) {
  const { d, f, place, n } = useI18n();
  const r = route(l.from, l.to);
  const pending = bids.filter((b) => b.status === "pending").sort((a, b) => a.amount - b.amount);
  const price = l.price ?? l.target;
  const progress = l.status === "inTransit" && l.departedAt ? Math.min(1, (now - l.departedAt) / driveMs(l)) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group block w-full rounded-2xl border bg-surface p-3.5 text-left shadow-card transition hover:border-line-strong",
        selected ? "border-accent ring-2 ring-accent/25" : "border-line",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[0.72rem] font-semibold text-ink-3">{l.id}</span>
            <StatusChip status={l.status} />
            {l.mode === "instant" && l.status === "open" ? <Chip tone="blue">{d.loads.instant}</Chip> : null}
            {l.express ? <Chip tone="signal">{d.loads.express}</Chip> : null}
            {match ? <Chip tone="lime">{d.loads.returnMatch.replace("{{pct}}", String(Math.round(match.discount * 100)))}</Chip> : null}
            {l.returnTripId ? <Chip tone="lime">{d.fleet.returnsTitle}</Chip> : null}
            {l.mine ? <Chip tone="neutral">{d.common.yours}</Chip> : null}
          </div>
          <div className="mt-1.5 truncate text-[0.98rem] font-bold text-ink">
            {place(l.from)} <span className="text-ink-3">→</span> {place(l.to)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[0.75rem] text-ink-3">
            <span className="tnum">{f.km(r.km)}</span>
            <span className="tnum">{f.minutes(r.minutes)}</span>
            <span>{d.goods[l.goods]}</span>
            <span className="tnum">{d.common.palletsN.replace("{{n}}", String(l.pallets))}</span>
            <span>{d.vehiclesShort[l.vehicle]}</span>
            {r.crossesBorder ? <span className="font-semibold text-warn">{d.loads.crossBorder}</span> : null}
            {touchesZbe(l) ? <span className="font-semibold text-green">{d.loads.zbe}</span> : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum text-lg font-extrabold tracking-tight text-ink">{f.money(price)}</div>
          <div className="tnum text-[0.7rem] text-ink-3">{d.common.perKm.replace("{{v}}", f.money2(price / Math.max(1, r.km)))}</div>
        </div>
      </div>
      {progress !== null ? (
        <div className="mt-2.5">
          <Progress value={progress} />
          <div className="tnum mt-1 text-[0.72rem] font-semibold text-signal">
            {d.loads.onRoad.replace("{{pct}}", String(Math.round(progress * 100))).replace("{{t}}", f.time((l.departedAt ?? now) + driveMs(l)))}
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.75rem]">
          <span className="text-ink-2">
            {l.status === "delivered" && l.deliveredAt ? d.loads.deliveredAt.replace("{{t}}", f.rel(l.deliveredAt, now)) : d.loads.pickupAt.replace("{{t}}", f.rel(l.pickupAt, now))}
            <span className="text-ink-3"> · {SHIPPER.get(l.shipperId)?.name}</span>
          </span>
          {l.status === "open" ? (
            <span className="font-semibold text-accent-text">
              {pending.length ? `${n(d.loads.bidsN, pending.length)} · ${d.loads.bestBid.replace("{{amount}}", f.money(pending[0].amount))}` : d.loads.noBids}
            </span>
          ) : l.carrierId ? (
            <span className="truncate font-medium text-ink-2">{CARRIER.get(l.carrierId)?.name}</span>
          ) : null}
        </div>
      )}
    </button>
  );
}

type CheckTone = "ok" | "bad" | "info";

function CheckRow({ tone, icon, children }: { tone: CheckTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[0.8rem] leading-snug">
      <span className={cn("mt-0.5 shrink-0", tone === "ok" ? "text-green" : tone === "bad" ? "text-danger" : "text-blue")}>
        {icon ?? (tone === "bad" ? <CircleAlert className="size-4" aria-hidden /> : <CircleCheck className="size-4" aria-hidden />)}
      </span>
      <span className={cn("min-w-0", tone === "bad" ? "font-semibold text-danger" : "text-ink-2")}>{children}</span>
    </li>
  );
}

/** ZBE, cabotage and the consignment note, for a load and (optionally) the carrier/vehicle on it. */
export function ChecksList({ load, carrierId, vehicleId }: { load: Pick<Load, "from" | "to">; carrierId?: string; vehicleId?: string }) {
  const { d } = useI18n();
  const v = vehicleId ? VEHICLE.get(vehicleId) : undefined;
  const zbe = touchesZbe(load);
  const carrier = carrierId ? CARRIER.get(carrierId) : undefined;
  const cab = isCabotage(load, carrierId);
  const used = carrierId ? (CABOTAGE_USED[carrierId] ?? 0) : 0;
  const doc = needsEcmr(load);
  const crosses = PLACES[load.from].country !== PLACES[load.to].country;
  return (
    <ul className="space-y-1.5">
      {zbe ? (
        v ? (
          ZBE_OK.has(v.eco) ? (
            <CheckRow tone="ok" icon={<Leaf className="size-4" aria-hidden />}>
              {d.checks.zbeOk.replace("{{label}}", v.eco)}
            </CheckRow>
          ) : (
            <CheckRow tone="bad">{d.checks.zbeBad.replace("{{label}}", v.eco)}</CheckRow>
          )
        ) : (
          <CheckRow tone="info" icon={<Leaf className="size-4" aria-hidden />}>
            {d.checks.zbeNeed}
          </CheckRow>
        )
      ) : (
        <CheckRow tone="ok" icon={<Leaf className="size-4" aria-hidden />}>
          {d.checks.zbeNone}
        </CheckRow>
      )}
      {cab && carrier ? (
        used >= CABOTAGE_LIMIT ? (
          <CheckRow tone="bad">{d.checks.cabotageFull.replace("{{carrier}}", carrier.name).replace("{{used}}", String(used))}</CheckRow>
        ) : (
          <CheckRow tone="ok" icon={<ShieldCheck className="size-4" aria-hidden />}>
            {d.checks.cabotageOk.replace("{{carrier}}", carrier.name).replace("{{used}}", String(used))}
          </CheckRow>
        )
      ) : (
        <CheckRow tone="ok" icon={<ShieldCheck className="size-4" aria-hidden />}>
          {d.checks.cabotageNone}
        </CheckRow>
      )}
      {crosses ? (
        <CheckRow tone="info" icon={<ShieldCheck className="size-4" aria-hidden />}>
          {d.checks.border}
        </CheckRow>
      ) : null}
      <CheckRow tone="info" icon={<FileCheck className="size-4" aria-hidden />}>
        {d.checks.doc.replace("{{doc}}", doc === "deca" ? d.ecmr.deca : d.ecmr.ecmr)}
      </CheckRow>
    </ul>
  );
}

const STEPS: EcmrState[] = ["draft", "shipper", "carrier", "delivered"];

/** The electronic consignment note, step by step. */
export function EcmrTimeline({ load }: { load: Pick<Load, "from" | "to" | "ecmr"> }) {
  const { d } = useI18n();
  const doc = needsEcmr(load);
  const at = STEPS.indexOf(load.ecmr);
  const labels = [d.ecmr.stepDraft, d.ecmr.stepShipper, d.ecmr.stepCarrier, d.ecmr.stepConsignee];
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.8rem] font-semibold text-ink">{doc === "deca" ? d.ecmr.deca : d.ecmr.ecmr}</span>
        <span className="text-[0.72rem] text-ink-3">{d.ecmr[load.ecmr]}</span>
      </div>
      <ol className="mt-2.5 grid grid-cols-4 gap-1">
        {labels.map((label, i) => {
          const done = at >= i;
          return (
            <li key={label} className="min-w-0">
              <div className={cn("h-1.5 rounded-full", done ? "bg-accent" : "bg-surface-3")} />
              <div className={cn("mt-1 flex items-center gap-1 truncate text-[0.68rem] font-semibold", done ? "text-accent-text" : "text-ink-3")}>
                {done ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                <span className="truncate">{label}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-3">{d.ecmr.note}</p>
    </div>
  );
}
