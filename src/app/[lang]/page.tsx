import {
  ArrowRight,
  Boxes,
  CalendarClock,
  Gavel,
  Languages,
  Map as MapIcon,
  Package,
  Radio,
  Repeat,
  Route,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CorridorArt } from "@/components/landing/corridor-art";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { CARRIERS } from "@/data/companies";
import { PLACE_IDS, PLACES, type PlaceId } from "@/data/places";
import { isLocale, LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { getDict } from "@/i18n/get-dict";
import { fill } from "@/lib/utils";

const HUBS: PlaceId[] = ["donostia", "pasaia", "irun", "hendaye", "biarritz", "bayonne"];

export default async function Landing({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const d = getDict(lang);
  const L = d.landing;
  const app = `/${lang}/app`;

  const roles = [
    { id: "shipper", icon: Package, href: `${app}/post?as=shipper`, title: d.roles.shipper, body: d.roles.shipperDesc, tone: "text-accent-text bg-accent-soft" },
    { id: "carrier", icon: Truck, href: `${app}/loads?as=carrier`, title: d.roles.carrier, body: d.roles.carrierDesc, tone: "text-signal bg-signal-soft" },
    { id: "dispatcher", icon: Radio, href: `${app}?as=dispatcher`, title: d.roles.dispatcher, body: d.roles.dispatcherDesc, tone: "text-blue bg-blue-soft" },
    { id: "warehouse", icon: Warehouse, href: `${app}/warehouse?as=warehouse`, title: d.roles.warehouse, body: d.roles.warehouseDesc, tone: "text-violet bg-violet-soft" },
  ];
  const features = [
    { icon: Gavel, title: L.fBoardTitle, body: L.fBoardBody, tone: "text-accent-text bg-accent-soft" },
    { icon: Repeat, title: L.fReturnsTitle, body: L.fReturnsBody, tone: "text-lime bg-lime-soft" },
    { icon: MapIcon, title: L.fMapTitle, body: L.fMapBody, tone: "text-signal bg-signal-soft" },
    { icon: Boxes, title: L.fTwinTitle, body: L.fTwinBody, tone: "text-violet bg-violet-soft" },
    { icon: CalendarClock, title: L.fDocksTitle, body: L.fDocksBody, tone: "text-blue bg-blue-soft" },
    { icon: ShieldCheck, title: L.fRulesTitle, body: L.fRulesBody, tone: "text-green bg-green-soft" },
  ];
  // What the demo contains, not traction: the carriers are fictional and −30 % is
  // the return-trip discount the price model assumes (issue #12).
  const stats = [
    { v: String(PLACE_IDS.length), l: L.statPlaces },
    { v: String(CARRIERS.length), l: L.statCarriers },
    { v: fill(d.map.discount, { pct: 30 }), l: L.statReturn },
  ];
  const steps = [
    { n: "01", title: L.how1Title, body: L.how1Body },
    { n: "02", title: L.how2Title, body: L.how2Body },
    { n: "03", title: L.how3Title, body: L.how3Body },
  ];

  return (
    <div className="relative overflow-x-clip">
      <SiteHeader lang={lang} d={d} />

      <main>
        {/* Hero */}
        <section className="relative">
          {/* Backdrop. The glow is never wider than the page, so nothing here needs clipping (issue #6). */}
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="grid-fade absolute inset-0 opacity-70" />
            <div className="absolute -top-40 left-1/2 aspect-square w-[min(42rem,100%)] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
          </div>
          {/* grid-cols-1 (a minmax(0, 1fr) track): an implicit `auto` column would grow to its widest unbreakable line. */}
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 pt-10 pb-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:pt-16 lg:pb-20">
            <div className="z-rise min-w-0">
              <p className="inline-flex max-w-full items-start gap-2 rounded-2xl border border-line bg-surface px-3 py-1 text-xs leading-5 font-semibold text-ink-2 shadow-card sm:items-center sm:rounded-full">
                <span className="relative mt-1.5 flex size-2 shrink-0 sm:mt-0">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-signal opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-signal" />
                </span>
                <span className="min-w-0 sm:truncate">{L.eyebrow}</span>
              </p>
              <h1 className="mt-5 text-[2.35rem] leading-[1.05] font-extrabold tracking-tight text-balance break-words text-ink sm:text-5xl lg:text-[3.6rem]">
                {L.title}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-pretty text-ink-2 sm:text-lg">{L.lead}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href={app}
                  className="inline-flex min-h-12 max-w-full items-center gap-2 rounded-xl bg-accent px-5 py-2 text-[0.95rem] font-bold text-accent-ink shadow-card transition hover:bg-accent-hover"
                >
                  {L.ctaPrimary}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link
                  href={`${app}/post?as=shipper`}
                  className="inline-flex min-h-12 max-w-full items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-2 text-[0.95rem] font-semibold text-ink transition hover:border-ink-3"
                >
                  <Package className="size-4" aria-hidden />
                  {L.ctaSecondary}
                </Link>
              </div>
            </div>
            <div className="z-rise min-w-0" style={{ animationDelay: "0.1s" }}>
              <CorridorArt lang={lang} d={d} />
            </div>
          </div>
        </section>

        {/* In the demo: what the simulation contains */}
        <section aria-labelledby="demo-stats" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:gap-10 sm:px-6">
            <h2 id="demo-stats" className="shrink-0 text-xs font-bold tracking-wide text-ink-3 uppercase">
              {L.statsTitle}
            </h2>
            <dl className="grid flex-1 grid-cols-3 gap-4 sm:gap-8">
              {stats.map((s) => (
                <div key={s.l} className="flex min-w-0 flex-col-reverse justify-end">
                  <dt className="mt-1 text-sm leading-snug text-ink-3">{s.l}</dt>
                  <dd className="tnum text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Roles */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{L.rolesTitle}</h2>
          <p className="mt-2 max-w-2xl text-ink-2">{L.rolesLead}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {roles.map((r) => (
              <Link
                key={r.id}
                href={r.href}
                className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-line-strong"
              >
                <span className={`inline-flex size-11 items-center justify-center rounded-xl ${r.tone}`}>
                  <r.icon className="size-5" aria-hidden />
                </span>
                <span className="mt-4 text-lg font-bold text-ink">{r.title}</span>
                <span className="mt-1 flex-1 text-sm leading-relaxed text-ink-2">{r.body}</span>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text">
                  {fill(d.roles.enter, { role: r.title.toLowerCase() })}
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-line bg-surface-2/60">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{L.featuresTitle}</h2>
            <p className="mt-2 max-w-2xl text-ink-2">{L.featuresLead}</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <article key={f.title} className="rounded-2xl border border-line bg-surface p-6 shadow-card">
                  <span className={`inline-flex size-10 items-center justify-center rounded-xl ${f.tone}`}>
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[1.05rem] font-bold text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{L.howTitle}</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-line bg-surface p-6">
                <span className="font-mono text-sm font-semibold text-accent-text">{s.n}</span>
                <h3 className="mt-2 text-lg font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Corridor + languages */}
        <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-16 sm:px-6 lg:grid-cols-2">
          <article className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-signal-soft text-signal">
              <Route className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-extrabold tracking-tight text-ink">{L.corridorTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{L.corridorLead}</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {HUBS.map((h) => (
                <li key={h} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm font-medium text-ink">
                  {PLACES[h].names[lang]}
                  <span className="ml-1.5 text-xs text-ink-3">{PLACES[h].country}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm font-medium text-ink-3">{L.corridorNext}</p>
          </article>
          <article className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-blue-soft text-blue">
              <Languages className="size-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-extrabold tracking-tight text-ink">{L.langTitle}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{L.langLead}</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {LOCALES.map((l) => (
                <li key={l}>
                  <Link
                    href={`/${l}`}
                    lang={l}
                    aria-current={l === lang ? "page" : undefined}
                    className="inline-flex items-center rounded-full border border-line bg-surface-2 px-3 py-1 text-sm font-medium text-ink transition hover:border-line-strong aria-[current=page]:border-accent aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-text"
                  >
                    {LOCALE_NAMES[l]}
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        </section>
      </main>

      <SiteFooter lang={lang} d={d} />
    </div>
  );
}
