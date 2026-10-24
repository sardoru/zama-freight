"use client";

// Pieces of a load shared by the load board, dispatch, fleet and the post
// form: the load card, the rule checks, the consignment note and the labels
// that keep demo prices and invented companies from passing as real.
import { Check, CircleAlert, CircleCheck, FileCheck, Leaf, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { CARRIER, SHIPPER, VEHICLE } from "@/data/companies";
import { route } from "@/data/network";
import { PLACES } from "@/data/places";
import { driveMs } from "@/data/seed";
import type { Bid, Country, EcmrState, EcoLabel, Load, ReturnTrip, Vehicle } from "@/data/types";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dict } from "@/i18n/types";
import { CABOTAGE_LIMIT, runVerdict, type RunVerdict } from "@/lib/cabotage";
import { hasDgtLabel, jobScope, licenceLocalName, needsPostingDeclaration, touchesZbe, touchesZfe, transportDocument, ZBE_PHASE2, zbeFor, type DocKind } from "@/lib/checks";
import { TZ } from "@/lib/format";
import { cn, fill } from "@/lib/utils";
import { useMarket } from "@/store/market";
import { useSimNow } from "@/store/use-sim-now";
import { Chip, Progress, StatusChip } from "./ui";

// ── Small helpers ───────────────────────────────────────────────────────────

/** The DGT label as text ("C", "B", or "no label"). */
export const labelText = (eco: EcoLabel, d: Dict) => (eco === "none" ? d.common.labelNone : eco);

export const docName = (kind: DocKind, d: Dict) => ({ deca: d.ecmr.deca, cmr: d.ecmr.cmr, lettre: d.ecmr.lettre })[kind];

export const whereText = (country: Country | undefined, d: Dict) => (country === "FR" ? d.checks.inFR : d.checks.inES);

const EU_MONTHS = ["urt.", "ots.", "mar.", "api.", "mai.", "eka.", "uzt.", "abu.", "ira.", "urr.", "aza.", "abe."];
const madridYmd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * Deadlines: "Fri 31 Oct", or with the year for far dates. Basque is spelt out
 * by hand ("2027 abe. 16"): browsers print "17(a)" or "M12" for it.
 */
function deadlineFmt(lang: Locale) {
  const make = (opts: Intl.DateTimeFormatOptions, withYear: boolean) => {
    const fmt = new Intl.DateTimeFormat(INTL_LOCALE[lang], { ...opts, timeZone: TZ });
    if (lang !== "eu") return (t: number) => fmt.format(t);
    return (t: number) => {
      const [y, m, d] = madridYmd.format(t).split("-").map(Number);
      return `${withYear ? `${y} ` : ""}${EU_MONTHS[m - 1]} ${d}`;
    };
  };
  return { day: make({ weekday: "short", day: "numeric", month: "short" }, false), date: make({ day: "numeric", month: "short", year: "numeric" }, true) };
}

export function useDeadlines() {
  const { lang } = useI18n();
  return useMemo(() => deadlineFmt(lang), [lang]);
}

/** What the rule checks need: the loads, the market time, and the cabotage ledger's anchor and pruned jobs (the director uses the same). */
export function useRuleCtx() {
  const loads = useMarket((s) => s.loads);
  const anchor = useMarket((s) => s.anchor);
  const past = useMarket((s) => s.ledger);
  const now = useSimNow();
  return { loads, now, anchor, past };
}

type RuleJob = Pick<Load, "id" | "from" | "to" | "pickupAt"> & Partial<Pick<Load, "departedAt">>;

/** Why a vehicle can't take a job, in a few words; null when it can. */
export function blockReason(v: RunVerdict, d: Dict, day: (t: number) => string): string | null {
  const out: string[] = [];
  if (v.licence.includes("communityLicence")) out.push(d.loads.reasonLicence);
  if (v.licence.includes("tachograph")) out.push(d.loads.reasonTachograph);
  const c = v.cabotage;
  if (c.block === "coolingOff" && c.coolingOffUntil) out.push(d.loads.reasonCooling.replace("{{date}}", day(c.coolingOffUntil)));
  else if (c.block === "noIncoming") out.push(d.loads.reasonNoIncoming);
  else if (c.block === "window") out.push(d.loads.reasonWindow);
  else if (c.block === "limit") out.push(d.loads.reasonLimit);
  return out.length ? out.join(", ") : null;
}

/** "Demo estimate, not a market rate" under a price (short form in dense rows). */
export function DemoNote({ short, className }: { short?: boolean; className?: string }) {
  const { d } = useI18n();
  return <span className={cn("block text-[0.65rem] leading-tight font-medium text-ink-3", className)}>{short ? d.common.demoShort : d.common.demoEstimate}</span>;
}

/** Marks an invented company. */
export function FictionalTag({ className }: { className?: string }) {
  const { d } = useI18n();
  return <span className={cn("inline-flex shrink-0 items-center rounded-full border border-line px-1.5 text-[0.62rem] leading-4 font-semibold text-ink-3", className)}>{d.common.fictional}</span>;
}

/** The cabotage / licence chip of a bid or offer. */
export function RuleChip({ verdict }: { verdict: RunVerdict }) {
  const { d } = useI18n();
  if (verdict.licence.length) return <Chip tone="danger">{d.loads.notEligible}</Chip>;
  const c = verdict.cabotage;
  if (!c.cabotage) return null;
  const used = c.block === "limit" ? CABOTAGE_LIMIT : c.block ? c.used : c.used + 1;
  return <Chip tone={c.block ? "danger" : "warn"}>{fill(d.checks.cabotageChip, { used, limit: CABOTAGE_LIMIT })}</Chip>;
}

// ── The load card ───────────────────────────────────────────────────────────

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
          <div className="mt-1.5 text-[0.98rem] leading-snug font-bold text-pretty text-ink">
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
          {/* Narrow, so it wraps rather than squeezing the route on phones. */}
          <DemoNote short className="ml-auto max-w-[4.75rem]" />
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

// ── The checks ──────────────────────────────────────────────────────────────

type CheckTone = "ok" | "warn" | "bad" | "info";

const CHECK_ICON: Record<CheckTone, string> = { ok: "text-green", warn: "text-warn", bad: "text-danger", info: "text-blue" };

function CheckRow({ tone, icon, children }: { tone: CheckTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[0.8rem] leading-snug">
      <span className={cn("mt-0.5 shrink-0", CHECK_ICON[tone])}>
        {icon ??
          (tone === "bad" ? (
            <CircleAlert className="size-4" aria-hidden />
          ) : tone === "warn" ? (
            <TriangleAlert className="size-4" aria-hidden />
          ) : (
            <CircleCheck className="size-4" aria-hidden />
          ))}
      </span>
      <span className={cn("min-w-0", tone === "bad" ? "font-semibold text-danger" : tone === "warn" ? "font-medium text-warn" : "text-ink-2")}>{children}</span>
    </li>
  );
}

/**
 * Low-emission zones, licence, cabotage, posting and the transport document,
 * for a load and (optionally) the carrier and vehicle that would run it. Rules
 * change with the date (the ZBE's phase 2), so they're checked at the load's
 * own time on the market clock.
 */
export function ChecksList({ load, carrierId, vehicleId }: { load: RuleJob; carrierId?: string; vehicleId?: string }) {
  const { d } = useI18n();
  const { day, date } = useDeadlines();
  const ctx = useRuleCtx();
  const v: Vehicle | undefined = vehicleId ? VEHICLE.get(vehicleId) : undefined;
  const carrier = CARRIER.get(carrierId ?? v?.carrierId ?? "");
  const at = load.departedAt ?? load.pickupAt;
  const scope = carrier ? jobScope(load, carrier.country) : null;
  const verdict = v ? runVerdict(load, v, ctx.loads, ctx) : null;
  const zbe = v ? zbeFor(load, v, at) : null;
  const doc = transportDocument(load, { at, vehicle: v, carrierCountry: carrier?.country });
  const crosses = PLACES[load.from].country !== PLACES[load.to].country;
  const leaf = <Leaf className="size-4" aria-hidden />;
  const shield = <ShieldCheck className="size-4" aria-hidden />;

  const cab = verdict?.cabotage;
  const where = whereText(PLACES[load.from].country, d);
  const lastDay = date(ZBE_PHASE2 - 1);
  return (
    <ul className="space-y-1.5">
      {!touchesZbe(load) ? null : !v || !zbe ? (
        <CheckRow tone="info" icon={leaf}>
          {fill(d.checks.zbeNeed, { date: lastDay })}
        </CheckRow>
      ) : !hasDgtLabel(v) ? (
        // Foreign plates carry no DGT label: the city's authorisation (art. 9) replaces it.
        <CheckRow tone="warn">{d.checks.zbeForeign}</CheckRow>
      ) : zbe.status === "banned" ? (
        <CheckRow tone="bad">{v.eco === "none" ? d.checks.zbeBannedNone : fill(d.checks.zbeBad, { label: v.eco, date: date(ZBE_PHASE2) })}</CheckRow>
      ) : zbe.status === "authorised" ? (
        <CheckRow tone="ok" icon={leaf}>
          {fill(d.checks.zbeAuthorised, { date: lastDay })}
        </CheckRow>
      ) : zbe.until ? (
        // B: allowed today, banned once phase 2 starts.
        <CheckRow tone="warn">{fill(d.checks.zbeSoon, { label: v.eco, date: lastDay })}</CheckRow>
      ) : (
        <CheckRow tone="ok" icon={leaf}>
          {fill(d.checks.zbeOk, { label: v.eco })}
        </CheckRow>
      )}
      {touchesZfe(load) ? (
        <CheckRow tone="info" icon={leaf}>
          {d.checks.zfe}
        </CheckRow>
      ) : null}
      {!touchesZbe(load) && !touchesZfe(load) ? (
        <CheckRow tone="ok" icon={leaf}>
          {d.checks.zbeNone}
        </CheckRow>
      ) : null}

      {carrier && scope !== "domestic" ? (
        verdict?.licence.includes("communityLicence") || (!v && carrier.licence !== "community") ? (
          <CheckRow tone="bad">{d.checks.licenceMissing.replace("{{carrier}}", carrier.name).replace("{{name}}", licenceLocalName(carrier))}</CheckRow>
        ) : (
          <CheckRow tone="ok" icon={shield}>
            {d.checks.licenceOk.replace("{{name}}", licenceLocalName(carrier))}
          </CheckRow>
        )
      ) : null}
      {verdict?.licence.includes("tachograph") ? <CheckRow tone="bad">{d.checks.tachographMissing}</CheckRow> : null}

      {scope === "cabotage" ? (
        !cab ? (
          <CheckRow tone="info" icon={shield}>
            {d.checks.cabotagePick.replace("{{where}}", where)}
          </CheckRow>
        ) : cab.block === "coolingOff" && cab.coolingOffUntil ? (
          <CheckRow tone="bad">{d.checks.cabotageCooling.replace("{{where}}", where).replace("{{date}}", day(cab.coolingOffUntil))}</CheckRow>
        ) : cab.block === "noIncoming" ? (
          <CheckRow tone="bad">{d.checks.cabotageNoIncoming.replace("{{where}}", where)}</CheckRow>
        ) : cab.block === "window" && cab.windowEnds ? (
          <CheckRow tone="bad">{d.checks.cabotageWindow.replace("{{where}}", where).replace("{{date}}", day(cab.windowEnds))}</CheckRow>
        ) : cab.block === "limit" ? (
          <CheckRow tone="bad">{d.checks.cabotageFull.replace("{{where}}", where)}</CheckRow>
        ) : (
          <CheckRow tone="ok" icon={shield}>
            {d.checks.cabotageOk
              .replace("{{where}}", where)
              .replace("{{n}}", String(cab.used + 1))
              .replace("{{date}}", cab.windowEnds ? day(cab.windowEnds) : "")}
          </CheckRow>
        )
      ) : (
        <CheckRow tone="ok" icon={shield}>
          {d.checks.cabotageNone}
        </CheckRow>
      )}
      {carrier && needsPostingDeclaration(load, carrier.country) ? (
        <CheckRow tone="info" icon={<UserRound className="size-4" aria-hidden />}>
          {d.checks.posting}
        </CheckRow>
      ) : null}

      {crosses ? (
        <CheckRow tone="info" icon={shield}>
          {d.checks.border}
        </CheckRow>
      ) : null}
      <DocRows doc={doc} />
    </ul>
  );
}

function DocRows({ doc }: { doc: ReturnType<typeof transportDocument> }) {
  const { d } = useI18n();
  const icon = <FileCheck className="size-4" aria-hidden />;
  if (doc.exemptions.length) {
    const reason = doc.exemptions.map((e) => ({ noLicence: d.checks.exemptNoLicence, removal: d.checks.exemptRemoval, parcels: d.checks.exemptParcels })[e]).join(", ");
    return (
      <CheckRow tone="info" icon={icon}>
        {d.checks.docExempt.replace("{{reason}}", reason)}
      </CheckRow>
    );
  }
  const issuer = { shipperAndCarrier: d.checks.issuerShipperAndCarrier, sender: d.checks.issuerSender, carrier: d.checks.issuerCarrier }[doc.issuer];
  const medium = { required: d.checks.electronicRequired, optional: d.checks.electronicOptional, byAgreement: d.checks.electronicByAgreement }[doc.electronic];
  return (
    <>
      <CheckRow tone="info" icon={icon}>
        {d.checks.doc.replace("{{doc}}", docName(doc.kind, d)).replace("{{issuer}}", issuer)} · {medium}
      </CheckRow>
      {doc.cabotage && doc.kind === "lettre" ? (
        <CheckRow tone="info" icon={icon}>
          {d.checks.docCabotage}
        </CheckRow>
      ) : null}
    </>
  );
}

// ── The consignment note ────────────────────────────────────────────────────

const STEPS: EcmrState[] = ["draft", "shipper", "carrier", "delivered"];

/** The consignment note (DeCA, CMR or lettre de voiture), step by step. */
export function EcmrTimeline({ load }: { load: Pick<Load, "from" | "to" | "ecmr" | "pickupAt" | "carrierId"> & Partial<Pick<Load, "departedAt">> }) {
  const { d } = useI18n();
  const carrier = load.carrierId ? CARRIER.get(load.carrierId) : undefined;
  const doc = transportDocument(load, { at: load.departedAt ?? load.pickupAt, carrierCountry: carrier?.country });
  const at = STEPS.indexOf(load.ecmr);
  const labels = [d.ecmr.stepDraft, d.ecmr.stepShipper, d.ecmr.stepCarrier, d.ecmr.stepConsignee];
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.8rem] font-semibold text-ink">{docName(doc.kind, d)}</span>
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
